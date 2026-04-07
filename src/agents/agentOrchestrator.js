import { agentTraceHooks, callTextCompletion } from "../services/aiService";

export async function runAgent({
  agentName,
  task,
  systemPrompt,
  userPrompt,
}) {
  const startedAt = agentTraceHooks.startAgentRun(agentName, task);

  try {
    const result = await callTextCompletion(systemPrompt, userPrompt, task);

    agentTraceHooks.finishAgentRun(agentName, task, startedAt, {
      status: "success",
    });

    return result;
  } catch (err) {
    agentTraceHooks.failAgentRun(agentName, task, startedAt, err);
    throw err;
  }
}
