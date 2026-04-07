import { useState, useEffect } from "react";

export function useAgentInsights() {
  const [agentInsights, setAgentInsights] = useState(() => {
    const saved = localStorage.getItem("agentInsights");
    try {
      return saved
        ? JSON.parse(saved)
        : {
            frequentIssues: [],
            preferredStyles: [],
            avoidedItems: [],
          };
    } catch {
      return {
        frequentIssues: [],
        preferredStyles: [],
        avoidedItems: [],
      };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("agentInsights", JSON.stringify(agentInsights));
    } catch {
      /* ignore quota */
    }
  }, [agentInsights]);

  return [agentInsights, setAgentInsights];
}
