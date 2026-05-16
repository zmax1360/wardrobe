/**
 * DEV AGENT
 * ---------
 * Reads:  tickets/TICKET-XXX.json (status = "requirements_ready")
 * Does:   calls Claude API to generate code changes
 * Writes: actual code files, updates ticket status = "code_ready"
 * Git:    creates feature branch, commits changes
 *
 * Run: node agents/dev-agent.js TICKET-001
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TICKETS_DIR = path.join(__dirname, "../tickets");
const REPO_ROOT = path.join(__dirname, "..");

if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY not set");
  process.exit(1);
}

// Get ticket ID from args or find the first ready ticket
function getTargetTicket() {
  const arg = process.argv[2];
  if (arg) return arg;

  // Auto-find first requirements_ready ticket
  const files = fs.readdirSync(TICKETS_DIR).filter((f) => f.endsWith(".json") && f.startsWith("TICKET-"));
  for (const file of files.sort()) {
    const ticket = JSON.parse(fs.readFileSync(path.join(TICKETS_DIR, file), "utf8"));
    if (ticket.status === "requirements_ready") return ticket.ticket_id;
  }
  return null;
}

async function callClaude(systemPrompt, userPrompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

function readSourceFile(filePath) {
  const fullPath = path.join(REPO_ROOT, filePath);
  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath, "utf8");
  }
  return null;
}

function git(cmd) {
  try {
    return execSync(`git -C "${REPO_ROOT}" ${cmd}`, { encoding: "utf8" }).trim();
  } catch (e) {
    console.warn(`⚠️  git ${cmd} failed: ${e.message}`);
    return null;
  }
}

async function main() {
  const ticketId = getTargetTicket();
  if (!ticketId) {
    console.log("ℹ️  No ticket with status requirements_ready found. Nothing to do.");
    process.exit(0);
  }

  const ticketPath = path.join(TICKETS_DIR, `${ticketId}.json`);
  if (!fs.existsSync(ticketPath)) {
    console.error(`❌ Ticket not found: ${ticketPath}`);
    process.exit(1);
  }

  const ticket = JSON.parse(fs.readFileSync(ticketPath, "utf8"));
  console.log(`🔨 Dev Agent processing: ${ticketId} — "${ticket.title}"`);

  // Read relevant source files
  const sourceContext = {};
  for (const file of ticket.files_likely_affected || ["src/App.js"]) {
    const content = readSourceFile(file);
    if (content) {
      sourceContext[file] = content;
      console.log(`📄 Read source: ${file} (${content.length} chars)`);
    } else {
      console.warn(`⚠️  File not found: ${file}`);
    }
  }

  const systemPrompt = `You are a senior React/Node.js developer working on Fashion OS, a personal fashion management web app.
Tech stack: React (Create React App), Node/Express backend (server.js), localStorage for data, Claude API for AI features.
Repo root has: src/App.js (main UI), server.js (Express image server), public/wardrobe-images/.
You write clean, minimal, correct code changes. No unnecessary refactoring. Only change what's needed.`;

  const sourceBlock = Object.entries(sourceContext)
    .map(([file, content]) => `=== ${file} ===\n${content}`)
    .join("\n\n");

  const userPrompt = `
You need to implement the following ticket:

TICKET: ${ticket.ticket_id}
TITLE: ${ticket.title}
IDEA: ${ticket.idea}

REQUIREMENTS:
${ticket.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}

ACCEPTANCE CRITERIA:
${ticket.acceptance_criteria.map((a, i) => `${i + 1}. ${a}`).join("\n")}

DEV TASKS:
${ticket.dev_tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}

NOTES: ${ticket.notes || "none"}

CURRENT SOURCE FILES:
${sourceBlock || "No source files found — generate new files as needed."}

---

Return ONLY a JSON object (no markdown, no backticks) with this structure:

{
  "summary": "one sentence describing what you changed",
  "changes": [
    {
      "file": "relative/path/to/file.js",
      "action": "modify",
      "content": "FULL FILE CONTENT HERE (not a diff, the complete file)"
    }
  ],
  "commit_message": "type: short description (TICKET-XXX)"
}

For "action" use: "modify" (existing file), "create" (new file).
Always return the COMPLETE file content, never a partial diff.
`;

  console.log("🤖 Calling Claude API for code generation...");
  const raw = await callClaude(systemPrompt, userPrompt);

  let result;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    result = JSON.parse(clean);
  } catch (e) {
    console.error("❌ Failed to parse dev agent response:", raw.substring(0, 500));
    process.exit(1);
  }

  console.log(`📝 Summary: ${result.summary}`);
  console.log(`📁 Files to change: ${result.changes.length}`);

  // Create feature branch
  const branch = `feature/${ticketId.toLowerCase()}`;
  git(`checkout main`);
  git(`pull origin main`);
  git(`checkout -b ${branch}`);
  console.log(`🌿 Branch: ${branch}`);

  // Write the files
  for (const change of result.changes) {
    const fullPath = path.join(REPO_ROOT, change.file);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, change.content, "utf8");
    console.log(`✏️  ${change.action}: ${change.file}`);
  }

  // Update ticket
  ticket.status = "code_ready";
  ticket.from_agent = "dev";
  ticket.to_agent = "test";
  ticket.branch = branch;
  ticket.commit_message = result.commit_message;
  ticket.dev_summary = result.summary;
  ticket.files_changed = result.changes.map((c) => c.file);
  ticket.code_ready_at = new Date().toISOString();
  fs.writeFileSync(ticketPath, JSON.stringify(ticket, null, 2));

  // Git commit
  git(`add -A`);
  git(`commit -m "${result.commit_message}"`);
  git(`push origin ${branch}`);

  console.log(`\n✅ Code committed and pushed to ${branch}`);
  console.log(`➡️  Next: Test Agent will validate ${ticketId}`);
}

main().catch((err) => {
  console.error("❌ Dev agent failed:", err);
  process.exit(1);
});
