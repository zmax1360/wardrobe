import React, { useState } from "react";

import { COLORS } from "../constants/colors";
import { runAgent } from "../agents/agentOrchestrator";

export function DesignerScreen({
  profile,
  wardrobe,
  baseTransition,
  DESIGNER_STYLE_DIRECTIONS,
  DESIGNER_MOODS,
  buildProfileSummary,
  buildFullWardrobeList,
  parseDesignerOutfitsJson,
}) {
  const [styleDirection, setStyleDirection] = useState(DESIGNER_STYLE_DIRECTIONS[0]);
  const [mood, setMood] = useState(DESIGNER_MOODS[0]);
  const [loading, setLoading] = useState(false);
  const [outfits, setOutfits] = useState(null);
  const [rawFallback, setRawFallback] = useState("");
  const [error, setError] = useState("");

  const run = async () => {
    setError("");
    setOutfits(null);
    setRawFallback("");
    const profileSummary = buildProfileSummary(profile);
    const wardrobeList = buildFullWardrobeList(wardrobe);
    const system =
      "You are a visionary fashion designer AI with a sharp editorial eye. " +
      `The user's profile: ${profileSummary}.\n` +
      `Their wardrobe: ${wardrobeList}\n` +
      `Create 3 complete outfit combinations in the '${styleDirection}' style with a '${mood}' mood.\n` +
      "For each outfit provide:\n" +
      "1. Creative outfit name\n" +
      "2. Exact items to wear (only from their wardrobe)\n" +
      "3. Styling logic (color theory, silhouette, proportions)\n" +
      "4. Color harmony note\n" +
      "5. A celebrity or style icon who would wear this\n" +
      "Be bold, specific, and inspiring.";
    const user =
      "Respond with ONLY a JSON array (no markdown) of exactly 3 objects. Each object must have: outfitName (string), items (array of strings), stylingLogic (string), colorHarmony (string), styleIcon (string). No other text.";
    setLoading(true);
    try {
      const text = await runAgent({
        agentName: "Designer Agent",
        task: "Generate outfit combinations",
        systemPrompt: system,
        userPrompt: user,
      });
      const parsed = parseDesignerOutfitsJson(text);
      if (parsed && parsed.length) setOutfits(parsed.slice(0, 3));
      else {
        setRawFallback(text);
      }
    } catch (e) {
      setError(e.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.75rem",
          fontWeight: 600,
          margin: "0 0 8px",
        }}
      >
        Style Designer
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 20px", fontSize: "0.9rem" }}>
        Three editorial looks from your closet — direction and mood, then generate.
      </p>

      {wardrobe.length === 0 && (
        <p style={{ color: COLORS.textMuted, marginBottom: 20 }}>
          Your wardrobe is empty. Add pieces in Wardrobe before generating looks.
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 20,
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLORS.textMuted,
              marginBottom: 8,
            }}
          >
            Style direction
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DESIGNER_STYLE_DIRECTIONS.map((d) => {
              const on = styleDirection === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setStyleDirection(d)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                    background: on ? COLORS.primarySoft : COLORS.surface2,
                    color: on ? COLORS.text : COLORS.textMuted,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    transition: baseTransition,
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLORS.textMuted,
              marginBottom: 8,
            }}
          >
            Mood
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DESIGNER_MOODS.map((m) => {
              const on = mood === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(m)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                    background: on ? COLORS.primarySoft : COLORS.surface2,
                    color: on ? COLORS.text : COLORS.textMuted,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    transition: baseTransition,
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={loading || wardrobe.length === 0}
        style={{
          padding: "12px 24px",
          borderRadius: 8,
          border: "none",
          background: loading || wardrobe.length === 0 ? COLORS.border : COLORS.primary,
          color: "#FFFFFF",
          fontWeight: 600,
          cursor: loading || wardrobe.length === 0 ? "default" : "pointer",
          marginBottom: 20,
          transition: baseTransition,
        }}
      >
        {loading ? "Generating…" : "Generate Looks"}
      </button>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: `3px solid ${COLORS.border}`,
              borderTopColor: COLORS.primary,
              borderRadius: "50%",
              animation: "fosSpin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes fosSpin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ color: COLORS.textMuted }}>Designing looks…</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: COLORS.primarySoft,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 16,
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {outfits && outfits.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {outfits.map((o, idx) => (
            <div
              key={idx}
              style={{
                background: COLORS.surface2,
                borderRadius: 12,
                padding: 20,
                border: `1px solid ${COLORS.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: COLORS.primary,
                }}
              >
                Look {idx + 1}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 600 }}>
                {o.outfitName || "Untitled look"}
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 4 }}>Items to wear</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.88rem", lineHeight: 1.5 }}>
                  {(Array.isArray(o.items) ? o.items : []).map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 4 }}>Styling logic</div>
                <div style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>{o.stylingLogic || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, marginBottom: 4 }}>Color harmony</div>
                <div style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>{o.colorHarmony || "—"}</div>
              </div>
              <div
                style={{
                  marginTop: "auto",
                  paddingTop: 8,
                  borderTop: `1px solid ${COLORS.border}`,
                  fontSize: "0.85rem",
                  fontStyle: "italic",
                  color: COLORS.textMuted,
                }}
              >
                Style icon: {o.styleIcon || "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {rawFallback && (
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 20,
            border: `1px solid ${COLORS.border}`,
            whiteSpace: "pre-wrap",
            fontSize: "0.9rem",
            lineHeight: 1.6,
          }}
        >
          {rawFallback}
        </div>
      )}
    </div>
  );
}
