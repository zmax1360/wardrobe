import React from "react";

export function EvaluatorScreen({ profile, wardrobe, agentActivity: _agentActivity, agentInsights, handlers }) {
  const { EvaluatorAgent, baseTransition, setAgentInsights } = handlers;

  return (
    <EvaluatorAgent
      profile={profile}
      wardrobe={wardrobe}
      baseTransition={baseTransition}
      setAgentInsights={setAgentInsights}
    />
  );
}
