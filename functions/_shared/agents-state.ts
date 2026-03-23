const AGENTS_STATE_KEY = "agents:latest";

let localStateCache: string | null = null;

type RuntimeEnv = {
  AGENTS_STATE?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
};

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

  if (env.AGENTS_STATE) {
    await env.AGENTS_STATE.put(AGENTS_STATE_KEY, raw);
    return;
  }

  localStateCache = raw;
}
