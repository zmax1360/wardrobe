import React, { useMemo, useState } from "react";

import { COLORS } from "../constants/colors";
import { GAP_SEASONS, STORAGE_GAP_ANALYSIS_LAST } from "../constants";
import { type } from "../styles/typography";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";
import { todayYmdLocal } from "../utils/helpers";
import { formatDisplayDate, daysRelativeLabel } from "../utils/dateHelpers";
import { buildProfileSummary, buildFullWardrobeList, parseGapAnalysisGaps } from "../services/parsers";
import { runAgent } from "../agents/agentOrchestrator";

export function GapAnalysisScreen({ profile, wardrobe, events, baseTransition, agentInsights }) {
  const [mode, setMode] = useState("full");
  const [season, setSeason] = useState("Spring");
  const [eventId, setEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const today = todayYmdLocal();
  const upcomingSorted = useMemo(() => {
    return [...events]
      .filter((e) => e && typeof e.date === "string" && e.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [events, today]);

  const selectedEvent = useMemo(
    () => upcomingSorted.find((e) => e.id === eventId) || null,
    [upcomingSorted, eventId]
  );

  const parsedGapItems = useMemo(() => (result ? parseGapAnalysisGaps(result) : null), [result]);

  const run = async () => {
    setError("");
    setResult("");
    const profileSummary = buildProfileSummary(profile);
    const count = wardrobe.length;
    const wardrobeItems = buildFullWardrobeList(wardrobe);
    const frequentIssuesBlock = Array.isArray(agentInsights?.frequentIssues) && agentInsights.frequentIssues.length
      ? agentInsights.frequentIssues.map((x, i) => `${i + 1}. ${String(x)}`).join("\n")
      : "(none recorded yet)";

    let modeContext = "";
    if (mode === "full") {
      modeContext = "Analyse the full wardrobe for gaps across their lifestyle.";
    } else if (mode === "event") {
      if (!selectedEvent) {
        setError("Select an upcoming event.");
        return;
      }
      modeContext = `Focus on gaps needed for this specific event: "${selectedEvent.title}" on ${formatDisplayDate(selectedEvent.date)} (${daysRelativeLabel(selectedEvent.date)}). Occasion: ${selectedEvent.occasionType}. Dress code: ${selectedEvent.dressCode}. ${selectedEvent.location ? `Location: ${selectedEvent.location}. ` : ""}${selectedEvent.notes ? `Notes: ${selectedEvent.notes}` : ""}`;
    } else {
      modeContext = `Focus on gaps for the ${season} season (weather-appropriate pieces, layering, and versatility for that time of year).`;
    }

    const system = `You are a wardrobe gap analyst.
Based on wardrobe and repeated outfit issues, identify missing pieces.

User profile:
${profileSummary}

Wardrobe items (${count}):
${wardrobeItems}

Repeated outfit issues (from evaluator insights):
${frequentIssuesBlock}

${modeContext}

Respond with ONLY valid JSON (no markdown):
{
  "gaps": [
    {
      "name": "item name",
      "reason": "why this piece is needed",
      "impact": "what problem or gap it solves"
    }
  ]
}

Include 5-8 gaps when appropriate. Each gap must include name, reason, and impact.`;

    const user = "Return the JSON gap analysis now.";
    setLoading(true);
    try {
      const text = await runAgent({
        agentName: "Gap Analysis Agent",
        task: "Analyze wardrobe gaps",
        systemPrompt: system,
        userPrompt: user,
      });
      setResult(text);
      try {
        localStorage.setItem(STORAGE_GAP_ANALYSIS_LAST, text);
      } catch {
        /* ignore quota */
      }
    } catch (e) {
      setError(e.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const pill = (id, label) => {
    const on = mode === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setMode(id);
          setError("");
        }}
        style={{
          padding: "8px 16px",
          borderRadius: 999,
          border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
          background: on ? COLORS.primarySoft : COLORS.surface2,
          color: on ? COLORS.text : COLORS.textMuted,
          cursor: "pointer",
          fontSize: "0.85rem",
          transition: baseTransition,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.75rem",
          fontWeight: 600,
          margin: "0 0 8px",
        }}
      >
        Gap Analysis
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 8px", fontSize: "0.9rem" }}>
        {"Discover what's missing from your wardrobe"}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {pill("full", "Full Wardrobe")}
        {pill("event", "For an Event")}
        {pill("season", "By Season")}
      </div>

      {wardrobe.length === 0 && (
        <p style={{ color: COLORS.textMuted, marginBottom: 16 }}>Your wardrobe is empty — add items first for a meaningful gap analysis.</p>
      )}

      {mode === "full" && (
        <div style={{ marginBottom: 20 }}>
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
              transition: baseTransition,
            }}
          >
            {loading ? "Analysing…" : "Analyse my wardrobe"}
          </button>
        </div>
      )}

      {mode === "event" && (
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 20,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 20,
          }}
        >
          {upcomingSorted.length === 0 ? (
            <p style={{ color: COLORS.textMuted, margin: 0, lineHeight: 1.6 }}>
              No upcoming events. Add one in the Calendar (📅 in the sidebar), then return here.
            </p>
          ) : (
            <>
              <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 6 }}>
                Upcoming event
              </label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.text,
                  marginBottom: 16,
                }}
              >
                <option value="">Select an event…</option>
                {upcomingSorted.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {ev.date}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={run}
                disabled={loading || wardrobe.length === 0 || !eventId}
                style={{
                  padding: "12px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: loading || wardrobe.length === 0 || !eventId ? COLORS.border : COLORS.primary,
                  color: "#FFFFFF",
                  fontWeight: 600,
                  cursor: loading || wardrobe.length === 0 || !eventId ? "default" : "pointer",
                  transition: baseTransition,
                }}
              >
                {loading ? "Analysing…" : "Analyse for this event"}
              </button>
            </>
          )}
        </div>
      )}

      {mode === "season" && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {GAP_SEASONS.map((s) => {
              const on = season === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeason(s)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                    background: on ? COLORS.primarySoft : COLORS.surface2,
                    color: on ? COLORS.text : COLORS.textMuted,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    transition: baseTransition,
                  }}
                >
                  {s}
                </button>
              );
            })}
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
              transition: baseTransition,
            }}
          >
            {loading ? "Analysing…" : `Analyse for ${season}`}
          </button>
        </div>
      )}

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
          <span style={{ color: COLORS.textMuted }}>Finding gaps…</span>
        </div>
      )}

      {error && (
        <div style={{ padding: 14, borderRadius: 10, background: COLORS.primarySoft, marginBottom: 16, fontSize: "0.9rem" }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {parsedGapItems?.length ? (
            parsedGapItems.map((gap, idx) => (
              <div key={idx} style={mergeStyles(ui.panel, { padding: 20 })}>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontWeight: 600,
                    fontSize: "1.2rem",
                    marginBottom: 14,
                    color: COLORS.text,
                  }}
                >
                  {gap.name}
                </div>
                <div style={mergeStyles(ui.softPanel, { padding: "14px 16px", marginBottom: 10 })}>
                  <div style={{ ...type.meta, marginBottom: 8 }}>WHY this is needed</div>
                  <div style={{ fontSize: "0.9rem", lineHeight: 1.55, color: COLORS.text }}>{gap.reason || "—"}</div>
                </div>
                <div style={mergeStyles(ui.softPanel, { padding: "14px 16px" })}>
                  <div style={{ ...type.meta, marginBottom: 8 }}>WHAT problem it solves</div>
                  <div style={{ fontSize: "0.9rem", lineHeight: 1.55, color: COLORS.text }}>{gap.impact || "—"}</div>
                </div>
              </div>
            ))
          ) : (
            <div style={mergeStyles(ui.panel, { padding: 20, fontSize: "0.9rem", lineHeight: 1.65, whiteSpace: "pre-wrap" })}>
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
