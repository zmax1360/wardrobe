import { useState, useCallback } from "react";

import { ANTHROPIC_URL, CLAUDE_MODEL, trimEnv } from "../services/aiService";

const STORAGE_WARDROBE = "fos_wardrobe";
const STORAGE_PROFILE = "fos_profile";

function readLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function anthropicTextFromMessage(data) {
  const content = data?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
}

function buildSystemPrompt(profile, wardrobe) {
  const w = Array.isArray(wardrobe) ? wardrobe : [];
  return `You are the Fashion OS wardrobe agent — a personal stylist with deep knowledge of the user's wardrobe and financial style philosophy.

USER PROFILE:
${JSON.stringify(profile ?? {})}

USER WARDROBE (${w.length} items):
${JSON.stringify(wardrobe)}

BEHAVIORAL RULES:
1. Always prioritize Cost Per Wear (CPW) in financial advice.
   CPW = purchasePrice / timesWorn. A $200 coat worn 100 times
   beats a $30 shirt worn once.
2. Before recommending any new purchase, search the wardrobe for
   similar items first. Flag potential waste if a duplicate exists.
3. Reference actual items the user owns by name — never be generic.
4. Be concise, direct, and chic. No bullet point walls. Max 4 lines
   unless a detailed breakdown is explicitly requested.
5. If the wardrobe is empty, guide the user to add items first
   before analysis is possible.`.trim();
}

export function useWardrobeAgent() {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ask = useCallback(async (userMessage) => {
    const text = String(userMessage ?? "").trim();
    if (!text) {
      setError("Enter a question.");
      return;
    }

    setLoading(true);
    setError(null);
    setResponse("");

    const profile = readLocalJson(STORAGE_PROFILE, {});
    const wardrobe = readLocalJson(STORAGE_WARDROBE, []);
    const system = buildSystemPrompt(profile, wardrobe);

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system,
          messages: [{ role: "user", content: text }],
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg =
          data?.error?.message || data?.message || (typeof data === "string" ? data : null) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setResponse(anthropicTextFromMessage(data));
    } catch (e) {
      setError(e?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { ask, response, loading, error };
}
