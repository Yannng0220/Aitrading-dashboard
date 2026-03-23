import { Agent, Position } from './types';

const STRATEGY_DESCRIPTIONS = [
  "基於 RSI 超買超賣的逆勢交易",
  "雙均線金叉/死叉趨勢追蹤",
  "布林帶寬度突破策略",
  "MACD 柱狀圖背離分析",
  "成交量加權平均價格 (VWAP) 偏離策略",
  "斐波那契回撤位支撐確認",
  "KDJ 指標隨機震盪過濾",
  "平均真實波幅 (ATR) 波動率突破",
  "拋物線轉向 (SAR) 趨勢反轉",
  "一目均衡表 (Ichimoku) 雲圖突破",
  "威廉指標 (W%R) 極限反轉",
  "順勢指標 (CCI) 週期性波動",
  "能量潮 (OBV) 量價背離",
  "錢德動量擺動指標 (CMO) 強度分析",
  "阿隆指標 (Aroon) 趨勢強度判斷",
  "三重指數平滑平均線 (TRIX) 動量過濾",
  "蔡金波動率 (Chaikin Volatility) 擴張策略",
  "艾達爾射線 (Elder Ray) 多空力量對比",
  "顧比複合均線 (GMMA) 趨勢層次分析",
  "唐奇安通道 (Donchian Channel) 價格突破",
  "肯特納通道 (Keltner Channel) 均值回歸",
  "線性回歸斜率趨勢確認",
  "標準差波動區間交易",
  "分形幾何 (Fractals) 拐點識別",
  "心理線 (PSY) 市場情緒量化",
  "乖離率 (BIAS) 過度偏離修正",
  "變動率 (ROC) 速度突破",
  "強力指數 (Force Index) 趨勢確認",
  "質量指標 (Mass Index) 趨勢反轉預警",
  "終極擺動指標 (Ultimate Oscillator) 多時段分析"
];

const ADJECTIVES = ['阿爾法', '西格瑪', '量子', '神經', '賽博', '向量', '極致', '巔峰', '頂點', '新星', '暗影', '泰坦', '幽靈', '星際', '矩陣', '雷霆', '幻影', '神諭', '先鋒', '深淵'];
const NOUNS = ['交易員', '機器人', '引擎', '節點', '代理', '思維', '核心', '邏輯', '流轉', '脈衝', '哨兵', '獵手', '守護', '先知', '工匠', '大師', '行者', '信使', '幽靈', '火花'];

export const fetchAllBybitTickers = async (): Promise<Record<string, number>> => {
  try {
    // Use same-origin proxy endpoint (works on Netlify/GitHub Pages with a backend proxy)
    const response = await fetch(`/api/tickers?category=linear`);
    const data = await response.json();
    if (data.retCode === 0 && data.result.list) {
      const prices: Record<string, number> = {};
      data.result.list.forEach((item: any) => {
        // Only include USDT perpetuals
        if (item.symbol.endsWith('USDT')) {
          prices[item.symbol] = parseFloat(item.lastPrice);
        }
      });
      // Fallback if no USDT symbols found (unlikely but safe)
      if (Object.keys(prices).length === 0) {
        prices['BTCUSDT'] = 65000 + (Math.random() - 0.5) * 100;
      }
      return prices;
    }
    throw new Error('Invalid API response');
  } catch (error) {
    console.error('Error fetching Bybit tickers, using fallback:', error);
    // Return mock data to keep simulation alive
    return { 
      'BTCUSDT': 65000 + (Math.random() - 0.5) * 100,
      'ETHUSDT': 3500 + (Math.random() - 0.5) * 10,
      'SOLUSDT': 145 + (Math.random() - 0.5) * 2
    };
  }
};

