import { useState } from "react";
import { COLORS } from "../styles/theme";
import { agentTraceHooks } from "../services/aiService";

const MAX_AGENT_HISTORY = 20;

/** Ensures history row keys stay unique when multiple runs finish in the same millisecond. */
let historyEntrySeq = 0;

function makeHistoryEntryId(agentName, completedAt) {
  historyEntrySeq += 1;
  return `${agentName}-${completedAt}-${historyEntrySeq}`;
}

const initialAgentActivity = {
  currentAgent: null,
  currentTask: null,
  status: "idle",
  startedAt: null,
  completedAt: null,
  durationMs: null,
  lastCompletedAgent: null,
  history: [],
};

export function useAgentActivity(activeNav) {
  const [agentActivity, setAgentActivity] = useState(initialAgentActivity);

  function startAgentRun(agentName, taskLabel) {
    const startedAt = Date.now();

    setAgentActivity((prev) => ({
      ...prev,
      currentAgent: agentName,
      currentTask: taskLabel,
      status: "running",
      startedAt,
      completedAt: null,
      durationMs: null,
    }));

    return startedAt;
  }

  function finishAgentRun(agentName, taskLabel, startedAt, meta = {}) {
    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    const historyEntry = {
      id: makeHistoryEntryId(agentName, completedAt),
      agentName,
      taskLabel,
      startedAt,
      completedAt,
      durationMs,
      status: meta.status || "success",
      summary: meta.summary || "",
    };

    setAgentActivity((prev) => ({
      ...prev,
      currentAgent: null,
      currentTask: null,
      status: "idle",
      startedAt: null,
      completedAt,
      durationMs,
      lastCompletedAgent: agentName,
      history: [historyEntry, ...(prev.history || [])].slice(0, MAX_AGENT_HISTORY),
    }));

    return durationMs;
  }

  function failAgentRun(agentName, taskLabel, startedAt, error) {
    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    const historyEntry = {
      id: makeHistoryEntryId(agentName, completedAt),
      agentName,
      taskLabel,
      startedAt,
      completedAt,
      durationMs,
      status: "error",
      summary: error?.message || "Unknown error",
    };

    setAgentActivity((prev) => ({
      ...prev,
      currentAgent: null,
      currentTask: null,
      status: "idle",
      startedAt: null,
      completedAt,
      durationMs,
      lastCompletedAgent: agentName,
      history: [historyEntry, ...(prev.history || [])].slice(0, MAX_AGENT_HISTORY),
    }));

    return durationMs;
  }

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

  agentTraceHooks.startAgentRun = startAgentRun;
  agentTraceHooks.finishAgentRun = finishAgentRun;
  agentTraceHooks.failAgentRun = failAgentRun;
  agentTraceHooks.getActiveNav = () => activeNav;

  return {
    agentActivity,
    setAgentActivity,
    MAX_AGENT_HISTORY,
    startAgentRun,
    finishAgentRun,
    failAgentRun,
    formatDuration,
    getAgentStatusTone,
  };
}
