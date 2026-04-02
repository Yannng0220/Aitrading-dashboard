import { Agent, Position, Trade } from './types';

export type PriceMap = Record<string, number>;
export type StrategyExecutionOptions = {
  entriesEnabled?: boolean;
  preferredEntrySide?: 'LONG' | 'SHORT' | null;
};

const DEFAULT_SYMBOLS = ['BTCUSDT'];
const FEE_RATE = 0.0006;
const BASE_BALANCE = 1000;
const SMC_AGENT_ID = 4;
const SMC_STRATEGY_VERSION = 'smc-five-core-v1';
const AUTO_CLOSE_LOSS_USD = -100;
const AUTO_CLOSE_PROFIT_USD = 200;

const STRATEGY_DESCRIPTIONS = [
  'RSI mean reversion around oversold and overbought extremes.',
  'Trend-following momentum with moving-average confirmation.',
  'Breakout continuation after multi-session compression.',
  'MACD crossover with volatility filter.',
  'VWAP deviation fade with dynamic risk control.',
  'ATR expansion breakout after low-volatility range.',
  'KDJ oscillator reversal model.',
  'ATR stop-and-reverse intraday engine.',
  'Parabolic SAR trend continuation model.',
  'Ichimoku cloud continuation and pullback entries.',
  'Williams %R reversal timing.',
  'CCI impulse rotation model.',
  'OBV confirmation for directional flow.',
  'Aroon trend emergence detector.',
  'TRIX acceleration filter.',
  'Chaikin volatility expansion model.',
  'Donchian breakout with pullback validation.',
  'Keltner channel trend ride.',
  'Fractal breakout scanner.',
  'Force index pressure model.',
];

const ADJECTIVES: string[] = [];
const NOUNS: string[] = [];


type StrategyParams = {
  logicVersion?: string;
  riskTolerance: number;
  timeframe: 'SHORT' | 'LONG';
  sensitivity: number;
  threshold: number;
  exitThreshold: number;
  stopLoss: number;
  takeProfit: number;
  leverageMin?: number;
  leverageMax?: number;
  maxRiskPerTrade?: number;
  confirmationThreshold?: number;
  orderBlockTolerance?: number;
  preferredSymbols?: string[];
  scanCount?: number;
  maxConcurrentPositions?: number;
  useAbsoluteUsdExit?: boolean;
};

type SmcSignals = {
  direction: 'LONG' | 'SHORT' | null;
  oiBias: number;
  cvdBias: number;
  bos: boolean;
  choch: boolean;
  orderBlockMid: number;
  orderBlockDistance: number;
  nearOrderBlock: boolean;
  fvg: boolean;
  liquiditySweep: boolean;
  confirmationScore: number;
  reasons: string[];
  invalidationScore: number;
};

function buildGenericName(index: number) {
  return `AI#${index + 1}`;
}

function getMaxLeverage(symbol: string): number {
  if (symbol === 'BTCUSDT' || symbol === 'ETHUSDT') return 100;
  if (['SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT'].includes(symbol)) return 50;
  return 20;
}

function getStrategyParams(agent: Agent): StrategyParams {
  const params = (agent.strategyParams ?? {}) as StrategyParams;
  return {
    riskTolerance: params.riskTolerance ?? 0.1,
    timeframe: params.timeframe ?? 'SHORT',
    sensitivity: params.sensitivity ?? 1,
    threshold: params.threshold ?? 0.002,
    exitThreshold: params.exitThreshold ?? 0.005,
    stopLoss: params.stopLoss ?? 0.02,
    takeProfit: params.takeProfit ?? 0.04,
    leverageMin: params.leverageMin ?? 3,
    leverageMax: params.leverageMax ?? 12,
    maxRiskPerTrade: params.maxRiskPerTrade ?? 0.02,
    confirmationThreshold: params.confirmationThreshold ?? 4,
    orderBlockTolerance: params.orderBlockTolerance ?? 0.004,
    preferredSymbols: params.preferredSymbols ?? [],
    scanCount: params.scanCount ?? 15,
    maxConcurrentPositions: params.maxConcurrentPositions ?? 99,
    useAbsoluteUsdExit: params.useAbsoluteUsdExit ?? true,
    logicVersion: params.logicVersion,
  };
}

