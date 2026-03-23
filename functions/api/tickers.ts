import { fetchTickerResponse } from "../_shared/bybit";

export const onRequestGet = async (context: any) => {
  try {
    const url = new URL(context.request.url);
    const category = url.searchParams.get("category") || "linear";
    return await fetchTickerResponse(category);
  } catch (error) {
    console.error("Failed to proxy ticker request.", error);
    return Response.json({ error: "proxy_failed" }, { status: 502 });
  }
};
