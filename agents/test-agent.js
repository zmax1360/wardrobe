/**
 * Validates latest ticket outputs (build + Claude review per file), opens GitHub PR if all pass.
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const TICKETS_DIR = path.join(__dirname, "tickets");

const MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const REVIEW_SYSTEM_PROMPT =
  "You are a senior code reviewer. Given the file content and acceptance criteria below, \n" +
  "determine if the implementation satisfies the criteria.\n" +
  'Respond with ONLY valid JSON: { "passed": true/false, "issues": ["issue1", "issue2"] }';

function normalizeRel(repoRoot, rawPath) {
  const resolved = path.resolve(repoRoot, String(rawPath).trim());
  const rel = path.relative(repoRoot, resolved);
  if (rel.startsWith("..")) return null;
  return rel.split(path.sep).join("/");
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

function extractJsonObject(str) {
  const s = stripFence(str);
  let t = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
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

function stripExt(str, ext) {
  return str.endsWith(ext) ? str.slice(0, -ext.length) : str;
}

/** @returns {{ host: string, owner: string, repo: string } | null} */
function parseOriginRemote() {
  let u = execSync("git remote get-url origin", {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();

  const ssh = u.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  const httpsClean = u.replace(/^https:\/\/[^@]+@/i, "https://");
  const https =
    /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(httpsClean);

  if (ssh) {
    return {
      host: ssh[1],
      owner: ssh[2],
      repo: ssh[3].replace(/\.git$/i, ""),
    };
  }
  if (https) {
    return {
      host: https[1],
      owner: https[2],
      repo: https[3].replace(/\.git$/i, ""),
    };
  }
  return null;
}

function githubRestBase(host) {
  if (host === "github.com" || host.endsWith(".github.com")) {
    return "https://api.github.com";
  }
  return `https://${host}/api/v3`;
}

async function anthropicReview(acceptanceText, relPath, fileContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const userPayload =
    `Acceptance criteria:\n${acceptanceText}\n\n` +
    `File path: ${relPath}\n\n----- BEGIN FILE -----\n${fileContent}\n----- END FILE -----`;

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": String(apiKey).trim(),
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: REVIEW_SYSTEM_PROMPT,
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
  return parts.join("\n");
}

function parseReview(rawText, relPath) {
  const obj = extractJsonObject(rawText);
  if (!obj || typeof obj !== "object") {
    return {
      passed: false,
      issues: [`${relPath}: invalid or unreadable Claude JSON review`],
    };
  }

  let passed =
    typeof obj.passed === "boolean" ?
      obj.passed
    : obj.passed === "true";

  /** @type {string[]} */
  let issues =
    Array.isArray(obj.issues) ?
      obj.issues.map((x) => String(x).trim()).filter(Boolean)
    : [];

  if (typeof obj.passed !== "boolean") {
    issues = issues.length ? issues : ["Review response missing boolean `passed`"];
    passed = false;
  }

  return { passed, issues };
}

async function createPullRequest({ owner, repo, token, apiBase, payload }) {
  const url = `${apiBase}/repos/${owner}/${repo}/pulls`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.trim()}`,
      "User-Agent": "FashionOS-TestAgent",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data?.message || data?.errors?.map((e) => e.message || String(e)).join("; ") || text.slice(0, 800);
    throw new Error(`GitHub pulls API ${res.status}: ${msg}`);
  }

  const htmlUrl = data?.html_url;
  if (!htmlUrl || typeof htmlUrl !== "string") {
    throw new Error("GitHub PR response missing html_url");
  }
  return htmlUrl;
}

function failChecks(messageLines) {
  for (const line of messageLines) {
    console.error(line);
  }
  console.error("❌ Test agent: checks failed, PR not opened");
  process.exit(1);
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    failChecks(["[test-agent] ANTHROPIC_API_KEY is not set."]);
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
    failChecks(["[test-agent] No ticket JSON found under agents/tickets/."]);
  }

  /** @type {Record<string, unknown>} */
  let ticket;
  try {
    ticket = JSON.parse(fs.readFileSync(ticketPath, "utf8"));
  } catch {
    failChecks([`[test-agent] Failed to parse ticket: ${ticketPath}`]);
  }

  const filesToModify =
    Array.isArray(ticket.files_to_modify) ? ticket.files_to_modify.map(String).filter(Boolean) : [];

  if (!filesToModify.length) {
    failChecks(["[test-agent] Ticket has empty files_to_modify."]);
  }

  const ticketIdBranch = branchSlug(
    ticket.id || ticket.ticket_id || path.basename(ticketPath, ".json")
  );
  const ticketIdDisplay = String(ticket.id ?? ticket.ticket_id ?? ticketIdBranch ?? "");
  const ticketTitle =
    String(ticket.title ?? "Untitled").trim().slice(0, 200) || "Untitled";

  const criteriaArr =
    Array.isArray(ticket.acceptance_criteria) ?
      ticket.acceptance_criteria.map(String).filter((x) => x.trim())
    : [];
  const acceptanceText =
    criteriaArr.length ? criteriaArr.map((c, i) => `${i + 1}. ${c}`).join("\n") : "(none)";
  const acceptanceForBody =
    criteriaArr.length ? criteriaArr.map((c) => `- ${c}`).join("\n") : "(none)";

  const featHead = `feature/${ticketIdBranch}`;

  const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: false,
  });

  if ((build.status ?? 1) !== 0) {
    failChecks(["[test-agent] npm run build failed."]);
  }

  /** @type {string[]} */
  const allIssues = [];
  /** @type {boolean} */
  let anyFailed = false;

  for (const raw of filesToModify) {
    const rel = normalizeRel(REPO_ROOT, raw);
    if (!rel) {
      const msg = `[test-agent] Invalid path (outside repo): ${raw}`;
      console.warn(msg);
      allIssues.push(msg);
      anyFailed = true;
      continue;
    }

    const abs = path.join(REPO_ROOT, ...rel.split("/"));
    let content = "";
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      const msg = `${rel}: file missing or unreadable`;
      console.warn(msg);
      allIssues.push(msg);
      anyFailed = true;
      continue;
    }

    let rawReview;
    try {
      rawReview = await anthropicReview(acceptanceText, rel, content);
    } catch (err) {
      anyFailed = true;
      const detail = `[test-agent] Claude review failed for ${rel}: ${err?.message || err}`;
      console.error(detail);
      allIssues.push(detail);
      continue;
    }

    const { passed, issues } = parseReview(rawReview, rel);
    if (!passed) {
      anyFailed = true;
      const prefixed =
        issues.length ?
          issues.map((i) => `${rel}: ${i}`)
        : [`${rel}: review returned passed: false with no issue details`];
      allIssues.push(...prefixed);
    }
  }

  if (anyFailed) {
    if (allIssues.length) {
      console.error("[test-agent] Issues:");
      for (const iss of allIssues) {
        console.error(` - ${iss}`);
      }
    }
    failChecks([]);
    return;
  }

  const token = process.env.PIPELINE_TOKEN;
  if (!token || !String(token).trim()) {
    failChecks(["[test-agent] PIPELINE_TOKEN is required to open PR."]);
  }

  const origin = parseOriginRemote();
  if (!origin) {
    failChecks(["[test-agent] Could not parse owner/repo from git remote get-url origin."]);
  }

  const apiBase = githubRestBase(origin.host);

  const prPayload = {
    title: `[Agent] ${ticketTitle}`,
    body:
      `Auto-generated by Fashion OS Dev Pipeline\n\n` +
      `Ticket: ${ticketIdDisplay}\n\n` +
      `Acceptance criteria:\n${acceptanceForBody}`,
    head: featHead,
    base: "main",
  };

  let prUrl;
  try {
    prUrl = await createPullRequest({
      owner: origin.owner,
      repo: origin.repo,
      token: String(token),
      apiBase,
      payload: prPayload,
    });
  } catch (err) {
    failChecks([String(err?.message || err)]);
  }

  console.log(`✅ PR opened: ${prUrl}`);
}

main().catch((err) => {
  console.error("[test-agent] Unhandled:", err);
  console.error("❌ Test agent: checks failed, PR not opened");
  process.exit(1);
});