function createSmcAgent(availableSymbols: string[], existingName?: string): Agent {
  const preferred = availableSymbols.slice(0, 12);
  return {
    id: SMC_AGENT_ID,
    name: existingName ?? `AI#${SMC_AGENT_ID + 1}`,
    strategyType: 'SMC / CoinAnk',
    strategy:
      'SMC five-core workflow: BOS, CHoCH, Order Block, FVG, Liquidity Sweep, plus CoinAnk-style OI/CVD/liquidation/orderflow proxy confirmation before layered entries.',
    balance: BASE_BALANCE,
    activePositions: {},
    equity: BASE_BALANCE,
    unrealizedPL: 0,
    trades: [],
    performance: 0,
    color: 'hsl(36, 88%, 54%)',
    status: 'IDLE',
    strategyParams: {
      logicVersion: SMC_STRATEGY_VERSION,
      riskTolerance: 0.02,
      timeframe: 'SHORT',
      sensitivity: 1.15,
      threshold: 0.003,
      exitThreshold: 0.004,
      stopLoss: 0.01,
      takeProfit: 0.025,
      leverageMin: 4,
      leverageMax: 8,
      maxRiskPerTrade: 0.02,
      confirmationThreshold: 4,
      orderBlockTolerance: 0.0035,
      preferredSymbols: preferred,
      scanCount: 12,
      maxConcurrentPositions: 5,
    },
  };
}

export function applyAgentMigrations(agents: Agent[], availableSymbols: string[] = DEFAULT_SYMBOLS): Agent[] {
  return agents.map((agent, index) => {
    if (index !== SMC_AGENT_ID) return { ...agent, name: buildGenericName(index) };
    const params = getStrategyParams(agent);
    if (params.logicVersion === SMC_STRATEGY_VERSION) {
      return {
        ...agent,
        name: buildGenericName(index),
        strategyType: 'SMC / CoinAnk',
        strategy:
          'SMC five-core workflow: BOS, CHoCH, Order Block, FVG, Liquidity Sweep, plus CoinAnk-style OI/CVD/liquidation/orderflow proxy confirmation before layered entries.',
        strategyParams: {
          ...params,
          logicVersion: SMC_STRATEGY_VERSION,
        },
      };
    }
    return createSmcAgent(availableSymbols, buildGenericName(index));
  });
}

export const fetchAllBybitTickers = async (): Promise<PriceMap> => {
  try {
    const response = await fetch('/api/tickers?category=linear');
    const data = await response.json();
    if (data.retCode === 0 && data.result.list) {
      const prices: PriceMap = {};
      data.result.list.forEach((item: any) => {
        if (item.symbol.endsWith('USDT')) {
          prices[item.symbol] = parseFloat(item.lastPrice);
        }
      });
      if (Object.keys(prices).length === 0) {
        prices.BTCUSDT = 65000 + (Math.random() - 0.5) * 100;
      }
      return prices;
    }
    throw new Error('Invalid API response');
  } catch (error) {
    console.error('Error fetching Bybit tickers, using fallback:', error);
    return {
      BTCUSDT: 65000 + (Math.random() - 0.5) * 100,
      ETHUSDT: 3500 + (Math.random() - 0.5) * 10,
      SOLUSDT: 145 + (Math.random() - 0.5) * 2,
    };
  }
};

export const generateAgents = (count: number, availableSymbols: string[] = DEFAULT_SYMBOLS): Agent[] => {
  const agents: Agent[] = Array.from({ length: count }, (_, index) => {
    const description = STRATEGY_DESCRIPTIONS[index % STRATEGY_DESCRIPTIONS.length];
    const sensitivity = 0.65 + Math.random() * 1.2;
    const riskTolerance = 0.05 + Math.random() * 0.18;
    const timeframe = Math.random() > 0.5 ? 'SHORT' : 'LONG';

    return {
      id: index,
      name: buildGenericName(index),
      strategy: `${description} (risk=${riskTolerance.toFixed(2)}, sensitivity=${sensitivity.toFixed(2)})`,
      strategyType: index < 30 ? 'Momentum' : index < 60 ? 'Trend' : 'Mean Reversion',
      balance: BASE_BALANCE,
      activePositions: {},
      equity: BASE_BALANCE,
      unrealizedPL: 0,
      trades: [],
      performance: 0,
      color: timeframe === 'SHORT' ? `hsl(${10 + Math.random() * 40}, 80%, 50%)` : `hsl(${200 + Math.random() * 40}, 60%, 50%)`,
      status: 'IDLE',
      strategyParams: {
        riskTolerance,
        timeframe,
        sensitivity,
        threshold: 0.002 * sensitivity,
        exitThreshold: 0.005 * sensitivity,
        stopLoss: 0.02 / sensitivity,
        takeProfit: 0.04 * sensitivity,
        leverageMin: 3,
        leverageMax: 12,
        maxRiskPerTrade: 0.03,
        maxConcurrentPositions: 99,
      },
    };
  });

  if (agents.length > SMC_AGENT_ID) {
    agents[SMC_AGENT_ID] = createSmcAgent(availableSymbols);
  }

  if (agents.length > 99 && agents[19]) {
    const template = agents[19];
    agents[99] = {
      ...agents[99],
      strategyType: template.strategyType,
      strategy: template.strategy,
      strategyParams: template.strategyParams,
    };
  }

  return agents;
};

