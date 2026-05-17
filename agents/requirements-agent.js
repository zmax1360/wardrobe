const fs = require('fs');
const path = require('path');

const INBOX = path.join(__dirname, 'inbox/idea.json');
const TICKETS_DIR = path.join(__dirname, 'tickets');

async function main() {
  if (!fs.existsSync(INBOX)) {
    console.error('❌ Missing agents/inbox/idea.json');
    process.exit(1);
  }

  const raw = fs.readFileSync(INBOX, 'utf8').trim();
  if (!raw) {
    console.error('❌ agents/inbox/idea.json is empty');
    process.exit(1);
  }

  let idea;
  try {
    idea = JSON.parse(raw);
  } catch (e) {
    console.error('❌ Invalid JSON in idea.json:', e.message);
    process.exit(1);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are a senior product engineer. Convert the following feature idea into a structured development ticket.
Respond with ONLY valid JSON — no markdown, no explanation, no code fences.
Schema: { "id": "<timestamp string>", "created": "<ISO date>", "title": "<short title>", "description": "<what to build>", "files_to_modify": ["<path1>"], "acceptance_criteria": ["<criterion>"], "estimated_complexity": "low" | "medium" | "high" }
files_to_modify must contain at most 2 paths.`,
      messages: [{ role: 'user', content: JSON.stringify(idea) }]
    })
  });

  if (!response.ok) {
    console.error('❌ Anthropic API error:', response.status, await response.text());
    process.exit(1);
  }

  const data = await response.json();
  const text = data.content.map(b => b.text || '').join('');

  let ticket;
  try {
    ticket = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('❌ Failed to parse Claude response as JSON:', text);
    process.exit(1);
  }

  ticket.id = ticket.id || String(Date.now());
  ticket.created = ticket.created || new Date().toISOString();

  if (!fs.existsSync(TICKETS_DIR)) fs.mkdirSync(TICKETS_DIR, { recursive: true });

  const outPath = path.join(TICKETS_DIR, `${ticket.id}-ticket.json`);
  fs.writeFileSync(outPath, JSON.stringify(ticket, null, 2));
  console.log(`✅ Ticket written: ${outPath}`);
}

main();
