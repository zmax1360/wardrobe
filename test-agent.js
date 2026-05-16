/**
 * TEST AGENT
 * ----------
 * Reads:  tickets/TICKET-XXX.json (status = "code_ready")
 * Does:   reads changed files, validates against acceptance criteria via Claude
 * Writes: updates ticket with test results, status = "tests_passed" or "tests_failed"
 *
 * Run: node agents/test-agent.js TICKET-001
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

function getTargetTicket() {
  const arg = process.argv[2];
  if (arg) return arg;

  const files = fs.readdirSync(TICKETS_DIR).filter((f) => f.endsWith(".json") && f.startsWith("TICKET-"));
  for (const file of files.sort()) {
    const ticket = JSON.parse(fs.readFileSync(path.join(TICKETS_DIR, file), "utf8"));
    if (ticket.status === "code_ready") return ticket.ticket_id;
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
      max_tokens: 2000,
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
    console.log("ℹ️  No ticket with status code_ready found. Nothing to do.");
    process.exit(0);
  }

  const ticketPath = path.join(TICKETS_DIR, `${ticketId}.json`);
  const ticket = JSON.parse(fs.readFileSync(ticketPath, "utf8"));

  console.log(`🧪 Test Agent validating: ${ticketId} — "${ticket.title}"`);

  // Checkout the feature branch
  if (ticket.branch) {
    git(`fetch origin`);
    git(`checkout ${ticket.branch}`);
    console.log(`🌿 Checked out branch: ${ticket.branch}`);
  }

  // Read changed files
  const fileContents = {};
  for (const file of ticket.files_changed || []) {
    const fullPath = path.join(REPO_ROOT, file);
    if (fs.existsSync(fullPath)) {
      fileContents[file] = fs.readFileSync(fullPath, "utf8");
      console.log(`📄 Read: ${file}`);
    }
  }

  const systemPrompt = `You are a senior QA engineer and code reviewer for Fashion OS, a React/Node.js personal fashion app.
You review code changes and validate them against acceptance criteria.
You are thorough, precise, and honest. If something doesn't pass, you say exactly why.`;

  const filesBlock = Object.entries(fileContents)
    .map(([file, content]) => `=== ${file} ===\n${content}`)
    .join("\n\n");

  const userPrompt = `
Review the following code changes for ticket ${ticketId}.

TITLE: ${ticket.title}
DEV SUMMARY: ${ticket.dev_summary}

ACCEPTANCE CRITERIA TO VALIDATE:
${ticket.acceptance_criteria.map((a, i) => `${i + 1}. ${a}`).join("\n")}

TEST CASES TO CHECK:
${(ticket.test_cases || []).map((t, i) => `${i + 1}. ${t}`).join("\n")}

CHANGED FILES:
${filesBlock || "No files provided"}

---

Validate each acceptance criterion against the code. Return ONLY valid JSON (no markdown, no backticks):

{
  "overall": "passed" or "failed",
  "summary": "one sentence overall verdict",
  "results": [
    {
      "criterion": "the acceptance criterion text",
      "status": "passed" or "failed" or "cannot_verify",
      "reason": "brief explanation"
    }
  ],
  "issues": [
    "specific issue 1 if any",
    "specific issue 2 if any"
  ],
  "kickback_comment": "if failed: specific instruction for dev agent to fix (empty string if passed)"
}
`;

  console.log("🤖 Calling Claude API for validation...");
  const raw = await callClaude(systemPrompt, userPrompt);

  let result;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    result = JSON.parse(clean);
  } catch (e) {
    console.error("❌ Failed to parse test agent response:", raw.substring(0, 500));
    process.exit(1);
  }

  // Update ticket
  ticket.test_results = result;
  ticket.tested_at = new Date().toISOString();
  ticket.from_agent = "test";

  const passed = result.overall === "passed";

  if (passed) {
    ticket.status = "tests_passed";
    ticket.to_agent = "human_review";
    console.log(`\n✅ ALL TESTS PASSED`);
    console.log(`📋 ${result.summary}`);
    console.log(`\n➡️  Ready for your review: ${ticket.branch}`);
    console.log(`   PR: https://github.com/zmax1360/wardrobe/compare/${ticket.branch}`);
  } else {
    ticket.status = "tests_failed";
    ticket.to_agent = "dev";
    ticket.kickback_comment = result.kickback_comment;
    console.log(`\n❌ TESTS FAILED`);
    console.log(`📋 ${result.summary}`);
    if (result.issues.length > 0) {
      console.log(`\n🐛 Issues:`);
      result.issues.forEach((issue) => console.log(`   - ${issue}`));
    }
    console.log(`\n↩️  Kicking back to Dev Agent: "${result.kickback_comment}"`);
  }

  // Print per-criterion results
  console.log(`\n📊 Criteria breakdown:`);
  result.results.forEach((r) => {
    const icon = r.status === "passed" ? "✅" : r.status === "failed" ? "❌" : "⚠️";
    console.log(`   ${icon} ${r.criterion}`);
    if (r.reason) console.log(`      → ${r.reason}`);
  });

  fs.writeFileSync(ticketPath, JSON.stringify(ticket, null, 2));

  // Commit updated ticket
  git(`add tickets/${ticketId}.json`);
  git(`commit -m "test: ${passed ? "pass" : "fail"} ${ticketId} validation"`);
  git(`push origin ${ticket.branch}`);

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Test agent failed:", err);
  process.exit(1);
});
