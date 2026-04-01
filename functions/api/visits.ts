const VISIT_COUNT_KEY = "site:visit-count";
const VISIT_SESSION_PREFIX = "site:visit-session:";

function readCount(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export const onRequestGet = async (context: any) => {
  const count = readCount(await context.env.AGENTS_STATE?.get(VISIT_COUNT_KEY));
  return Response.json({ count });
};

export const onRequestPost = async (context: any) => {
  try {
    const payload = await context.request.json();
    const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
    if (!sessionId) {
      return Response.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const sessionKey = `${VISIT_SESSION_PREFIX}${sessionId}`;
    const seen = await context.env.AGENTS_STATE?.get(sessionKey);
    if (seen) {
      const count = readCount(await context.env.AGENTS_STATE?.get(VISIT_COUNT_KEY));
      return Response.json({ count, counted: false });
    }

    const currentCount = readCount(await context.env.AGENTS_STATE?.get(VISIT_COUNT_KEY));
    const nextCount = currentCount + 1;

    await context.env.AGENTS_STATE?.put(VISIT_COUNT_KEY, String(nextCount));
    await context.env.AGENTS_STATE?.put(sessionKey, String(Date.now()), {
      expirationTtl: 60 * 60 * 24 * 30,
    });

    return Response.json({ count: nextCount, counted: true });
  } catch (error) {
    console.error("Failed to update visit count.", error);
    return Response.json({ error: "Failed to update visit count" }, { status: 500 });
  }
};