function createTradeId() {
  return Math.random().toString(36).slice(2, 11);
}

function previousPrice(history: number[], currentPrice: number) {
  if (history.length >= 2) return history[history.length - 2];
  if (history.length >= 1) return history[history.length - 1];
  return currentPrice;
}

function unrealizedPnl(pos: Position, currentPrice: number) {
  return pos.side === 'SHORT'
    ? (pos.avgEntryPrice - currentPrice) * pos.amount
    : (currentPrice - pos.avgEntryPrice) * pos.amount;
}

function getAbsolutePnlExitReason(currentUnrealizedPnl: number) {
  if (currentUnrealizedPnl <= AUTO_CLOSE_LOSS_USD) {
    return `Absolute loss stop | pnl $${currentUnrealizedPnl.toFixed(2)}`;
  }

  if (currentUnrealizedPnl >= AUTO_CLOSE_PROFIT_USD) {
    return `Absolute profit target | pnl +$${currentUnrealizedPnl.toFixed(2)}`;
  }

  return null;
}

function computeEquity(balance: number, positions: Record<string, Position>, allPrices: PriceMap) {
  let totalUnrealizedPL = 0;
  const normalized: Record<string, Position> = {};

  Object.entries(positions).forEach(([symbol, rawPos]) => {
    const currentPrice = allPrices[symbol];
    const pos: Position = {
      ...rawPos,
      side: rawPos.side === 'SHORT' ? 'SHORT' : 'LONG',
      unrealizedPL: currentPrice ? unrealizedPnl(rawPos, currentPrice) : rawPos.unrealizedPL,
    };
    totalUnrealizedPL += pos.unrealizedPL;
    normalized[symbol] = pos;
  });

  return {
    positions: normalized,
    totalUnrealizedPL,
    equity: Math.max(0, balance + totalUnrealizedPL),
  };
}

function appendTrade(trades: Trade[], trade: Trade) {
  trades.unshift(trade);
  return trades.slice(0, 20);
}

function closePosition(
  agent: Agent,
  symbol: string,
  currentPrice: number,
  positions: Record<string, Position>,
  trades: Trade[],
  balance: number,
  reason: string,
) {
  const pos = positions[symbol];
  if (!pos) {
    return { balance, positions, trades, status: agent.status };
  }

  const exitValue = pos.amount * currentPrice;
  const entryValue = pos.amount * pos.avgEntryPrice;
  const fee = exitValue * FEE_RATE;
  const pnl = pos.side === 'SHORT'
    ? (entryValue - exitValue) - fee
    : (exitValue - entryValue) - fee;

  const nextPositions = { ...positions };
  delete nextPositions[symbol];

  const exitOrderType: Trade['type'] = pos.side === 'SHORT' ? 'BUY' : 'SELL';
  const nextTrades = appendTrade(trades, {
    id: createTradeId(),
    timestamp: Date.now(),
    symbol,
    type: exitOrderType,
    action: 'EXIT',
    positionSide: pos.side,
    price: currentPrice,
    amount: pos.amount,
    fee,
    leverage: pos.leverage,
    realizedPL: pnl,
    reason,
  });

  return {
    balance: balance + pnl,
    positions: nextPositions,
    trades: nextTrades,
    status: exitOrderType === 'BUY' ? 'BUYING' : 'SELLING' as Agent['status'],
  };
}

function openPosition(
  symbol: string,
  side: Position['side'],
  price: number,
  leverage: number,
  margin: number,
  positions: Record<string, Position>,
  trades: Trade[],
  balance: number,
  reason: string,
) {
  const notional = margin * leverage;
  const fee = notional * FEE_RATE;
  const amount = Math.max(0, (notional - fee) / price);

  if (amount <= 0) {
    return { balance, positions, trades, status: 'IDLE' as Agent['status'] };
  }

  const nextPositions = {
    ...positions,
    [symbol]: {
      symbol,
      amount,
      avgEntryPrice: price,
      leverage,
      unrealizedPL: 0,
      side,
    },
  };

  const orderType: Trade['type'] = side === 'SHORT' ? 'SELL' : 'BUY';
  const nextTrades = appendTrade(trades, {
    id: createTradeId(),
    timestamp: Date.now(),
    symbol,
    type: orderType,
    action: 'ENTRY',
    positionSide: side,
    price,
    amount,
    leverage,
    fee,
    reason,
  });

  return {
    balance: balance - fee,
    positions: nextPositions,
    trades: nextTrades,
    status: orderType === 'BUY' ? 'BUYING' : 'SELLING' as Agent['status'],
  };
}

