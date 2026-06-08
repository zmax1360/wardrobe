import { extractJsonObjectSlice } from "./aiService";
import {
  getTimesWorn,
  compareCleanItemsByPriorityCPW,
  getPurchasePriceNum,
} from "../utils/wardrobeFinance";
import { calculateCPW } from "../utils/helpers";

export function buildProfileSummary(p) {
  if (!p) return "Not provided.";
  const lines = [
    `Name: ${p.name || "—"}`,
    `Gender: ${p.gender || "—"}`,
    `Body type: ${
      Array.isArray(p.bodyType)
        ? p.bodyType.length
          ? p.bodyType.join(", ")
          : "—"
        : p.bodyType || "—"
    }`,
    `Budget: ${p.budget || "—"}`,
    `Styles: ${Array.isArray(p.styles) && p.styles.length ? p.styles.join(", ") : "—"}`,
    `Brands: ${Array.isArray(p.brands) && p.brands.length ? p.brands.join(", ") : "—"}`,
    `Sizes: top ${p.topSize || "—"}, bottom ${p.bottomSize || "—"}, shoe ${p.shoeSize || "—"}`,
  ];
  return lines.join("\n");
}

export function buildCleanWardrobeList(items) {
  const clean = [...items.filter((it) => it.laundryStatus === "clean")].sort(compareCleanItemsByPriorityCPW);
  if (clean.length === 0) return "";
  return clean
    .map((it, i) => {
      const pp = getPurchasePriceNum(it);
      const wc = getTimesWorn(it);
      const cpw = calculateCPW(pp, wc);
      const cpwHint = pp > 0 ? ` · CPW $${cpw.toFixed(2)} (priority ${i + 1})` : "";
      const colorDesc = [
        ...(Array.isArray(it.colors) && it.colors.length ? it.colors : []),
        it.color,
      ]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ");
      const nameWithColor = colorDesc ? `${colorDesc} ${it.name}` : it.name;
      return `- ${nameWithColor} (${it.category}): style: ${it.style || "—"}, season: ${it.season || "—"}${cpwHint}`;
    })
    .join("\n");
}

export function buildFullWardrobeList(items) {
  if (!items || items.length === 0) return "(empty)";
  return items
    .map((it) => {
      const laundry =
        it.laundryStatus === "dirty" ? "dirty" : it.laundryStatus === "wash" ? "in wash" : "clean";
      return `- ${it.name} (${it.category}): ${it.color}, style: ${it.style || "—"}, laundry: ${laundry}`;
    })
    .join("\n");
}

export function extractJsonArraySlice(s) {
  const start = s.indexOf("[");
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
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export function parseDesignerOutfitsJson(text) {
  let s = (text || "").trim();
  if (!s) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const fm = s.match(fence);
  if (fm) s = fm[1].trim();
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }
  const slice = extractJsonArraySlice(s);
  if (slice) {
    try {
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export function parseEvaluatorJson(text) {
  let s = (text || "").trim();
  if (!s) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const fm = s.match(fence);
  if (fm) s = fm[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  const slice = extractJsonObjectSlice(s);
  if (slice) {
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
  return null;
}

export function parseGapAnalysisGaps(text) {
  const data = parseEvaluatorJson(text);
  if (!data || typeof data !== "object") return null;
  const gaps = Array.isArray(data.gaps) ? data.gaps : Array.isArray(data) ? data : null;
  if (!gaps) return null;
  const out = [];
  for (const g of gaps) {
    if (!g || typeof g !== "object") continue;
    const name = String(g.name ?? g.item_name ?? "").trim();
    const reason = String(g.reason ?? "").trim();
    const impact = String(g.impact ?? "").trim();
    if (!name) continue;
    out.push({ name, reason, impact });
  }
  return out.length ? out : null;
}

export function parsePlannerResponse(text) {
  const data = parseEvaluatorJson(text);
  if (!data || typeof data !== "object") return null;

  // New format: { outfits: [...] }
  if (Array.isArray(data.outfits) && data.outfits.length > 0) {
    const outfits = data.outfits.map((o) => ({
      name: String(o.name || o.title || "Outfit").trim(),
      items: Array.isArray(o.items) ? o.items.map((x) => String(x).trim()).filter(Boolean) : [],
      why: String(o.why || o.rationale || "").trim(),
    }));
    return { outfits };
  }

  // Legacy format fallback: { primary_outfit, alternate_outfit }
  const primary = data.primary_outfit || data.main_outfit || data.primary;
  if (!primary || typeof primary !== "object") return null;
  const outfits = [{
    name: String(primary.name || primary.title || "Outfit").trim(),
    items: Array.isArray(primary.items) ? primary.items.map((x) => String(x).trim()).filter(Boolean) : [],
    why: String(primary.why || primary.rationale || "").trim(),
  }];
  const altRaw = data.alternate_outfit ?? data.alternative_outfit ?? null;
  if (altRaw && typeof altRaw === "object") {
    const an = String(altRaw.name || altRaw.title || "").trim();
    const ai = Array.isArray(altRaw.items) ? altRaw.items.map((x) => String(x).trim()).filter(Boolean) : [];
    const aw = String(altRaw.why || altRaw.rationale || "").trim();
    if (an || ai.length) outfits.push({ name: an || "Alternative", items: ai, why: aw });
  }
  return { outfits };
}

export function parseShopperRecommendations(text) {
  const data = parseEvaluatorJson(text);
  if (!data || typeof data !== "object") return null;
  const recs = Array.isArray(data.recommendations) ? data.recommendations : null;
  if (!recs) return null;
  const out = [];
  for (const r of recs) {
    if (!r || typeof r !== "object") continue;
    const item = String(r.item ?? r.name ?? "").trim();
    if (!item) continue;
    const n = r.outfits_unlocked;
    const outfits =
      typeof n === "number" && !Number.isNaN(n)
        ? n
        : Number.parseInt(String(n ?? ""), 10);
    out.push({
      item,
      price_range: String(r.price_range ?? r.price ?? "").trim(),
      why_it_matters: String(r.why_it_matters ?? r.why ?? "").trim(),
      outfits_unlocked: Number.isFinite(outfits) ? outfits : 0,
    });
  }
  return out.length ? out : null;
}

export function normalizeEvaluatorResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const scoreObj = raw.score && typeof raw.score === "object" ? raw.score : {};
  const clip = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isNaN(n)) return 0;
    return Math.min(10, Math.max(0, n));
  };
  const strengths = Array.isArray(raw.strengths) ? raw.strengths.map(String) : [];
  const improvements = Array.isArray(raw.improvements) ? raw.improvements.map(String) : [];
  let verdict = String(raw.verdict || "").trim();
  if (verdict === "NEEDS_WORK") verdict = "NEEDS WORK";
  if (!["APPROVED", "NEEDS WORK", "RECONSIDER"].includes(verdict)) verdict = "NEEDS WORK";
  const stylist_note =
    typeof raw.stylist_note === "string"
      ? raw.stylist_note
      : typeof raw.stylistNote === "string"
        ? raw.stylistNote
        : "";
  return {
    score: {
      fit: clip(scoreObj.fit),
      color: clip(scoreObj.color),
      style: clip(scoreObj.style),
      occasion: clip(scoreObj.occasion),
      overall: clip(scoreObj.overall),
    },
    verdict,
    strengths,
    improvements,
    stylist_note,
  };
}

export function anthropicTextFromMessage(data) {
  const content = data?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
}
