import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(__dirname, "agents_state.json");

type PriceMap = Record<string, number>;

async function fetchAllBybitTickers(): Promise<PriceMap> {
  try {
    const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear`);
    const data = await response.json();
    if (data?.retCode === 0 && data?.result?.list) {
      const prices: PriceMap = {};
      for (const item of data.result.list as any[]) {
        if (typeof item?.symbol === "string" && item.symbol.endsWith("USDT")) {
          const n = Number.parseFloat(item.lastPrice);
          if (!Number.isNaN(n)) prices[item.symbol] = n;
        }
      }
      if (Object.keys(prices).length === 0) {
        prices["BTCUSDT"] = 65000 + (Math.random() - 0.5) * 100;
      }
      return prices;
    }
    throw new Error("Invalid API response");
  } catch (error) {
    console.error("Error fetching Bybit tickers, using fallback:", error);
    return {
      BTCUSDT: 65000 + (Math.random() - 0.5) * 100,
      ETHUSDT: 3500 + (Math.random() - 0.5) * 10,
      SOLUSDT: 145 + (Math.random() - 0.5) * 2,
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Minor hardening
  app.disable("x-powered-by");
  app.use(express.json({ limit: '50mb' }));

  // API to get agents state
  app.get("/api/agents", (req, res) => {
    if (fs.existsSync(STATE_FILE)) {
      try {
        const data = fs.readFileSync(STATE_FILE, "utf-8");
        return res.json(JSON.parse(data));
      } catch (error) {
        console.error("Error reading state file:", error);
        return res.status(500).json({ error: "Failed to read state" });
      }
    }
    res.json(null);
  });

  // API to save agents state
  app.post("/api/agents", (req, res) => {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving state file:", error);
      res.status(500).json({ error: "Failed to save state" });
    }
  });

  // REST proxy for Bybit tickers (useful for browser CORS / matching Netlify proxy route)
  app.get("/api/tickers", async (req, res) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category : "linear";
      const upstream = `https://api.bybit.com/v5/market/tickers?category=${encodeURIComponent(category)}`;
      const r = await fetch(upstream);
      const text = await r.text();
      res.status(r.status);
      res.setHeader("Content-Type", r.headers.get("content-type") || "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(text);
    } catch (error) {
      res.status(502).json({ error: "proxy_failed" });
    }
  });

  // Server-Sent Events (SSE) stream for realtime market prices
  app.get("/api/stream/prices", async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Kick off immediately
    try {
      const prices = await fetchAllBybitTickers();
      send("prices", { ts: Date.now(), prices });
    } catch {
      // ignored
    }

    const interval = setInterval(async () => {
      if (closed) return;
      try {
        const prices = await fetchAllBybitTickers();
        send("prices", { ts: Date.now(), prices });
      } catch (err) {
        send("error", { ts: Date.now(), message: "price_fetch_failed" });
      }
    }, 1000); // 1s stream cadence (client can choose what to do with updates)

    const heartbeat = setInterval(() => {
      if (closed) return;
      send("ping", { ts: Date.now() });
    }, 15000);

    req.on("close", () => {
      clearInterval(interval);
      clearInterval(heartbeat);
      try {
        res.end();
      } catch {
        // ignored
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
