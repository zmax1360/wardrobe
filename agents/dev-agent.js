const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TICKETS_DIR = path.join(__dirname, 'tickets');
const BACKUPS_DIR = path.join(__dirname, 'backups');

const BLOCKLIST = [
  '.env',
  'firebase.js',
  'src/firebase.js',
  'vercel.json',
  'package.json',
  'package-lock.json',
  'agents/',
  '.github/'
];

function isBlocked(filePath) {
  return BLOCKLIST.some(b => filePath === b || filePath.startsWith(b));
}

function getLatestTicket() {
  if (!fs.existsSync(TICKETS_DIR)) {
    console.error('❌ No tickets directory found');
    process.exit(1);
  }
  const files = fs.readdirSync(TICKETS_DIR)
    .filter(f => f.endsWith('-ticket.json'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(TICKETS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) {
    console.error('❌ No ticket files found in agents/tickets/');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(path.join(TICKETS_DIR, files[0].name), 'utf8'));
}

function branchSlug(id) {
  return String(id || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56) || 'ticket';
}

function buildPushUrl(token) {
  const u = execSync('git config --get remote.origin.url', {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();

  let host = 'github.com';
  let owner;
  let repo;

  const ssh = u.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  const httpsClean = u.replace(/^https:\/\/[^@]+@/i, 'https://');
  const https = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(httpsClean);

  if (ssh) {
    host = ssh[1];
    owner = ssh[2];
    repo = ssh[3].replace(/\.git$/i, '');
  } else if (https) {
    host = https[1];
    owner = https[2];
    repo = https[3].replace(/\.git$/i, '');
  } else {
    return null;
  }

  const tok = encodeURIComponent(String(token).trim());
  return `https://x-access-token:${tok}@${host}/${owner}/${repo}.git`;
}

async function generateCode(filePath, currentContent, ticket) {
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
      system: `You are a senior React/Node.js engineer working on Fashion OS — a wardrobe management app.
Stack: React, Firebase, Node/Express, Anthropic API, Vercel serverless.
You will be given the current content of a file and a ticket describing what to change.
Respond with ONLY the complete new file content. No explanation, no markdown fences, no commentary.`,
      messages: [{
        role: 'user',
        content: `Ticket: ${JSON.stringify(ticket)}\n\nCurrent file (${filePath}):\n${currentContent}`
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.content.map(b => b.text || '').join('').replace(/```[a-z]*\n?|```/g, '').trim();
}

async function main() {
  const ticket = getLatestTicket();
  console.log(`📋 Processing ticket: ${ticket.id} — ${ticket.title}`);

  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const modifiedFiles = [];
  const backups = [];

  for (const filePath of (ticket.files_to_modify || [])) {
    if (isBlocked(filePath)) {
      console.warn(`⚠️ Skipping blocked file: ${filePath}`);
      continue;
    }
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ File not found, skipping: ${filePath}`);
      continue;
    }

    const original = fs.readFileSync(filePath, 'utf8');
    const backupPath = path.join(BACKUPS_DIR, `${path.basename(filePath)}.${Date.now()}.bak`);
    fs.writeFileSync(backupPath, original);
    backups.push({ filePath, backupPath, original });
    console.log(`💾 Backed up: ${filePath} → ${backupPath}`);

    let newContent;
    try {
      newContent = await generateCode(filePath, original, ticket);
    } catch (e) {
      console.error(`❌ Code generation failed for ${filePath}:`, e.message);
      fs.writeFileSync(filePath, original);
      process.exit(1);
    }

    if (Buffer.byteLength(newContent) < Buffer.byteLength(original) * 0.6) {
      console.error(`❌ Size check failed for ${filePath} — new content too small, restoring backup`);
      fs.writeFileSync(filePath, original);
      process.exit(1);
    }

    fs.writeFileSync(filePath, newContent);
    modifiedFiles.push(filePath);
    console.log(`✏️ Modified: ${filePath}`);
  }

  if (!modifiedFiles.length) {
    console.error('❌ No files were modified');
    process.exit(1);
  }

  try {
    execSync('npm run build', { stdio: 'inherit', cwd: ROOT });
  } catch (e) {
    console.error('❌ Build failed — restoring backups');
    for (const { filePath, original } of backups) {
      fs.writeFileSync(filePath, original);
    }
    process.exit(1);
  }

  const token = process.env.PIPELINE_TOKEN;
  if (!token || !String(token).trim()) {
    console.error('❌ PIPELINE_TOKEN is not set');
    for (const { filePath, original } of backups) {
      fs.writeFileSync(filePath, original);
    }
    process.exit(1);
  }

  const pushUrl = buildPushUrl(token);
  if (!pushUrl) {
    console.error('❌ Could not parse remote.origin.url for push');
    for (const { filePath, original } of backups) {
      fs.writeFileSync(filePath, original);
    }
    process.exit(1);
  }

  const featBranch = `feature/${branchSlug(ticket.id)}`;

  execFileSync('git', ['config', 'user.email', 'agent@fashionos.ai'], { stdio: 'inherit', cwd: ROOT });
  execFileSync('git', ['config', 'user.name', 'Fashion OS Dev Agent'], { stdio: 'inherit', cwd: ROOT });

  try {
    execFileSync('git', ['checkout', '-b', featBranch], { stdio: 'inherit', cwd: ROOT });
  } catch {
    execFileSync('git', ['checkout', featBranch], { stdio: 'inherit', cwd: ROOT });
  }

  for (const f of modifiedFiles) {
    execFileSync('git', ['add', '--', f], { stdio: 'inherit', cwd: ROOT });
  }

  const rawTitle = String(ticket.title || 'update').trim().slice(0, 200);
  execFileSync('git', ['commit', '-m', `feat: ${rawTitle} [agent]`], { stdio: 'inherit', cwd: ROOT });

  const pushRefspec = `HEAD:refs/heads/${featBranch}`;
  execFileSync('git', ['push', '--set-upstream', pushUrl, pushRefspec], { stdio: 'inherit', cwd: ROOT });

  console.log(`✅ Dev agent complete. Branch: ${featBranch}`);
}

main();
