import { readAgentsState, writeAgentsState } from "../_shared/agents-state";

export const onRequestGet = async (context: any) => {
  const state = await readAgentsState(context.env);
  return Response.json(state);
};

export const onRequestPost = async (context: any) => {
  try {
    const payload = await context.request.json();
    await writeAgentsState(context.env, payload);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to save agent state.", error);
    return Response.json({ error: "Failed to save state" }, { status: 500 });
  }
};
