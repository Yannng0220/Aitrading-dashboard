import { fetchAllBybitTickers } from "../../_shared/bybit";

const encoder = new TextEncoder();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sseChunk(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const onRequestGet = async (context: any) => {
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const signal = context.request.signal;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      };

      signal?.addEventListener("abort", close);

      try {
        controller.enqueue(
          sseChunk("prices", {
            ts: Date.now(),
            prices: await fetchAllBybitTickers(),
          }),
        );

        let heartbeatAt = Date.now();

        while (!closed) {
          await sleep(1000);
          if (closed) break;

          try {
            controller.enqueue(
              sseChunk("prices", {
                ts: Date.now(),
                prices: await fetchAllBybitTickers(),
              }),
            );
          } catch (error) {
            console.error("Price stream fetch failed.", error);
            controller.enqueue(
              sseChunk("error", {
                ts: Date.now(),
                message: "price_fetch_failed",
              }),
            );
          }

          if (Date.now() - heartbeatAt >= 15000) {
            controller.enqueue(
              sseChunk("ping", {
                ts: Date.now(),
              }),
            );
            heartbeatAt = Date.now();
          }
        }
      } finally {
        signal?.removeEventListener("abort", close);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};