export const generateAgents = (count: number, availableSymbols: string[] = ['BTCUSDT']): Agent[] => {
  const agents: Agent[] = Array.from({ length: count }, (_, i) => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    
    // Assign a unique base strategy description
    let baseDesc = STRATEGY_DESCRIPTIONS[i % STRATEGY_DESCRIPTIONS.length];
    let strategyType = i < 30 ? '高頻刷單' : (i < 60 ? '趨勢跟隨' : '均值回歸');

    // Special strategies for agents #30 to #40 (IDs 29 to 39)
    const specialStrategies = [
      "SNR (支撐與阻力) 關鍵位反轉",
      "SMC (聰明錢概念) 機構訂單流追蹤",
      "楔形 (Wedge) 形態收斂突破",
      "Order Block (訂單塊) 需求區回踩",
      "Fair Value Gap (FVG) 缺口回補策略",
      "Liquidity Sweep (流動性掃蕩) 假突破陷阱",
      "Wyckoff (威科夫) 累積區間吸籌",
      "BOS (結構突破) 趨勢延續確認",
      "CHOCH (性格改變) 趨勢反轉預警",
      "Supply and Demand (供需區) 高勝率博弈",
      "Harmonic Pattern (諧波形態) 精準反轉"
    ];

    if (i === 29) {
      baseDesc = "激進短期策略，使用突破策略";
      strategyType = "突破策略";
    } else if (i >= 30 && i <= 39) {
      baseDesc = specialStrategies[i - 29];
      // Use the short name + '策略' as the strategy type for better visibility
      strategyType = baseDesc.split(' ')[0] + '策略'; 
    }
    
    // Randomize parameters to make each agent unique even if they share a base strategy
    const riskTolerance = 0.05 + Math.random() * 0.25; // 5% to 30%
    const timeframe = Math.random() > 0.5 ? 'SHORT' : 'LONG';
    const sensitivity = 0.5 + Math.random() * 1.5; // Multiplier for indicator thresholds
    
    const symbol = availableSymbols.length > 0 
      ? availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
      : 'BTCUSDT';
    
    return {
      id: i,
      name: `${adj} ${noun} #${i + 1}`,
      strategy: `${baseDesc} (風險係數: ${riskTolerance.toFixed(2)}, 敏感度: ${sensitivity.toFixed(2)})`,
      strategyType: strategyType,
      balance: 1000,
      activePositions: {},
      equity: 1000,
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
        stopLoss: 0.02 * (1 / sensitivity),
        takeProfit: 0.04 * sensitivity
      }
    };
  });

  // Agent #100 (id=99) should NOT do the forced 5s churn anymore.
  // Copy Agent #20 (id=19) strategy configuration for consistency.
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

const FEE_RATE = 0.0006; // 0.06% Taker fee

const getMaxLeverage = (symbol: string): number => {
  if (symbol === 'BTCUSDT' || symbol === 'ETHUSDT') return 100;
  if (['SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT'].includes(symbol)) return 50;
  return 20; // Default for other alts
};

