export default async (req: Request) => {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category') || 'linear';

    const upstream = `https://api.bybit.com/v5/market/tickers?category=${encodeURIComponent(category)}`;
    const r = await fetch(upstream, {
      headers: {
        // Some upstreams vary behavior based on UA; set a safe one.
        'User-Agent': 'ai-trading-nexus-netlify-function',
        'Accept': 'application/json',
      },
    });

    const body = await r.text();

    return new Response(body, {
      status: r.status,
      headers: {
        'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8',
        // Allow your own site to call this function without CORS problems.
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'proxy_failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }
};

