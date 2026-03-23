import { readAgentsState, writeAgentsState } from "../_shared/agents-state";

export const onRequestGet = async (context: any) => {
  if (context.env.ENGINE_SERVICE) {
    try {
      return await context.env.ENGINE_SERVICE.fetch("https://engine/state");
    } catch (error) {
      console.error("Failed to fetch state from engine service.", error);
    }
  }

  const state = await readAgentsState(context.env);
  return Response.json(state);
};

export const onRequestPost = async (context: any) => {
  if (context.env.ENGINE_SERVICE) {
    return Response.json({ success: true, skipped: "engine_mode" });
  }

  try {
    const payload = await context.request.json();
    await writeAgentsState(context.env, payload);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to save agent state.", error);
    return Response.json({ error: "Failed to save state" }, { status: 500 });
  }
};
