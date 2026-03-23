const AGENTS_STATE_KEY = "agents:latest";

let localStateCache: string | null = null;

type SavedAgentsState = {
  savedAt: number;
  agents: Record<string, unknown>[];
};

type RuntimeEnv = {
  AGENTS_STATE?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
};

function parseSavedAgentsState(raw: string | null): SavedAgentsState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.agents)) {
      return {
        savedAt: Number(parsed.savedAt) || 0,
        agents: parsed.agents as Record<string, unknown>[],
      };
    }
  } catch (error) {
    console.error("Failed to parse saved agent state.", error);
  }

  return null;
}

function getAgentActivityScore(agent: Record<string, unknown>): number {
  const trades = Array.isArray(agent.trades) ? agent.trades.length : 0;
  const activePositions =
    agent.activePositions && typeof agent.activePositions === "object"
      ? Object.keys(agent.activePositions as Record<string, unknown>).length
      : 0;
  const equity = typeof agent.equity === "number" ? agent.equity : 1000;
  const equityDeviation = Math.min(Math.abs(equity - 1000) / 25, 8);

  return trades * 4 + activePositions * 6 + equityDeviation;
}

function getStateActivityScore(state: SavedAgentsState | null): number {
  if (!state) {
    return 0;
  }

  return state.agents.reduce((sum, agent) => sum + getAgentActivityScore(agent), 0);
}

function shouldRejectAsResetCandidate(
  incomingState: SavedAgentsState | null,
  currentState: SavedAgentsState | null,
): boolean {
  if (!incomingState || !currentState) {
    return false;
  }

  const incomingScore = getStateActivityScore(incomingState);
  const currentScore = getStateActivityScore(currentState);

  // If the existing state is much richer and the incoming snapshot suddenly looks
  // mostly empty, treat it as an accidental reset rather than a valid update.
  return currentScore >= 120 && incomingScore < currentScore * 0.45;
}

export async function readAgentsState(env: RuntimeEnv): Promise<unknown | null> {
  const raw = env.AGENTS_STATE
    ? await env.AGENTS_STATE.get(AGENTS_STATE_KEY)
    : localStateCache;

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Failed to parse saved agent state.", error);
    return null;
  }
}

export async function writeAgentsState(env: RuntimeEnv, payload: unknown): Promise<void> {
  const raw = JSON.stringify(payload);
  const incomingState = parseSavedAgentsState(raw);

  if (env.AGENTS_STATE) {
    const currentState = parseSavedAgentsState(await env.AGENTS_STATE.get(AGENTS_STATE_KEY));
    if (incomingState && currentState && incomingState.savedAt < currentState.savedAt) {
      return;
    }
    if (shouldRejectAsResetCandidate(incomingState, currentState)) {
      return;
    }

    await env.AGENTS_STATE.put(AGENTS_STATE_KEY, raw);
    return;
  }

  const currentState = parseSavedAgentsState(localStateCache);
  if (incomingState && currentState && incomingState.savedAt < currentState.savedAt) {
    return;
  }
  if (shouldRejectAsResetCandidate(incomingState, currentState)) {
    return;
  }

  localStateCache = raw;
}
