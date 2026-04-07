import React from "react";

export function ShopperScreen({ profile, wardrobe, agentActivity: _agentActivity, agentInsights, handlers }) {
  const { ShopperAgent, baseTransition } = handlers;

  return (
    <ShopperAgent profile={profile} wardrobe={wardrobe} baseTransition={baseTransition} agentInsights={agentInsights} />
  );
}
