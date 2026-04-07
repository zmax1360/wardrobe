import React from "react";

export function GapAnalysisScreen({ profile, wardrobe, agentActivity: _agentActivity, agentInsights, handlers }) {
  const { GapAnalysisAgent, events, baseTransition } = handlers;

  return (
    <GapAnalysisAgent
      profile={profile}
      wardrobe={wardrobe}
      events={events}
      baseTransition={baseTransition}
      agentInsights={agentInsights}
    />
  );
}
