import { DurableObject } from "cloudflare:workers";
import { fetchAllBybitTickers, type PriceMap } from "../../functions/_shared/bybit";
import { applyAgentMigrations, generateAgents, executeStrategy } from "../../src/simulation";
import type { Agent } from "../../src/types";

const ENGINE_TICK_MS = 5000;
const ENGINE_STATE_KEY = "engine-state";
const ENGINE_OBJECT_NAME = "global-engine";
const AGENT_COUNT = 100;

type EngineState = {
  startedAt: number;
  savedAt: number;
  lastTickAt: number;
  agents: Agent[];
  prices: PriceMap;
  historyMap: Record<string, number[]>;
};

type Env = {
  TRADING_ENGINE: DurableObjectNamespace<TradingEngine>;
};

async function buildInitialState(): Promise<EngineState> {
  const prices = await fetchAllBybitTickers();
  const symbols = Object.keys(prices);
  const agents = generateAgents(AGENT_COUNT, symbols);
  const historyMap: Record<string, number[]> = {};

  for (const symbol of symbols) {
    const basePrice = prices[symbol];
    historyMap[symbol] = Array.from(
      { length: 20 },
      () => basePrice + (Math.random() - 0.5) * (basePrice * 0.005),
    );
  }

  const now = Date.now();
  return {
    startedAt: now,
    savedAt: now,
    lastTickAt: now,
    agents: applyAgentMigrations(agents, symbols),
    prices,
    historyMap,
  };
}

export default {
  async fetch(request: Request, env: Env) {
    const id = env.TRADING_ENGINE.idFromName(ENGINE_OBJECT_NAME);
    const stub = env.TRADING_ENGINE.get(id);
    return stub.fetch(request);
  },
};

export class TradingEngine extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/start") {
      const state = await this.ensureInitialized();
      return Response.json(this.toClientState(state));
    }

    if (request.method === "POST" && url.pathname === "/tick") {
      const state = await this.tickOnce();
      return Response.json(this.toClientState(state));
    }

    if (request.method === "GET" && url.pathname === "/state") {
      const state = await this.ensureInitialized();
      return Response.json(this.toClientState(state));
    }

    return new Response("Not Found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.tickOnce();
  }

  private async ensureInitialized(): Promise<EngineState> {
    const stored = await this.ctx.storage.get<EngineState>(ENGINE_STATE_KEY);
    if (stored) {
      const migrated = {
        ...stored,
        agents: applyAgentMigrations(stored.agents, Object.keys(stored.prices)),
      };
      await this.ctx.storage.put(ENGINE_STATE_KEY, migrated);
      await this.ensureAlarm();
      return migrated;
    }

    const state = await buildInitialState();
    await this.ctx.storage.put(ENGINE_STATE_KEY, state);
    await this.ctx.storage.setAlarm(Date.now() + ENGINE_TICK_MS);
    return state;
  }

  private async ensureAlarm(): Promise<void> {
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm === null) {
      await this.ctx.storage.setAlarm(Date.now() + ENGINE_TICK_MS);
    }
  }

  private async tickOnce(): Promise<EngineState> {
    const current = await this.ensureInitialized();
    const prices = await fetchAllBybitTickers();

    if (Object.keys(prices).length === 0) {
      await this.ctx.storage.setAlarm(Date.now() + ENGINE_TICK_MS);
      return current;
    }

    const nextHistoryMap: Record<string, number[]> = { ...current.historyMap };
    for (const [symbol, price] of Object.entries(prices)) {
      const existing = nextHistoryMap[symbol] ?? [];
      nextHistoryMap[symbol] = [...existing.slice(-19), price];
    }

    const nextAgents = applyAgentMigrations(current.agents, Object.keys(prices)).map((agent) => ({
      ...agent,
      ...executeStrategy(agent, prices, nextHistoryMap),
    }));

    const nextState: EngineState = {
      ...current,
      agents: nextAgents,
      prices,
      historyMap: nextHistoryMap,
      lastTickAt: Date.now(),
      savedAt: Date.now(),
    };

    await this.ctx.storage.put(ENGINE_STATE_KEY, nextState);
    await this.ctx.storage.setAlarm(Date.now() + ENGINE_TICK_MS);

    return nextState;
  }

  private toClientState(state: EngineState) {
    return {
      engineMode: true,
      startedAt: state.startedAt,
      savedAt: state.savedAt,
      lastTickAt: state.lastTickAt,
      prices: state.prices,
      agents: state.agents,
    };
  }
}
