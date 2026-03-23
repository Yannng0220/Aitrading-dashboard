export type PriceMap = Record<string, number>;

const BYBIT_BASE_URL = "https://api.bybit.com/v5/market/tickers";

export async function fetchAllBybitTickers(): Promise<PriceMap> {
  try {
    const response = await fetch(`${BYBIT_BASE_URL}?category=linear`, {
      headers: {
        Accept: "application/json",
      },
    } as RequestInit);

    const data = await response.json();
    if (data?.retCode === 0 && Array.isArray(data?.result?.list)) {
      const prices: PriceMap = {};

      for (const item of data.result.list) {
        if (typeof item?.symbol !== "string" || !item.symbol.endsWith("USDT")) {
          continue;
        }

        const price = Number.parseFloat(item.lastPrice);
        if (!Number.isNaN(price)) {
          prices[item.symbol] = price;
        }
      }

      if (Object.keys(prices).length > 0) {
        return prices;
      }
    }

    throw new Error("Invalid Bybit ticker payload");
  } catch (error) {
    console.error("Failed to fetch Bybit tickers, using fallback prices.", error);
    return {
      BTCUSDT: 65000 + (Math.random() - 0.5) * 100,
      ETHUSDT: 3500 + (Math.random() - 0.5) * 10,
      SOLUSDT: 145 + (Math.random() - 0.5) * 2,
    };
  }
}

export async function fetchTickerResponse(category: string): Promise<Response> {
  const upstreamUrl = `${BYBIT_BASE_URL}?category=${encodeURIComponent(category || "linear")}`;
  const response = await fetch(upstreamUrl, {
    headers: {
      Accept: "application/json",
    },
  } as RequestInit);

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
