import React from "react";

export function DesignerScreen({
  profile,
  wardrobe,
  agentActivity: _agentActivity,
  agentInsights: _agentInsights,
  handlers,
}) {
  const { DesignerAgent, baseTransition } = handlers;

  return <DesignerAgent profile={profile} wardrobe={wardrobe} baseTransition={baseTransition} />;
}