export const executeStrategy = (
  agent: Agent, 
  allPrices: Record<string, number>, 
  allHistories: Record<string, number[]>
): Partial<Agent> => {
  // If equity is 0 or less, the agent is bankrupt and cannot trade
  if (agent.equity <= 0) {
    return {
      status: 'IDLE',
      performance: -100,
      equity: 0,
      balance: 0,
      unrealizedPL: 0,
      activePositions: {}
    };
  }

  let newBalance = agent.balance;
  // Normalize saved positions (older state may not have `side`)
  const newActivePositions: Record<string, Position> = Object.fromEntries(
    Object.entries(agent.activePositions || {}).map(([symbol, pos]) => {
      const side: Position['side'] = (pos as any).side === 'SHORT' ? 'SHORT' : 'LONG';
      const normalized: Position = { ...(pos as Position), side };
      return [symbol, normalized];
    })
  ) as Record<string, Position>;
  const newTrades = [...agent.trades];
  let newStatus: Agent['status'] = 'IDLE';

  // Agent #100 no longer has forced churn logic; it behaves like any other agent.

  // 1. Check existing positions for EXIT signals
  let currentUsedMargin = Object.values(newActivePositions).reduce((sum, p) => sum + (p.amount * p.avgEntryPrice / p.leverage), 0);
  
  Object.keys(newActivePositions).forEach(symbol => {
    const currentPrice = allPrices[symbol];
    const history = allHistories[symbol] || [];
    if (!currentPrice) return;

    const lastPrice = history[history.length - 1] || currentPrice;
    const priceChange = (currentPrice - lastPrice) / lastPrice;
    
    let shouldExit = false;
    let reason = '';

    // Exit logic based on strategy
    switch (agent.strategyType) {
      case '高頻刷單':
      case '動量策略':
        if (priceChange < -0.001) { shouldExit = true; reason = '快速止損'; }
        break;
      case '趨勢跟隨':
        if (priceChange < -0.01) { shouldExit = true; reason = '趨勢反轉'; }
        break;
      default:
        if (Math.random() > 0.95) { shouldExit = true; reason = '止盈/隨機退出'; }
    }

    if (shouldExit) {
      const pos = newActivePositions[symbol];
      const exitValue = pos.amount * currentPrice;
      const entryValue = pos.amount * pos.avgEntryPrice;
      const fee = exitValue * FEE_RATE;
      const pnl =
        pos.side === 'SHORT'
          ? (entryValue - exitValue) - fee
          : (exitValue - entryValue) - fee;

      newBalance += pnl; // Update total balance with realized P&L
      currentUsedMargin -= (pos.amount * pos.avgEntryPrice / pos.leverage);
      delete newActivePositions[symbol];
      // Exit order type depends on side (LONG exits via SELL, SHORT exits via BUY)
      const exitOrderType = pos.side === 'SHORT' ? 'BUY' : 'SELL';
      newStatus = exitOrderType === 'BUY' ? 'BUYING' : 'SELLING';
      newTrades.unshift({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        symbol,
        type: exitOrderType,
        action: 'EXIT',
        positionSide: pos.side,
        price: currentPrice,
        amount: pos.amount,
        fee,
        realizedPL: pnl,
        reason: `${reason} | 平倉價格: ${currentPrice.toFixed(2)} | 最終營利: ${pnl.toFixed(2)} USD`
      });
    }
  });

  // 2. Look for new ENTRY signals
  const allSymbols = Object.keys(allPrices);
  const symbolsToScan = allSymbols.sort(() => 0.5 - Math.random()).slice(0, 15);
  const availableCash = newBalance - currentUsedMargin;
  
  const params = agent.strategyParams || {
    riskTolerance: 0.1,
    sensitivity: 1.0,
    threshold: 0.0005,
    stopLoss: 0.02,
    takeProfit: 0.04
  };

  symbolsToScan.forEach(symbol => {
    if (newActivePositions[symbol]) return; 
    if (availableCash < 50) return; 

    const currentPrice = allPrices[symbol];
    const history = allHistories[symbol] || [];
    if (!currentPrice) return;

    const lastPrice = history[history.length - 1] || currentPrice;
    const priceChange = (currentPrice - lastPrice) / lastPrice;

    let shouldEntry = false;
    let reason = '';
    let side: 'LONG' | 'SHORT' = 'LONG';

    const threshold = params.threshold; 

    if (Math.abs(priceChange) > threshold) {
      shouldEntry = true;
      side = priceChange >= 0 ? 'LONG' : 'SHORT';
      reason = `${symbol} 價格變動 (${(priceChange * 100).toFixed(3)}%) 觸發 ${agent.strategy.split(' (')[0]}`;
    } else if (Math.random() > 0.998) {
      shouldEntry = true;
      // Randomize direction for opportunistic entries
      side = Math.random() > 0.5 ? 'LONG' : 'SHORT';
      reason = `策略 ${agent.strategyType} 識別到 ${symbol} 的潛在機會`;
    }

    if (shouldEntry) {
      const confidence = Math.min(Math.max(Math.abs(priceChange) / (0.0005 * params.sensitivity), 0.5), 2.0);
      const isAggressive = agent.strategyType === '高頻刷單';
      
      const maxSymbolLeverage = getMaxLeverage(symbol);
      let agentLeverage: number;
      
      if (isAggressive) {
        agentLeverage = Math.floor(maxSymbolLeverage * (0.4 + Math.random() * 0.6));
      } else {
        agentLeverage = Math.min(Math.floor(3 + Math.random() * 12), maxSymbolLeverage);
      }

      let margin: number;
      if (agent.id >= 0 && agent.id <= 9) {
        margin = 100;
      } else if (agent.id >= 10 && agent.id <= 20) {
        margin = 200;
      } else {
        const dynamicRiskFactor = params.riskTolerance * confidence;
        const finalRiskFactor = Math.min(dynamicRiskFactor, 0.95);
        margin = newBalance * finalRiskFactor;
      }
      
      // Ensure we don't exceed available cash
      margin = Math.min(margin, availableCash * 0.95);
      
      const notionalValue = margin * agentLeverage;
      const fee = notionalValue * FEE_RATE;
      const amount = (notionalValue - fee) / currentPrice;

      if (amount > 0) {
        newBalance -= fee; // Only deduct fee from total balance
        newActivePositions[symbol] = {
          symbol,
          amount,
          avgEntryPrice: currentPrice,
          leverage: agentLeverage,
          unrealizedPL: 0,
          side
        };
        const entryOrderType = side === 'SHORT' ? 'SELL' : 'BUY';
        newStatus = entryOrderType === 'BUY' ? 'BUYING' : 'SELLING';
        newTrades.unshift({
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          symbol,
          type: entryOrderType,
          action: 'ENTRY',
          positionSide: side,
          price: currentPrice,
          amount,
          leverage: agentLeverage,
          fee,
          reason
        });
      }
    }
  });

  // 3. Update unrealized PL and Equity
  let totalUnrealizedPL = 0;
  
  Object.keys(newActivePositions).forEach(symbol => {
    const pos = { ...newActivePositions[symbol] };
    const currentPrice = allPrices[symbol];
    if (currentPrice) {
      pos.unrealizedPL =
        pos.side === 'SHORT'
          ? (pos.avgEntryPrice - currentPrice) * pos.amount
          : (currentPrice - pos.avgEntryPrice) * pos.amount;
      totalUnrealizedPL += pos.unrealizedPL;
      newActivePositions[symbol] = pos;
    }
  });

  const equity = Math.max(0, newBalance + totalUnrealizedPL);
  const performance = ((equity - 1000) / 1000) * 100;

  if (equity <= 0) {
    return {
      balance: 0,
      activePositions: {},
      equity: 0,
      unrealizedPL: 0,
      performance: -100,
      status: 'IDLE',
      trades: newTrades.slice(-20)
    };
  }

  return {
    balance: newBalance,
    activePositions: newActivePositions,
    equity,
    unrealizedPL: totalUnrealizedPL,
    performance,
    status: newStatus,
    trades: newTrades.slice(-20)
  };
};
