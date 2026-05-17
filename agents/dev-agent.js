/**
 * Reads latest ticket under agents/tickets/, applies Claude edits with blocklist/backups/size checks,
 * runs npm build, commits, pushes to feature/<ticket-id> using PIPELINE_TOKEN.
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const TICKETS_DIR = path.join(__dirname, "tickets");
const BACKUPS_DIR = path.join(__dirname, "backups");

const MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are a senior React/Node.js engineer working on Fashion OS — a wardrobe management app.
Stack: React, Firebase, Node/Express, Anthropic API, Vercel serverless.
You will be given the current content of a file and a ticket describing what to change.
Respond with ONLY the complete new file content. No explanation, no markdown fences, no commentary.`;

function normalizeRel(repoRoot, rawPath) {
  const resolved = path.resolve(repoRoot, String(rawPath).trim());
  const rel = path.relative(repoRoot, resolved);
  if (rel.startsWith("..")) return null;
  return rel.split(path.sep).join("/");
}

/** Blocklisted paths cannot be edited (ticket targets under agents/backups exempt by not being targets). */
function isBlocklisted(relPosix) {
  if (!relPosix || typeof relPosix !== "string") return true;

  let p = relPosix.trim().replace(/^\.\//, "");
  p = path.normalize(p).split(path.sep).join("/");

  if (p === ".env" || p.endsWith("/.env")) return true;

  if (p === "firebase.js" || p === "src/firebase.js") return true;
  if (/\/firebase\.js$/i.test(p)) return true;

  if (p === "vercel.json" || /\/vercel\.json$/i.test(p)) return true;

  const seg = p.split("/");
  const base = seg[seg.length - 1];
  if (base === "package.json" || base === "package-lock.json") return true;

  if (p.startsWith("agents/")) return true;
  if (p.startsWith(".github/")) return true;

  return false;
}

function backupBasename(relPosix, ts) {
  const flat = relPosix.replace(/\//g, "__");
  return `${flat}.${ts}.bak`;
}

function stripFence(content) {
  let s = String(content ?? "").trim();
  if (/^```[a-zA-Z0-9]*\s*\n/.test(s) || /^```/.test(s)) {
    const firstNl = s.indexOf("\n");
    if (firstNl !== -1) {
      s = s.slice(firstNl + 1);
    }
    s = s.trimEnd();
    const lf = s.lastIndexOf("\n```");
    if (lf !== -1) {
      s = s.slice(0, lf).trimEnd();
    } else if (s.endsWith("```")) {
      const i = s.lastIndexOf("```");
      if (i !== -1) {
        s = s.slice(0, i).trimEnd();
      }
    }
  }
  return s.replace(/^\uFEFF/, "");
}

async function callClaudeForFile(system, userPayload) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": String(apiKey).trim(),
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userPayload }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic HTTP ${response.status}: ${body.slice(0, 1200)}`);
  }

  const data = await response.json();
  const parts = [];
  for (const block of data?.content || []) {
    if (block?.type === "text" && block?.text) parts.push(block.text);
  }
  return stripFence(parts.join("\n"));
}

function findLatestTicketFile() {
  if (!fs.existsSync(TICKETS_DIR)) return null;
  const names = fs.readdirSync(TICKETS_DIR).filter((n) => n.endsWith(".json"));
  if (!names.length) return null;

  let best = null;
  let bestM = -1;
  for (const n of names) {
    const fp = path.join(TICKETS_DIR, n);
    const st = fs.statSync(fp);
    const m = st.mtimeMs;
    if (m >= bestM) {
      bestM = m;
      best = fp;
    }
  }
  return best;
}

function branchSlug(id) {
  const s = String(id || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 56) || "ticket";
}

function buildAuthedPushUrl() {
  const token = process.env.PIPELINE_TOKEN;
  if (!token || !String(token).trim()) return null;

  let u = execSync("git config --get remote.origin.url", {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();

  let host = "github.com";
  let owner;
  let repo;

  const ssh = u.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  const httpsClean = u.replace(/^https:\/\/[^@]+@/i, "https://");
  const https =
    /^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(httpsClean);

  if (ssh) {
    host = ssh[1];
    owner = ssh[2];
    repo = ssh[3].replace(/\.git$/i, "");
  } else if (https) {
    owner = https[1];
    repo = https[2].replace(/\.git$/i, "");
  } else {
    return null;
  }

  const tok = encodeURIComponent(String(token).trim());
  return `https://x-access-token:${tok}@${host}/${owner}/${repo}.git`;
}

