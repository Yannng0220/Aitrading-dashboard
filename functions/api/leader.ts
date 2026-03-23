import { claimLeaderLock, getLeaderLock } from "../_shared/leader-lock";

export const onRequestGet = async (context: any) => {
  const state = await getLeaderLock(context.env);
  return Response.json(state ?? { holderId: null, expiresAt: 0 });
};

export const onRequestPost = async (context: any) => {
  try {
    const payload = await context.request.json();
    const holderId = typeof payload?.holderId === "string" ? payload.holderId : "";
    if (!holderId) {
      return Response.json({ error: "holderId is required" }, { status: 400 });
    }

    const result = await claimLeaderLock(context.env, holderId);
    return Response.json(result);
  } catch (error) {
    console.error("Failed to update leader lock.", error);
    return Response.json({ error: "Failed to update leader lock" }, { status: 500 });
  }
};
