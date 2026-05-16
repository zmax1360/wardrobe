/**
 * REQUIREMENTS AGENT
 * ------------------
 * Reads: agents/inbox/idea.json
 * Writes: tickets/TICKET-XXX.json with status = "requirements_ready"
 *
 * Run: node agents/requirements-agent.js
 */

const fs = require("fs");
const path = require("path");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TICKETS_DIR = path.join(__dirname, "../tickets");
const INBOX_FILE = path.join(__dirname, "inbox/idea.json");

if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY not set");
  process.exit(1);
}

function getNextTicketId() {
  if (!fs.existsSync(TICKETS_DIR)) fs.mkdirSync(TICKETS_DIR, { recursive: true });
  const files = fs.readdirSync(TICKETS_DIR).filter((f) => f.startsWith("TICKET-"));
  if (files.length === 0) return "TICKET-001";
  const nums = files.map((f) => parseInt(f.replace("TICKET-", "").replace(".json", "")));
  const next = Math.max(...nums) + 1;
  return `TICKET-${String(next).padStart(3, "0")}`;
}

async function callClaude(prompt) {
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
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function main() {
  // Read idea from inbox
  if (!fs.existsSync(INBOX_FILE)) {
    console.error(`❌ No idea found at ${INBOX_FILE}`);
    console.error("Create agents/inbox/idea.json with: { \"idea\": \"your idea here\" }");
    process.exit(1);
  }

  const inbox = JSON.parse(fs.readFileSync(INBOX_FILE, "utf8"));
  const idea = inbox.idea;
  console.log(`💡 Processing idea: "${idea}"`);

  const ticketId = getNextTicketId();
  console.log(`🎫 Ticket ID: ${ticketId}`);

  // Ask Claude to generate structured requirements
  const prompt = `
You are a business analyst for a React + Node/Express web app called Fashion OS (a personal fashion management app).
The app repo is at github.com/zmax1360/wardrobe.

A developer has submitted this idea/request:
"${idea}"

Your job is to generate a structured ticket in JSON format.

Return ONLY valid JSON, no markdown, no explanation, no backticks. Exactly this structure:

{
  "ticket_id": "${ticketId}",
  "title": "short title",
  "idea": "${idea}",
  "status": "requirements_ready",
  "created_at": "${new Date().toISOString()}",
  "from_agent": "requirements",
  "to_agent": "dev",
  "requirements": [
    "requirement 1",
    "requirement 2"
  ],
  "acceptance_criteria": [
    "Given X when Y then Z",
    "Given X when Y then Z"
  ],
  "dev_tasks": [
    "specific dev task 1",
    "specific dev task 2"
  ],
  "files_likely_affected": [
    "src/App.js"
  ],
  "test_cases": [
    "test case 1",
    "test case 2"
  ],
  "notes": "any important context or caveats"
}
`;

  const raw = await callClaude(prompt);

  let ticket;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    ticket = JSON.parse(clean);
  } catch (e) {
    console.error("❌ Failed to parse Claude response as JSON:", raw);
    process.exit(1);
  }

  // Write ticket
  const ticketPath = path.join(TICKETS_DIR, `${ticketId}.json`);
  fs.writeFileSync(ticketPath, JSON.stringify(ticket, null, 2));
  console.log(`✅ Ticket written: ${ticketPath}`);
  console.log(`📋 Requirements: ${ticket.requirements.length} items`);
  console.log(`✔️  Acceptance criteria: ${ticket.acceptance_criteria.length} items`);
  console.log(`🔨 Dev tasks: ${ticket.dev_tasks.length} items`);
  console.log(`\n➡️  Next: Dev Agent will pick up ${ticketId}`);

  // Clear inbox
  fs.writeFileSync(INBOX_FILE, JSON.stringify({ idea: "", processed: true, ticket_id: ticketId }, null, 2));
}

main().catch((err) => {
  console.error("❌ Requirements agent failed:", err);
  process.exit(1);
});
