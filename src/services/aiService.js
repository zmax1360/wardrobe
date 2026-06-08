import { getFirebaseAuthHeader } from "../firebase";

export const ANTHROPIC_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:3001/api/chat" : "/api/chat";
export const CLAUDE_MODEL = "claude-sonnet-4-20250514";

export function resolveVisionCredentials() {
  // Anthropic only — API key handled server-side via /api/chat proxy
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

const CLOSET_SCAN_MAX_TOKENS = 2000;

/**
 * Vision call via `/api/chat` (Anthropic). Uses JPEG base64 — same transport as `callTextCompletion` anthropic branch.
 */
export async function callClosetPhotoVision(base64Jpeg, userPromptText) {
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: CLOSET_SCAN_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: base64Jpeg,
            },
          },
          { type: "text", text: userPromptText },
        ],
      },
    ],
  };
  const authHeader = await getFirebaseAuthHeader();
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...authHeader,
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
  return String(text || "").trim();
}

function parseNameArray(rawText, count, fallbackLabel) {
  let s = String(rawText || "")
    .replace(/```json|```/gi, "")
    .trim();
  const tryParse = (x) => {
    try {
      const parsed = JSON.parse(x);
      return Array.isArray(parsed) ? parsed.map((v) => String(v).trim()).filter(Boolean) : null;
    } catch {
      return null;
    }
  };
  let arr = tryParse(s);
  if (!arr) {
    const start = s.indexOf("[");
    const end = s.lastIndexOf("]");
    if (start !== -1 && end > start) arr = tryParse(s.slice(start, end + 1));
  }
  if (arr?.length) {
    while (arr.length < count) arr.push(`${fallbackLabel} ${arr.length + 1}`);
    return arr.slice(0, count);
  }
  return Array.from({ length: count }, (_, i) => `${fallbackLabel} ${i + 1}`);
}

export async function suggestItemNames(scanItem) {
  const { name, colors = [], style = "", count = 1 } = scanItem || {};
  const n = Math.max(1, Math.min(99, Math.floor(Number(count)) || 1));
  const colorsList = Array.isArray(colors) ? colors : [];
  const prompt = `Given a wardrobe scan result: category="${name}", colors=${colorsList.join(", ")}, style="${style}", count=${n}. Return ONLY a JSON array of ${n} short specific item names (2-4 words each). Example: ["White Oxford Shirt","Blue Stripe Button-up"]. No explanation, no markdown.`;
  try {
    const text = await callTextCompletion(
      "You return only valid JSON arrays of short clothing item names.",
      prompt,
      "Suggest scan item names"
    );
    return parseNameArray(text, n, name || "Item");
  } catch {
    return Array.from({ length: n }, (_, i) => `${name || "Item"} ${i + 1}`);
  }
}

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
    const body = {
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    };
    const authHeader = await getFirebaseAuthHeader();
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        ...authHeader,
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

export async function generateStarterWardrobe(profile, batchSize = 20, offset = 0) {
  const {
    gender = "undisclosed",
    styles = [],
    colorPreferences = [],
    bodyType = "",
    climate = "cold winters, warm summers",
    occasions = [],
  } = profile;

  const colorList = colorPreferences.length > 0
    ? colorPreferences.join(", ")
    : "black, navy, grey, white, beige";

  const styleList = styles.length > 0 ? styles.join(", ") : "casual, classic";
  const occasionList = occasions.length > 0 ? occasions.join(", ") : "everyday, casual";

  const genderNote = gender === "male"
    ? "This is a male wardrobe — no dresses, skirts, heels or feminine items."
    : gender === "female"
      ? "This is a female wardrobe — include dresses, skirts, feminine cuts where appropriate."
      : "This is a gender-neutral wardrobe — include a mix of classic unisex pieces.";

  const system = `You are a personal stylist building a realistic wardrobe. 
${genderNote}
Climate: ${climate}
Style: ${styleList}
Occasions: ${occasionList}
Preferred colors: ${colorList}
Body type/sizing: ${bodyType || "not specified"}

Generate exactly ${batchSize} wardrobe items (items ${offset + 1} to ${offset + batchSize} of a 50-item wardrobe).
A realistic wardrobe has multiples of common items — e.g. 3-4 t-shirts in different colors, 2-3 jeans, 2 jackets etc.
Each item must use one of the preferred colors or a neutral that complements them.
Return ONLY a JSON array. No markdown, no explanation.
Each item: { "name": "...", "category": "...", "color": "...", "colors": ["..."], "style": "...", "season": "all|spring|summer|fall|winter" }
Categories must be one of: Tops, Bottoms, Outerwear, Shoes, Accessories, Dresses.
Names should be specific: "Navy Slim Chinos" not just "Chinos". Include color in the name.`;

  const user = `Generate ${batchSize} wardrobe items for a ${gender} person with ${styleList} style who prefers ${colorList} colors. Items ${offset + 1}-${offset + batchSize} of 50.`;

  const authHeader = await getFirebaseAuthHeader();
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...authHeader,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Anthropic error ${res.status}`);
  }

  const data = await res.json();
  const text = Array.isArray(data?.content)
    ? data.content.filter((c) => c.type === "text").map((c) => c.text).join("")
    : data?.content?.[0]?.text || "[]";
  const clean = String(text).replace(/```json|```/gi, "").trim();

  const tryParseArray = (raw) => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  let items = tryParseArray(clean);
  if (!items) {
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start !== -1 && end > start) {
      items = tryParseArray(clean.slice(start, end + 1));
    }
  }

  if (!items?.length) return [];

  return items.map((item, i) => ({
    id: `ai-wardrobe-${offset + i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: item.name || "Unnamed Item",
    category: item.category || "Tops",
    color: item.color || "black",
    colors: Array.isArray(item.colors) ? item.colors : [item.color || "black"],
    style: item.style || styleList,
    season: item.season || "all",
    source: "ai_generated",
    tags: ["ai-wardrobe", "onboarding"],
    laundryStatus: "clean",
    timesWorn: 0,
    description: "",
    purchasePrice: "",
    imagePreview: "",
    imageFilename: "",
  }));
}
