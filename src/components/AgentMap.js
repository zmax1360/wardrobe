import React from "react";

import { COLORS } from "../styles/theme";
import { type } from "../styles/typography";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";

const AGENTS = {
  designer: { short: "Designer", fullName: "Designer Agent" },
  evaluator: { short: "Evaluator", fullName: "Evaluator Agent" },
  shopper: { short: "Shopper", fullName: "Shopper Agent" },
  gap: { short: "Gap Analysis", fullName: "Gap Analysis Agent" },
};

function matchesAgent(fullName, activityName) {
  if (!activityName) return false;
  return activityName === fullName || activityName.includes(fullName.replace(/ Agent$/, ""));
}

function nodeBoxStyle({ isActive, isLastRun }) {
  const glowActive = "0 0 0 3px rgba(184, 92, 56, 0.45), 0 0 28px rgba(184, 92, 56, 0.35)";
  const glowLast = "0 0 0 2px rgba(122, 142, 118, 0.55), 0 0 22px rgba(122, 142, 118, 0.28)";

  let boxShadow = `${COLORS.shadow}, ${COLORS.cardGlow}`;
  if (isActive && isLastRun) {
    boxShadow = `${glowActive}, ${glowLast}`;
  } else if (isActive) {
    boxShadow = `${glowActive}, ${COLORS.cardGlow}`;
  } else if (isLastRun) {
    boxShadow = `${glowLast}, ${COLORS.cardGlow}`;
  }

  return {
    padding: "12px 16px",
    borderRadius: 14,
    border: `1px solid ${isActive ? COLORS.primarySoft : isLastRun ? COLORS.accentSoft : COLORS.borderSoft}`,
    background: COLORS.surface,
    boxShadow,
    minWidth: 108,
    textAlign: "center",
    transition: "box-shadow 180ms ease, border-color 180ms ease",
  };
}

function AgentNode({ id, agentActivity }) {
  const { short, fullName } = AGENTS[id];
  const current = agentActivity?.currentAgent;
  const last = agentActivity?.lastCompletedAgent;
  const isActive = matchesAgent(fullName, current);
  const isLastRun = matchesAgent(fullName, last);

  return (
    <div style={mergeStyles(ui.softPanel, nodeBoxStyle({ isActive, isLastRun }))}>
      <div style={{ ...type.bodyStrong, fontSize: 14 }}>[{short}]</div>
    </div>
  );
}

export function AgentMap({ agentActivity }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={type.meta}>Agent map</div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <AgentNode id="designer" agentActivity={agentActivity} />
        <span style={{ ...type.bodyStrong, marginTop: 14, color: COLORS.textMuted }}>→</span>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AgentNode id="evaluator" agentActivity={agentActivity} />
          <div style={{ ...type.bodyStrong, color: COLORS.textMuted, lineHeight: 1 }}>↓</div>
          <AgentNode id="gap" agentActivity={agentActivity} />
        </div>
        <span style={{ ...type.bodyStrong, marginTop: 14, color: COLORS.textMuted }}>→</span>
        <AgentNode id="shopper" agentActivity={agentActivity} />
      </div>
    </div>
  );
}
