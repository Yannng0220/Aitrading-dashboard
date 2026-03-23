const AGENTS_STATE_KEY = "agents:latest";

let localStateCache: string | null = null;

type SavedAgentsState = {
  savedAt: number;
  agents: unknown[];
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
        agents: parsed.agents,
      };
    }
  } catch (error) {
    console.error("Failed to parse saved agent state.", error);
  }

  return null;
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

    await env.AGENTS_STATE.put(AGENTS_STATE_KEY, raw);
    return;
  }

  const currentState = parseSavedAgentsState(localStateCache);
  if (incomingState && currentState && incomingState.savedAt < currentState.savedAt) {
    return;
  }

  localStateCache = raw;
}
