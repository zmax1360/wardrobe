import React from "react";

import { COLORS } from "../styles/theme";
import { type } from "../styles/typography";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";

function formatDuration(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function getAgentStatusTone(status) {
  if (status === "running") {
    return {
      background: COLORS.primarySoft,
      color: COLORS.primary,
      border: `1px solid ${COLORS.primarySoft}`,
    };
  }
  if (status === "error") {
    return {
      background: COLORS.dangerSoft,
      color: COLORS.danger,
      border: `1px solid ${COLORS.dangerSoft}`,
    };
  }
  return {
    background: COLORS.surface2,
    color: COLORS.textSoft,
    border: `1px solid ${COLORS.borderSoft}`,
  };
}

export function AgentTimeline({ agentActivity }) {
  const rows = Array.isArray(agentActivity?.history) ? agentActivity.history.slice(0, 10) : [];

  if (rows.length === 0) {
    return (
      <div style={mergeStyles(ui.softPanel, { padding: "12px 14px" })}>
        <div style={type.meta}>Last 10 runs</div>
        <div style={{ ...type.body, marginTop: 8 }}>No agent runs yet.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={type.meta}>Last 10 runs</div>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((entry) => {
          const ok = entry.status !== "error";
          return (
            <div
              key={entry.id}
              style={mergeStyles(ui.softPanel, {
                padding: "12px 14px",
                display: "grid",
                gap: 8,
              })}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div style={type.bodyStrong}>{entry.agentName}</div>
                <div
                  style={mergeStyles(ui.chip, getAgentStatusTone(entry.status), {
                    padding: "8px 10px",
                    whiteSpace: "nowrap",
                  })}
                >
                  {ok ? "Success" : "Error"}
                </div>
              </div>
              <div style={type.body}>{entry.taskLabel}</div>
              <div style={type.meta}>Duration: {formatDuration(entry.durationMs)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
