import React from "react";

export function PlannerScreen({ profile, wardrobe, agentActivity: _agentActivity, agentInsights, handlers }) {
  const { PlannerAgent, events, setEvents, setActiveNav, baseTransition } = handlers;

  return (
    <PlannerAgent
      profile={profile}
      wardrobe={wardrobe}
      events={events}
      setActiveNav={setActiveNav}
      baseTransition={baseTransition}
      agentInsights={agentInsights}
    />
  );
}
