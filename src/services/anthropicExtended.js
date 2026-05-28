import { ANTHROPIC_URL, CLAUDE_MODEL, agentTraceHooks } from "./aiService";
import { getFirebaseAuthHeader } from "../firebase";
import { buildProfileSummary, anthropicTextFromMessage } from "./parsers";

export async function callAnthropicWithWebSearch(system, userText) {
  const agentRunStartedAt = agentTraceHooks.startAgentRun("Shopper Agent", "Search shopping recommendations");
  try {
    const body = {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userText }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
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
    const out = anthropicTextFromMessage(data);
    agentTraceHooks.finishAgentRun("Shopper Agent", "Search shopping recommendations", agentRunStartedAt, {
      status: "success",
    });
    return out;
  } catch (error) {
    agentTraceHooks.failAgentRun("Shopper Agent", "Search shopping recommendations", agentRunStartedAt, error);
    throw error;
  }
}

export async function callShoppingAssistant(system, userText) {
  return callAnthropicWithWebSearch(system, userText);
}

export async function evaluateOutfitWithVision(base64, mediaType, profile) {
  const agentRunStartedAt = agentTraceHooks.startAgentRun("Evaluator Agent", "Evaluate outfit");
  try {
    const profileSummary = buildProfileSummary(profile);
    const system = `You are a strict but constructive fashion evaluator.
User profile: ${profileSummary}.
Evaluate this outfit from the photo across five dimensions (each score 0-10): fit, color harmony, style cohesion, occasion appropriateness, and an overall impression.

Return ONLY valid JSON (no markdown):
{
  "score": {
    "fit": 8,
    "color": 8,
    "style": 7,
    "occasion": 8,
    "overall": 8
  },
  "verdict": "APPROVED",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["suggestion 1", "suggestion 2"],
  "stylist_note": "One sharp memorable insight."
}

verdict must be one of: APPROVED | NEEDS WORK | RECONSIDER
All score values must be numbers from 0 to 10.`;

    const body = {
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: "Evaluate this outfit from the photo. Reply with one raw JSON object only (same schema as the system prompt). No other text.",
            },
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
    const text = anthropicTextFromMessage(data);
    const out = String(text || "").trim();
    agentTraceHooks.finishAgentRun("Evaluator Agent", "Evaluate outfit", agentRunStartedAt, { status: "success" });
    return out;
  } catch (error) {
    agentTraceHooks.failAgentRun("Evaluator Agent", "Evaluate outfit", agentRunStartedAt, error);
    throw error;
  }
}