export function liquidateAgentPositions(agent: Agent, allPrices: PriceMap, reason: string): Partial<Agent> | null {
  if (!agent.activePositions || Object.keys(agent.activePositions).length === 0) {
    return null;
  }

  let balance = agent.balance;
  let trades = [...agent.trades];
  let status: Agent['status'] = agent.status;
  let positions: Record<string, Position> = Object.fromEntries(
    Object.entries(agent.activePositions).map(([symbol, pos]) => [
      symbol,
      {
        ...pos,
        side: pos.side === 'SHORT' ? 'SHORT' : 'LONG',
      },
    ]),
  ) as Record<string, Position>;

  for (const symbol of Object.keys(positions)) {
    const currentPrice = allPrices[symbol];
    if (!currentPrice) continue;
    const result = closePosition(agent, symbol, currentPrice, positions, trades, balance, reason);
    balance = result.balance;
    positions = result.positions;
    trades = result.trades;
    status = result.status;
  }

  const updated = computeEquity(balance, positions, allPrices);
  const performance = ((updated.equity - BASE_BALANCE) / BASE_BALANCE) * 100;

  return {
    balance,
    activePositions: updated.positions,
    equity: updated.equity,
    unrealizedPL: updated.totalUnrealizedPL,
    performance,
    status,
    trades,
  };
}

export function enforceAutoCloseThresholds(agent: Agent, allPrices: PriceMap): Partial<Agent> | null {
  const params = getStrategyParams(agent);
  if (!params.useAbsoluteUsdExit) {
    return null;
  }

  if (!agent.activePositions || Object.keys(agent.activePositions).length === 0) {
    return null;
  }

  let balance = agent.balance;
  let trades = [...agent.trades];
  let status: Agent['status'] = agent.status;
  let positions: Record<string, Position> = Object.fromEntries(
    Object.entries(agent.activePositions).map(([symbol, pos]) => [
      symbol,
      {
        ...pos,
        side: pos.side === 'SHORT' ? 'SHORT' : 'LONG',
      },
    ]),
  ) as Record<string, Position>;
  let changed = false;

  for (const symbol of Object.keys(positions)) {
    const currentPrice = allPrices[symbol];
    if (!currentPrice) continue;

    const currentUnrealizedPnl = unrealizedPnl(positions[symbol], currentPrice);
    const absolutePnlExitReason = getAbsolutePnlExitReason(currentUnrealizedPnl);
    if (!absolutePnlExitReason) continue;

    const result = closePosition(agent, symbol, currentPrice, positions, trades, balance, absolutePnlExitReason);
    balance = result.balance;
    positions = result.positions;
    trades = result.trades;
    status = result.status;
    changed = true;
  }

  if (!changed) {
    return null;
  }

  const updated = computeEquity(balance, positions, allPrices);
  const performance = ((updated.equity - BASE_BALANCE) / BASE_BALANCE) * 100;

  return {
    balance,
    activePositions: updated.positions,
    equity: updated.equity,
    unrealizedPL: updated.totalUnrealizedPL,
    performance,
    status,
    trades,
  };
}

