export const ANTHROPIC_URL = "/api/chat";
export const CLAUDE_MODEL = "claude-sonnet-4-20250514";
export const OPENAI_VISION_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_VISION_MODEL = "gpt-4o";

/** Prefer Anthropic if present; else first OpenAI key found (CRA: use REACT_APP_*). */
export function resolveVisionCredentials() {
  const openai =
    trimEnv(process.env.REACT_APP_OPENAI_API_KEY) ||
    trimEnv(process.env.OPENAI_API_KEY) ||
    trimEnv(process.env.OPEN_AI_KEY);
  if (openai) return { provider: "openai", key: openai };
  // Anthropic runs through `/api/chat` (server-side key), so the client does not need a key to proceed.
  return { provider: "anthropic", key: "" };
}

export function trimEnv(v) {
  if (v == null || typeof v !== "string") return "";
  const s = v.trim();
  return s || "";
}

export function extractJsonObjectSlice(s) {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let q = "";
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === q) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      q = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export const agentTraceHooks = {
  startAgentRun: (agentName, taskLabel) => Date.now(),
  finishAgentRun: () => {},
  failAgentRun: () => {},
  getActiveNav: () => "wardrobe",
};

export async function callTextCompletion(system, user, explicitTaskLabel) {
  const inferredTaskLabel =
    (typeof explicitTaskLabel === "string" && explicitTaskLabel.trim()) ||
    (user || "").slice(0, 80).replace(/\s+/g, " ").trim() ||
    "Text completion";
  const activeTab = agentTraceHooks.getActiveNav?.() ?? "wardrobe";
  const inferredAgentName =
    activeTab === "wardrobe"
      ? "Wardrobe Agent"
      : activeTab === "calendar"
        ? "Calendar Agent"
        : activeTab === "planner"
          ? "Planner Agent"
          : activeTab === "profile"
            ? "Profile"
            : activeTab === "designer"
              ? "Designer Agent"
              : activeTab === "evaluator"
                ? "Evaluator Agent"
                : activeTab === "shopper"
                  ? "Shopper Agent"
                  : activeTab === "gaps" || activeTab === "gap"
                    ? "Gap Analysis Agent"
                    : "AI Agent";

  const agentRunStartedAt = agentTraceHooks.startAgentRun(inferredAgentName, inferredTaskLabel);

  try {
    const creds = resolveVisionCredentials();
    if (!creds) {
      throw new Error(
        "No AI key: set REACT_APP_ANTHROPIC_API_KEY or REACT_APP_OPENAI_API_KEY (or OPENAI_API_KEY / OPEN_AI_KEY)."
      );
    }

    if (creds.provider === "anthropic") {
      const body = {
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      };
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Anthropic error ${res.status}`);
      }
      const data = await res.json();
      const text = Array.isArray(data?.content)
        ? data.content.filter((c) => c.type === "text").map((c) => c.text).join("")
        : data?.content?.[0]?.text;
      const out = String(text || "").trim();
      agentTraceHooks.finishAgentRun(inferredAgentName, inferredTaskLabel, agentRunStartedAt, {
        status: "success",
      });
      return out;
    }

    const body = {
      model: OPENAI_VISION_MODEL,
      max_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    const res = await fetch(OPENAI_VISION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.key}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `OpenAI error ${res.status}`);
    }
    const data = await res.json();
    const out = String(data?.choices?.[0]?.message?.content || "").trim();
    agentTraceHooks.finishAgentRun(inferredAgentName, inferredTaskLabel, agentRunStartedAt, {
      status: "success",
    });
    return out;
  } catch (error) {
    agentTraceHooks.failAgentRun(inferredAgentName, inferredTaskLabel, agentRunStartedAt, error);
    throw error;
  }
}

export function parseCatalogJson(text) {
  let s = (text || "").trim();
  if (!s) {
    throw new Error("Empty response from the model. Try again.");
  }

  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const fm = s.match(fence);
  if (fm) s = fm[1].trim();

  const tryParse = (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(s);
  if (parsed && typeof parsed === "object") return parsed;

  const slice = extractJsonObjectSlice(s);
  if (slice) {
    parsed = tryParse(slice);
    if (parsed && typeof parsed === "object") return parsed;
  }

  const preview = s.slice(0, 100).replace(/\s+/g, " ");
  throw new Error(
    "The model did not return catalog JSON (e.g. it answered in plain text). Try another image or check the prompt. " +
      (preview ? `Response started with: "${preview}${s.length > 100 ? "…" : ""}"` : "")
  );
}
