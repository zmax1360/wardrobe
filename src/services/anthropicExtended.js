import {
  ANTHROPIC_URL,
  CLAUDE_MODEL,
  OPENAI_VISION_URL,
  OPENAI_VISION_MODEL,
  agentTraceHooks,
  resolveVisionCredentials,
} from "./aiService";
import { runAgent } from "../agents/agentOrchestrator";
import { buildProfileSummary, anthropicTextFromMessage } from "./parsers";

export async function callAnthropicWithWebSearch(system, userText) {
  const agentRunStartedAt = agentTraceHooks.startAgentRun("Shopper Agent", "Search shopping recommendations");
  try {
    const creds = resolveVisionCredentials();
    if (!creds || creds.provider !== "anthropic") {
      throw new Error(
        "Shopping Agent requires an Anthropic API key (web search is not available when using OpenAI only)."
      );
    }
    const body = {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userText }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
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
  const creds = resolveVisionCredentials();
  if (!creds) {
    throw new Error("This feature isn’t available right now. Please try again later.");
  }
  if (creds.provider === "anthropic") {
    return callAnthropicWithWebSearch(system, userText);
  }
  const systemOpenAI = `${system}

Note: Live web search is not available with your current API setup. Use general knowledge of retailers, styles, and typical price ranges. Mark prices as approximate and suggest the user verify on official store sites.`;
  return runAgent({
    agentName: "Shopper Agent",
    task: "Search shopping recommendations",
    systemPrompt: systemOpenAI,
    userPrompt: userText,
  });
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
    const text = anthropicTextFromMessage(data);
    const outAnthropic = String(text || "").trim();
    agentTraceHooks.finishAgentRun("Evaluator Agent", "Evaluate outfit", agentRunStartedAt, { status: "success" });
    return outAnthropic;
  }

  const dataUrl = `data:${mediaType};base64,${base64}`;
  const body = {
    model: OPENAI_VISION_MODEL,
    max_tokens: 2048,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: "Evaluate this outfit from the photo. Reply with one raw JSON object only." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
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
  const outOpenai = String(data?.choices?.[0]?.message?.content || "").trim();
  agentTraceHooks.finishAgentRun("Evaluator Agent", "Evaluate outfit", agentRunStartedAt, { status: "success" });
  return outOpenai;
  } catch (error) {
    agentTraceHooks.failAgentRun("Evaluator Agent", "Evaluate outfit", agentRunStartedAt, error);
    throw error;
  }
}