function restoreAll(backupsList) {
  for (const b of backupsList) {
    try {
      if (fs.existsSync(b.bakPath)) {
        fs.copyFileSync(b.bakPath, b.abs);
        fs.unlinkSync(b.bakPath);
      }
    } catch {
      /* ignore */
    }
  }
}

function deleteBackupsQuiet(backupsList) {
  for (const b of backupsList) {
    try {
      if (fs.existsSync(b.bakPath)) fs.unlinkSync(b.bakPath);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    console.error("[dev-agent] ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }

  let ticketPath = null;
  const slug = process.argv[2];
  if (slug && String(slug).trim() !== "none") {
    const base = stripExt(String(slug).trim(), ".json");
    const candidates = [`${base}.json`, `${base}-ticket.json`];
    for (const c of candidates) {
      const tp = path.join(TICKETS_DIR, c);
      if (fs.existsSync(tp)) {
        ticketPath = tp;
        break;
      }
    }
  }

  if (!ticketPath) ticketPath = findLatestTicketFile();

  if (!ticketPath || !fs.existsSync(ticketPath)) {
    console.error("[dev-agent] No ticket JSON found under agents/tickets/.");
    process.exit(1);
  }

  let ticket;
  try {
    ticket = JSON.parse(fs.readFileSync(ticketPath, "utf8"));
  } catch {
    console.error("[dev-agent] Failed to parse ticket:", ticketPath);
    process.exit(1);
  }

  const filesToModify =
    Array.isArray(ticket.files_to_modify) ? ticket.files_to_modify.map(String).filter(Boolean) : [];

  if (!filesToModify.length) {
    console.error("[dev-agent] Ticket has empty files_to_modify.");
    process.exit(1);
  }

  const ticketIdBranch = branchSlug(
    ticket.id || ticket.ticket_id || path.basename(ticketPath, ".json")
  );

  /** @type {{ abs: string, rel: string, bakPath: string }[]} */
  const backups = [];

  /** @type {string[]} */
  const touchedForCommit = [];

  const ts = `${Date.now()}`;

  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  for (const raw of filesToModify) {
    const rel = normalizeRel(REPO_ROOT, raw);
    if (!rel) {
      console.warn(`[dev-agent] Skip (outside repo or invalid path): ${raw}`);
      continue;
    }

    if (isBlocklisted(rel)) {
      console.warn(`[dev-agent] Blocklisted — skip: ${rel}`);
      continue;
    }

    const abs = path.join(REPO_ROOT, ...rel.split("/"));

    let original;
    if (!fs.existsSync(abs)) {
      console.warn(`[dev-agent] Missing file — skip: ${rel}`);
      continue;
    }

    try {
      original = fs.readFileSync(abs, "utf8");
    } catch {
      console.warn(`[dev-agent] Unreadable — skip: ${rel}`);
      continue;
    }

    const bakName = backupBasename(rel, ts);
    const bakPath = path.join(BACKUPS_DIR, bakName);

    fs.copyFileSync(abs, bakPath);
    backups.push({ abs, rel, bakPath });

    const criteria = Array.isArray(ticket.acceptance_criteria) ?
        ticket.acceptance_criteria.map(String).join("\n- ")
      : "";

    const userPayload = `Ticket ID: ${ticket.id || ""}
Title: ${ticket.title || ""}

Description:
${ticket.description || ""}

Acceptance criteria:
- ${criteria || "(none)"}

Modify this single file (${rel}). Output ONLY the complete new file for this path — nothing else.

----- BEGIN CURRENT FILE -----
${original}
----- END CURRENT FILE -----`;

    let newContent;
    try {
      newContent = await callClaudeForFile(SYSTEM_PROMPT, userPayload);
    } catch (err) {
      console.error(`[dev-agent] Claude failed for ${rel}:`, err?.message || err);
      restoreAll(backups);
      process.exit(1);
    }

    const origBytes = Buffer.byteLength(original, "utf8");
    const newBytes = Buffer.byteLength(newContent, "utf8");
    const minAllowed = Math.floor(origBytes * 0.6);

    if (newBytes < minAllowed && origBytes > 80) {
      console.error(
        `[dev-agent] Size abort for ${rel}: new ${newBytes} bytes < 60% of ${origBytes}. Restoring backup.`
      );
      try {
        fs.copyFileSync(bakPath, abs);
        fs.unlinkSync(bakPath);
      } catch {
        /* */
      }
      const idx = backups.findIndex((x) => x.rel === rel);
      if (idx !== -1) backups.splice(idx, 1);
      continue;
    }

    try {
      fs.writeFileSync(abs, newContent, "utf8");
      touchedForCommit.push(rel);
    } catch (err) {
      console.error(`[dev-agent] Write failed ${rel}:`, err?.message || err);
      restoreAll(backups);
      process.exit(1);
    }
  }

  /** Filter backups to rows still present (successful writes keep backup files until cleanup). */
  const activeBackups = backups.filter((b) => fs.existsSync(b.bakPath));

  if (!touchedForCommit.length) {
    console.error("[dev-agent] No eligible files modified after skips.");
    deleteBackupsQuiet(activeBackups);
    process.exit(1);
  }

  const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: false,
  });

  if ((build.status ?? 1) !== 0) {
    console.error("[dev-agent] npm run build failed. Restoring all backups.");
    restoreAll(activeBackups);
    process.exit(1);
  }

  const authUrl = buildAuthedPushUrl();
  if (!authUrl || !process.env.PIPELINE_TOKEN) {
    console.error("[dev-agent] PIPELINE_TOKEN is required for git push.");
    restoreAll(activeBackups);
    process.exit(1);
  }

  const featBranch = `feature/${ticketIdBranch}`;
  spawnSync(process.platform === "win32" ? "git.exe" : "git", ["config", "user.email", "agent@fashionos.ai"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  spawnSync(process.platform === "win32" ? "git.exe" : "git", ["config", "user.name", "Fashion OS Dev Agent"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });

  let br = spawnSync(process.platform === "win32" ? "git.exe" : "git", ["checkout", "-b", featBranch], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });

  if ((br.status ?? 1) !== 0) {
    br = spawnSync(process.platform === "win32" ? "git.exe" : "git", ["checkout", featBranch], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
    if ((br.status ?? 1) !== 0) {
      console.error("[dev-agent] Could not checkout feature branch:", featBranch);
      restoreAll(activeBackups);
      process.exit(1);
    }
  }

  for (const rel of touchedForCommit) {
    const st = spawnSync(process.platform === "win32" ? "git.exe" : "git", ["add", "--", rel], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      shell: false,
    });
    if ((st.status ?? 1) !== 0) {
      console.error("[dev-agent] git add failed for:", rel);
      restoreAll(activeBackups);
      process.exit(1);
    }
  }

  const titleRaw = String(ticket.title || "update").trim().slice(0, 200);
  const commitMsg = `feat: ${titleRaw} [agent]`;

  const ci = spawnSync(
    process.platform === "win32" ? "git.exe" : "git",
    ["commit", "-m", commitMsg],
    { cwd: REPO_ROOT, stdio: "inherit", shell: false }
  );
  if ((ci.status ?? 1) !== 0) {
    console.error("[dev-agent] git commit failed.");
    restoreAll(activeBackups);
    process.exit(1);
  }

  const pushRefspec = `HEAD:refs/heads/${featBranch}`;
  const pu = spawnSync(
    process.platform === "win32" ? "git.exe" : "git",
    ["push", "--set-upstream", authUrl, pushRefspec],
    { cwd: REPO_ROOT, stdio: "inherit", shell: false }
  );
  if ((pu.status ?? 1) !== 0) {
    console.error("[dev-agent] git push failed.");
    restoreAll(activeBackups);
    process.exit(1);
  }

  deleteBackupsQuiet(activeBackups);

  console.log(`✅ Dev agent complete. Branch: feature/${ticketIdBranch}`);
}

function stripExt(str, ext) {
  return str.endsWith(ext) ? str.slice(0, -ext.length) : str;
}

main().catch((err) => {
  console.error("[dev-agent] Unhandled:", err);
  process.exit(1);
});
