const LEADER_LOCK_KEY = "agents:leader-lock";
const LEADER_TTL_MS = 20000;

let localLeaderLockRaw: string | null = null;

type RuntimeEnv = {
  AGENTS_STATE?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
};

type LeaderLock = {
  holderId: string;
  expiresAt: number;
};

function parseLeaderLock(raw: string | null): LeaderLock | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.holderId === "string" && typeof parsed.expiresAt === "number") {
      return parsed as LeaderLock;
    }
  } catch (error) {
    console.error("Failed to parse leader lock.", error);
  }

  return null;
}

async function readRaw(env: RuntimeEnv): Promise<string | null> {
  if (env.AGENTS_STATE) {
    return env.AGENTS_STATE.get(LEADER_LOCK_KEY);
  }
  return localLeaderLockRaw;
}

async function writeRaw(env: RuntimeEnv, raw: string): Promise<void> {
  if (env.AGENTS_STATE) {
    await env.AGENTS_STATE.put(LEADER_LOCK_KEY, raw);
    return;
  }
  localLeaderLockRaw = raw;
}

export async function getLeaderLock(env: RuntimeEnv): Promise<LeaderLock | null> {
  return parseLeaderLock(await readRaw(env));
}

export async function claimLeaderLock(env: RuntimeEnv, holderId: string) {
  const now = Date.now();
  const current = await getLeaderLock(env);

  if (current && current.holderId !== holderId && current.expiresAt > now) {
    return {
      leader: false,
      holderId: current.holderId,
      expiresAt: current.expiresAt,
    };
  }

  const next: LeaderLock = {
    holderId,
    expiresAt: now + LEADER_TTL_MS,
  };

  await writeRaw(env, JSON.stringify(next));

  return {
    leader: true,
    holderId: next.holderId,
    expiresAt: next.expiresAt,
  };
}