function buildSmcSignals(history: number[], currentPrice: number, params: StrategyParams): SmcSignals {
  const recent = history.slice(-24);
  const previous = previousPrice(recent, currentPrice);
  const prevSegment = recent.slice(-12, -1);
  const recentHigh = prevSegment.length > 0 ? Math.max(...prevSegment) : currentPrice;
  const recentLow = prevSegment.length > 0 ? Math.min(...prevSegment) : currentPrice;
  const trendMove = recent.length > 6 ? (recent[recent.length - 1] - recent[0]) / recent[0] : 0;
  const impulse = previous !== 0 ? (currentPrice - previous) / previous : 0;
  const returns = recent.slice(1).map((price, index) => (price - recent[index]) / recent[index]);
  const oiBias = returns.slice(-6).reduce((sum, value) => sum + value, 0);
  const cvdBias = returns.slice(-8).reduce((sum, value) => sum + Math.sign(value) * Math.abs(value) * 1.4, 0);
  const bosLong = currentPrice > recentHigh * (1 + params.threshold);
  const bosShort = currentPrice < recentLow * (1 - params.threshold);
  const chochLong = trendMove < 0 && impulse > params.threshold * 0.8;
  const chochShort = trendMove > 0 && impulse < -params.threshold * 0.8;

  const blockWindow = recent.slice(-8, -3);
  const orderBlockMid = blockWindow.length > 0
    ? blockWindow.reduce((sum, value) => sum + value, 0) / blockWindow.length
    : currentPrice;
  const orderBlockDistance = Math.abs(currentPrice - orderBlockMid) / Math.max(currentPrice, 1);
  const nearOrderBlock = orderBlockDistance <= (params.orderBlockTolerance ?? 0.004);

  const gapReference = recent.length > 4 ? recent[recent.length - 4] : previous;
  const fvg = Math.abs(currentPrice - gapReference) / Math.max(gapReference, 1) > params.threshold * 1.1;
  const liquiditySweepLong = previous > recentHigh * (1 + params.threshold * 0.6) && currentPrice <= recentHigh;
  const liquiditySweepShort = previous < recentLow * (1 - params.threshold * 0.6) && currentPrice >= recentLow;

  let direction: 'LONG' | 'SHORT' | null = null;
  if (oiBias > 0 && cvdBias > 0) direction = 'LONG';
  if (oiBias < 0 && cvdBias < 0) direction = 'SHORT';

  const reasons: string[] = [];
  let confirmationScore = 0;
  let invalidationScore = 0;

  if (direction === 'LONG') {
    if (bosLong) {
      confirmationScore += 1;
      reasons.push('BOS up');
    }
    if (chochLong) {
      confirmationScore += 1;
      reasons.push('CHoCH up');
    }
    if (nearOrderBlock) {
      confirmationScore += 1;
      reasons.push('OB');
    }
    if (fvg) {
      confirmationScore += 1;
      reasons.push('FVG');
    }
    if (liquiditySweepShort) {
      confirmationScore += 1;
      reasons.push('Sweep down');
    }
    if (oiBias > params.threshold * 1.5) {
      confirmationScore += 1;
      reasons.push('OI up');
    }
    if (cvdBias > params.threshold * 1.5) {
      confirmationScore += 1;
      reasons.push('CVD up');
    }
    if (trendMove < -params.threshold) invalidationScore += 1;
  } else if (direction === 'SHORT') {
    if (bosShort) {
      confirmationScore += 1;
      reasons.push('BOS down');
    }
    if (chochShort) {
      confirmationScore += 1;
      reasons.push('CHoCH down');
    }
    if (nearOrderBlock) {
      confirmationScore += 1;
      reasons.push('OB');
    }
    if (fvg) {
      confirmationScore += 1;
      reasons.push('FVG');
    }
    if (liquiditySweepLong) {
      confirmationScore += 1;
      reasons.push('Sweep up');
    }
    if (oiBias < -params.threshold * 1.5) {
      confirmationScore += 1;
      reasons.push('OI down');
    }
    if (cvdBias < -params.threshold * 1.5) {
      confirmationScore += 1;
      reasons.push('CVD down');
    }
    if (trendMove > params.threshold) invalidationScore += 1;
  }

  return {
    direction,
    oiBias,
    cvdBias,
    bos: bosLong || bosShort,
    choch: chochLong || chochShort,
    orderBlockMid,
    orderBlockDistance,
    nearOrderBlock,
    fvg,
    liquiditySweep: liquiditySweepLong || liquiditySweepShort,
    confirmationScore,
    reasons,
    invalidationScore,
  };
}

function executeSmcStrategy(
  agent: Agent,
  allPrices: PriceMap,
  allHistories: Record<string, number[]>,
  options: StrategyExecutionOptions = {},
): Partial<Agent> {
  const entriesEnabled = options.entriesEnabled ?? true;
  const preferredEntrySide = options.preferredEntrySide ?? null;
  const params = getStrategyParams(agent);
  let balance = agent.balance;
  let trades = [...agent.trades];
  let status: Agent['status'] = 'IDLE';
  let positions: Record<string, Position> = Object.fromEntries(
    Object.entries(agent.activePositions || {}).map(([symbol, pos]) => [
      symbol,
      {
        ...pos,
        side: pos.side === 'SHORT' ? 'SHORT' : 'LONG',
      },
    ]),
  ) as Record<string, Position>;

  for (const symbol of Object.keys(positions)) {
    const currentPrice = allPrices[symbol];
    const history = allHistories[symbol] ?? [];
    if (!currentPrice) continue;

    const pos = positions[symbol];
    const currentUnrealizedPnl = unrealizedPnl(pos, currentPrice);
    const pnlPct = pos.side === 'SHORT'
      ? (pos.avgEntryPrice - currentPrice) / pos.avgEntryPrice
      : (currentPrice - pos.avgEntryPrice) / pos.avgEntryPrice;
    const signals = buildSmcSignals(history, currentPrice, params);

    const absolutePnlExitReason = params.useAbsoluteUsdExit ? getAbsolutePnlExitReason(currentUnrealizedPnl) : null;
    const shouldExitForAbsolutePnl = absolutePnlExitReason !== null;
    const shouldExitForRisk = pnlPct <= -params.stopLoss || pnlPct >= params.takeProfit;
    const shouldExitForStructure = signals.direction !== null && signals.direction !== pos.side && signals.choch;
    const shouldExitForInvalidation = signals.invalidationScore >= 1 && signals.confirmationScore <= 2;

    if (shouldExitForAbsolutePnl || shouldExitForRisk || shouldExitForStructure || shouldExitForInvalidation) {
      const reason = shouldExitForAbsolutePnl
        ? absolutePnlExitReason
        : shouldExitForRisk
        ? `SMC risk exit | pnl ${(pnlPct * 100).toFixed(2)}%`
        : `SMC invalidation | ${signals.reasons.join(' + ') || 'structure shift'}`;
      const result = closePosition(agent, symbol, currentPrice, positions, trades, balance, reason);
      balance = result.balance;
      positions = result.positions;
      trades = result.trades;
      status = result.status;
    }
  }

  if (!entriesEnabled) {
    const updated = computeEquity(balance, positions, allPrices);
    const performance = ((updated.equity - BASE_BALANCE) / BASE_BALANCE) * 100;

    return {
      balance,
      activePositions: updated.positions,
      equity: updated.equity,
      unrealizedPL: updated.totalUnrealizedPL,
      performance,
      status,
      trades,
      strategyType: 'SMC / CoinAnk',
      strategy:
        'SMC five-core workflow: BOS, CHoCH, Order Block, FVG, Liquidity Sweep, plus CoinAnk-style OI/CVD/liquidation/orderflow proxy confirmation before layered entries.',
      strategyParams: {
        ...params,
        logicVersion: SMC_STRATEGY_VERSION,
      },
    };
  }

  const usedMargin = Object.values(positions).reduce((sum, pos) => sum + (pos.amount * pos.avgEntryPrice / pos.leverage), 0);
  const availableCash = Math.max(0, balance - usedMargin);
  const maxConcurrentPositions = params.maxConcurrentPositions ?? 99;
  if (Object.keys(positions).length >= maxConcurrentPositions) {
    const updated = computeEquity(balance, positions, allPrices);
    const performance = ((updated.equity - BASE_BALANCE) / BASE_BALANCE) * 100;

    return {
      balance,
      activePositions: updated.positions,
      equity: updated.equity,
      unrealizedPL: updated.totalUnrealizedPL,
      performance,
      status,
      trades,
      strategyType: 'SMC / CoinAnk',
      strategy:
        'SMC five-core workflow: BOS, CHoCH, Order Block, FVG, Liquidity Sweep, plus CoinAnk-style OI/CVD/liquidation/orderflow proxy confirmation before layered entries.',
      strategyParams: {
        ...params,
        logicVersion: SMC_STRATEGY_VERSION,
      },
    };
  }
  const preferredSymbols = params.preferredSymbols && params.preferredSymbols.length > 0
    ? params.preferredSymbols.filter((symbol) => allPrices[symbol])
    : Object.keys(allPrices);

  const candidates = preferredSymbols
    .map((symbol) => ({
      symbol,
      price: allPrices[symbol],
      signals: buildSmcSignals(allHistories[symbol] ?? [], allPrices[symbol], params),
    }))
    .filter((item) => item.signals.direction !== null)
    .sort((a, b) => {
      const sideBiasA = preferredEntrySide && a.signals.direction === preferredEntrySide ? 1 : 0;
      const sideBiasB = preferredEntrySide && b.signals.direction === preferredEntrySide ? 1 : 0;
      if (sideBiasA !== sideBiasB) return sideBiasB - sideBiasA;
      return b.signals.confirmationScore - a.signals.confirmationScore;
    })
    .slice(0, params.scanCount ?? 12);

  for (const candidate of candidates) {
    if (positions[candidate.symbol]) continue;
    if (availableCash < 50) break;
    if (candidate.signals.confirmationScore < (params.confirmationThreshold ?? 4)) continue;

    const side = candidate.signals.direction as Position['side'];
    const isAgainstRiskBias = preferredEntrySide !== null && side !== preferredEntrySide;
    if (isAgainstRiskBias && candidate.signals.confirmationScore < (params.confirmationThreshold ?? 4) + 2) continue;
    const leverage = Math.min(
      getMaxLeverage(candidate.symbol),
      Math.max(params.leverageMin ?? 4, Math.round((params.leverageMin ?? 4) + candidate.signals.confirmationScore / 2)),
      params.leverageMax ?? 8,
    );
    const riskBudget = balance * (params.maxRiskPerTrade ?? 0.02);
    const stopDistance = Math.max(params.stopLoss, candidate.signals.orderBlockDistance || params.stopLoss);
    const margin = Math.min(availableCash * 0.9, riskBudget / Math.max(stopDistance, 0.004));

    if (margin < 25) continue;

    const reason = [
      `SMC ${side}`,
      preferredEntrySide && side === preferredEntrySide ? 'risk bias aligned' : null,
      `OI ${candidate.signals.oiBias > 0 ? 'up' : 'down'}`,
      `CVD ${candidate.signals.cvdBias > 0 ? 'up' : 'down'}`,
      candidate.signals.reasons.join(' + '),
      `OB ${candidate.signals.orderBlockMid.toFixed(4)}`,
    ].filter(Boolean).join(' | ');

    const result = openPosition(candidate.symbol, side, candidate.price, leverage, margin, positions, trades, balance, reason);
    balance = result.balance;
    positions = result.positions;
    trades = result.trades;
    status = result.status;
    break;
  }

  const updated = computeEquity(balance, positions, allPrices);
  const performance = ((updated.equity - BASE_BALANCE) / BASE_BALANCE) * 100;

  return {
    balance,
    activePositions: updated.positions,
    equity: updated.equity,
    unrealizedPL: updated.totalUnrealizedPL,
    performance,
    status,
    trades,
    strategyType: 'SMC / CoinAnk',
    strategy:
      'SMC five-core workflow: BOS, CHoCH, Order Block, FVG, Liquidity Sweep, plus CoinAnk-style OI/CVD/liquidation/orderflow proxy confirmation before layered entries.',
    strategyParams: {
      ...params,
      logicVersion: SMC_STRATEGY_VERSION,
    },
  };
}

function executeGenericStrategy(
  agent: Agent,
  allPrices: PriceMap,
  allHistories: Record<string, number[]>,
  options: StrategyExecutionOptions = {},
): Partial<Agent> {
  const entriesEnabled = options.entriesEnabled ?? true;
  const preferredEntrySide = options.preferredEntrySide ?? null;
  if (agent.equity <= 0) {
    return {
      status: 'IDLE',
      performance: -100,
      equity: 0,
      balance: 0,
      unrealizedPL: 0,
      activePositions: {},
    };
  }

  let balance = agent.balance;
  let positions: Record<string, Position> = Object.fromEntries(
    Object.entries(agent.activePositions || {}).map(([symbol, pos]) => [
      symbol,
      {
        ...pos,
        side: pos.side === 'SHORT' ? 'SHORT' : 'LONG',
      },
    ]),
  ) as Record<string, Position>;
  let trades = [...agent.trades];
  let status: Agent['status'] = 'IDLE';
  const params = getStrategyParams(agent);

  for (const symbol of Object.keys(positions)) {
    const currentPrice = allPrices[symbol];
    const history = allHistories[symbol] ?? [];
    if (!currentPrice) continue;

    const pos = positions[symbol];
    const prevPrice = previousPrice(history, currentPrice);
    const priceChange = prevPrice === 0 ? 0 : (currentPrice - prevPrice) / prevPrice;
    const currentUnrealizedPnl = unrealizedPnl(pos, currentPrice);
    const pnlPct = pos.side === 'SHORT'
      ? (pos.avgEntryPrice - currentPrice) / pos.avgEntryPrice
      : (currentPrice - pos.avgEntryPrice) / pos.avgEntryPrice;

    const absolutePnlExitReason = params.useAbsoluteUsdExit ? getAbsolutePnlExitReason(currentUnrealizedPnl) : null;
    const shouldExit = Boolean(absolutePnlExitReason)
      || pnlPct <= -params.stopLoss
      || pnlPct >= params.takeProfit
      || Math.abs(priceChange) >= params.exitThreshold * 1.2;

    if (shouldExit) {
      const result = closePosition(
        agent,
        symbol,
        currentPrice,
        positions,
        trades,
        balance,
        absolutePnlExitReason ?? `Generic exit | move ${(priceChange * 100).toFixed(2)}% | pnl ${(pnlPct * 100).toFixed(2)}%`,
      );
      balance = result.balance;
      positions = result.positions;
      trades = result.trades;
      status = result.status;
    }
  }

  if (!entriesEnabled) {
    const updated = computeEquity(balance, positions, allPrices);
    const performance = ((updated.equity - BASE_BALANCE) / BASE_BALANCE) * 100;

    return {
      balance,
      activePositions: updated.positions,
      equity: updated.equity,
      unrealizedPL: updated.totalUnrealizedPL,
      performance,
      status,
      trades,
    };
  }

  const usedMargin = Object.values(positions).reduce((sum, pos) => sum + (pos.amount * pos.avgEntryPrice / pos.leverage), 0);
  const availableCash = Math.max(0, balance - usedMargin);
  const maxConcurrentPositions = params.maxConcurrentPositions ?? 99;
  if (Object.keys(positions).length >= maxConcurrentPositions) {
    const updated = computeEquity(balance, positions, allPrices);
    const performance = ((updated.equity - BASE_BALANCE) / BASE_BALANCE) * 100;

    return {
      balance,
      activePositions: updated.positions,
      equity: updated.equity,
      unrealizedPL: updated.totalUnrealizedPL,
      performance,
      status,
      trades,
    };
  }
  const symbols = Object.keys(allPrices).sort(() => 0.5 - Math.random()).slice(0, params.scanCount ?? 15);

  for (const symbol of symbols) {
    if (positions[symbol]) continue;
    if (availableCash < 50) break;

    const currentPrice = allPrices[symbol];
    const history = allHistories[symbol] ?? [];
    const prevPrice = previousPrice(history, currentPrice);
    const priceChange = prevPrice === 0 ? 0 : (currentPrice - prevPrice) / prevPrice;

    let shouldEnter = false;
    let side: Position['side'] = 'LONG';
    let reason = '';

    if (Math.abs(priceChange) > params.threshold) {
      shouldEnter = true;
      side = priceChange >= 0 ? 'LONG' : 'SHORT';
      reason = `${symbol} momentum break ${(priceChange * 100).toFixed(3)}%`;
    } else if (Math.random() > 0.9985) {
      shouldEnter = true;
      side = Math.random() > 0.5 ? 'LONG' : 'SHORT';
      reason = `${symbol} opportunistic entry under ${agent.strategyType}`;
    }

    if (!shouldEnter) continue;
    const isAgainstRiskBias = preferredEntrySide !== null && side !== preferredEntrySide;
    if (isAgainstRiskBias && Math.abs(priceChange) <= params.threshold * 1.8) continue;

    const leverage = Math.min(
      getMaxLeverage(symbol),
      Math.max(params.leverageMin ?? 3, Math.round((params.leverageMin ?? 3) + Math.abs(priceChange) * 1000)),
      params.leverageMax ?? 12,
    );
    const margin = Math.min(availableCash * 0.9, balance * Math.min(params.riskTolerance, 0.25));
    if (margin < 25) continue;

    const entryReason = preferredEntrySide && side === preferredEntrySide
      ? `${reason} | risk bias aligned`
      : reason;

    const result = openPosition(symbol, side, currentPrice, leverage, margin, positions, trades, balance, entryReason);
    balance = result.balance;
    positions = result.positions;
    trades = result.trades;
    status = result.status;
  }

  const updated = computeEquity(balance, positions, allPrices);
  const performance = ((updated.equity - BASE_BALANCE) / BASE_BALANCE) * 100;

  if (updated.equity <= 0) {
    return {
      balance: 0,
      activePositions: {},
      equity: 0,
      unrealizedPL: 0,
      performance: -100,
      status: 'IDLE',
      trades,
    };
  }

  return {
    balance,
    activePositions: updated.positions,
    equity: updated.equity,
    unrealizedPL: updated.totalUnrealizedPL,
    performance,
    status,
    trades,
  };
}

export const executeStrategy = (
  agent: Agent,
  allPrices: PriceMap,
  allHistories: Record<string, number[]>,
  options: StrategyExecutionOptions = {},
): Partial<Agent> => {
  if (agent.id === SMC_AGENT_ID) {
    const smcAgent = applyAgentMigrations([agent])[0];
    return executeSmcStrategy(smcAgent, allPrices, allHistories, options);
  }

  return executeGenericStrategy(agent, allPrices, allHistories, options);
};
