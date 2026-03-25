import { Agent, Trade } from '../types';
import { getDashboardRankedAgents } from './ranking';

export type Language = 'zh' | 'en';

export type AgentAdvice = {
  id: number;
  name: string;
  strategyType: string;
  closedTrades: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
  avgLeverage: number;
  activePositions: number;
  recommendation: string;
};

export type LearningModel = {
  version: 1;
  generatedAt: number;
  sourceFingerprint: string;
  sourceAgentIds: number[];
  sourceAgentNames: string[];
  sourceStrategyTypes: string[];
  closedTradesReviewed: number;
  latestClosedTradeAt: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
  avgLeverage: number;
  strategyTitle: string;
  unifiedStrategy: string;
  entryFocus: string[];
  exitFocus: string[];
  reviewNotes: string[];
  transferNote: string;
  params: {
    riskTolerance: number;
    sensitivity: number;
    threshold: number;
    exitThreshold: number;
    stopLoss: number;
    takeProfit: number;
    leverageMin: number;
    leverageMax: number;
    maxRiskPerTrade: number;
    scanCount: number;
    preferredSymbols: string[];
  };
};

export const LEARNING_MODEL_STORAGE_KEY = 'learningModel:v2';
const MAX_SOURCE_AGENTS = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[], fallback: number) {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pickTopSymbols(agents: Agent[]) {
  const counts = new Map<string, number>();

  agents.forEach((agent) => {
    Object.keys(agent.activePositions ?? {}).forEach((symbol) => {
      counts.set(symbol, (counts.get(symbol) ?? 0) + 2);
    });

    agent.trades.forEach((trade) => {
      counts.set(trade.symbol, (counts.get(trade.symbol) ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([symbol]) => symbol);
}

export function getLearningSourceAgents(agents: Agent[]) {
  return getDashboardRankedAgents(agents).slice(0, MAX_SOURCE_AGENTS);
}

function getClosedTrades(agent: Agent) {
  return agent.trades.filter(
    (trade): trade is Trade & { realizedPL: number } =>
      trade.action === 'EXIT' && typeof trade.realizedPL === 'number'
  );
}

function getRecommendationText(
  agent: Agent,
  closedTrades: Array<Trade & { realizedPL: number }>,
  totalPnl: number,
  avgPnl: number,
  winRate: number,
  avgLeverage: number,
  activePositions: number,
  lang: Language,
) {
  if (agent.performance < -5) {
    return lang === 'zh'
      ? '近期整體表現偏弱，建議先降低風險承受與單筆曝險。'
      : 'Recent overall performance is weak. Lower risk tolerance and reduce per-trade exposure first.';
  }

  if (closedTrades.length >= 3) {
    if (winRate < 40) {
      return lang === 'zh'
        ? '勝率偏低，建議先提高進場門檻，避免過度交易。'
        : 'Win rate is low. Raise the entry threshold to avoid overtrading.';
    }
    if (avgPnl < 0 && avgLeverage >= 8) {
      return lang === 'zh'
        ? '平均單筆仍為負且槓桿偏高，建議先下修槓桿與風險設定。'
        : 'Average trade PnL is negative with elevated leverage. Reduce leverage and risk settings first.';
    }
    if (avgPnl < 0) {
      return lang === 'zh'
        ? '平均單筆報酬為負，建議重新調整停利、停損與出場平衡。'
        : 'Average trade PnL is negative. Revisit take-profit, stop-loss, and exit balance.';
    }
    if (winRate >= 55 && totalPnl > 0) {
      return lang === 'zh'
        ? '表現穩定，保留核心邏輯，只針對進場頻率與風控微調。'
        : 'Performance is stable. Keep the core setup and only fine-tune entry frequency and risk.';
    }

    return lang === 'zh'
      ? '目前績效中性，先維持設定並觀察下一批平倉結果。'
      : 'Performance is neutral. Keep the current setup and observe the next batch of closed trades.';
  }

  if (activePositions > 1) {
    return lang === 'zh'
      ? '目前曝險分散在多個持倉，建議先檢查資金配置，再調整規則。'
      : 'Current exposure is spread across multiple positions. Review capital allocation before changing rules.';
  }

  return lang === 'zh'
    ? '樣本仍少，先累積更多平倉資料再做有意義的參數調整。'
    : 'The sample is still small. Accumulate more closed trades before making meaningful parameter changes.';
}

export function buildAgentRecommendation(agent: Agent, lang: Language = 'zh'): AgentAdvice {
  const closedTrades = getClosedTrades(agent);
  const wins = closedTrades.filter((trade) => trade.realizedPL >= 0).length;
  const totalPnl = closedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);
  const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const activePositions = Object.keys(agent.activePositions ?? {}).length;
  const avgLeverage =
    closedTrades.length > 0
      ? closedTrades.reduce((sum, trade) => sum + (trade.leverage ?? 1), 0) / closedTrades.length
      : Object.values(agent.activePositions ?? {}).reduce((sum, pos) => sum + pos.leverage, 0) / Math.max(activePositions, 1);

  return {
    id: agent.id,
    name: agent.name,
    strategyType: agent.strategyType,
    closedTrades: closedTrades.length,
    totalPnl,
    avgPnl,
    winRate,
    avgLeverage: Number.isFinite(avgLeverage) ? avgLeverage : 1,
    activePositions,
    recommendation: getRecommendationText(agent, closedTrades, totalPnl, avgPnl, winRate, avgLeverage, activePositions, lang),
  };
}

export function buildUnifiedLearningModel(agents: Agent[], lang: Language): LearningModel {
  const sourceAgents = getLearningSourceAgents(agents);
  const sourceClosedTrades = sourceAgents.flatMap((agent) => getClosedTrades(agent));
  const wins = sourceClosedTrades.filter((trade) => trade.realizedPL >= 0).length;
  const totalPnl = sourceClosedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);
  const avgPnl = sourceClosedTrades.length > 0 ? totalPnl / sourceClosedTrades.length : 0;
  const winRate = sourceClosedTrades.length > 0 ? (wins / sourceClosedTrades.length) * 100 : 0;
  const avgLeverage = average(sourceClosedTrades.map((trade) => trade.leverage ?? 1), 1);
  const latestClosedTradeAt = sourceClosedTrades.reduce((latest, trade) => Math.max(latest, trade.timestamp), 0);

  const strategyWeights = new Map<string, number>();
  sourceAgents.forEach((agent) => {
    strategyWeights.set(agent.strategyType, (strategyWeights.get(agent.strategyType) ?? 0) + 1);
  });
  const sourceStrategyTypes = Array.from(strategyWeights.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([strategy]) => strategy);

  const baseRiskTolerance = average(sourceAgents.map((agent) => Number(agent.strategyParams?.riskTolerance ?? 0.1)), 0.1);
  const baseSensitivity = average(sourceAgents.map((agent) => Number(agent.strategyParams?.sensitivity ?? 1)), 1);
  const baseThreshold = average(sourceAgents.map((agent) => Number(agent.strategyParams?.threshold ?? 0.002)), 0.002);
  const baseExitThreshold = average(sourceAgents.map((agent) => Number(agent.strategyParams?.exitThreshold ?? 0.005)), 0.005);
  const baseStopLoss = average(sourceAgents.map((agent) => Number(agent.strategyParams?.stopLoss ?? 0.02)), 0.02);
  const baseTakeProfit = average(sourceAgents.map((agent) => Number(agent.strategyParams?.takeProfit ?? 0.04)), 0.04);
  const baseLeverageMin = average(sourceAgents.map((agent) => Number(agent.strategyParams?.leverageMin ?? 3)), 3);
  const baseLeverageMax = average(sourceAgents.map((agent) => Number(agent.strategyParams?.leverageMax ?? 12)), 12);
  const baseRiskPerTrade = average(sourceAgents.map((agent) => Number(agent.strategyParams?.maxRiskPerTrade ?? 0.03)), 0.03);
  const baseScanCount = Math.round(average(sourceAgents.map((agent) => Number(agent.strategyParams?.scanCount ?? 12)), 12));

  const params = {
    riskTolerance: clamp(baseRiskTolerance * (winRate >= 55 ? 1.02 : 0.9), 0.03, 0.22),
    sensitivity: clamp(baseSensitivity * (avgPnl >= 0 ? 1.04 : 0.95), 0.5, 2.5),
    threshold: clamp(baseThreshold * (winRate < 50 ? 1.08 : 0.97), 0.0004, 0.02),
    exitThreshold: clamp(baseExitThreshold * (avgPnl >= 0 ? 0.98 : 1.03), 0.001, 0.04),
    stopLoss: clamp(baseStopLoss * (avgPnl >= 0 ? 0.96 : 0.9), 0.006, 0.05),
    takeProfit: clamp(baseTakeProfit * (avgPnl >= 0 ? 1.06 : 0.96), 0.012, 0.12),
    leverageMin: clamp(Math.round(baseLeverageMin), 2, 8),
    leverageMax: clamp(Math.round(baseLeverageMax * (avgLeverage >= 8 ? 0.85 : 0.95)), 4, 15),
    maxRiskPerTrade: clamp(baseRiskPerTrade * (winRate >= 55 ? 0.98 : 0.88), 0.01, 0.05),
    scanCount: clamp(baseScanCount, 6, 15),
    preferredSymbols: pickTopSymbols(sourceAgents),
  };

  const entryFocus =
    lang === 'zh'
      ? [
          '優先沿用前六名模型共同有效的進場邏輯，只在高品質訊號時出手。',
          `將進場門檻統一到 ${params.threshold.toFixed(4)} 左右，減少弱訊號造成的噪音交易。`,
          '優先觀察近期反覆出現的強勢商品，並限制同時掃描標的數量。',
        ]
      : [
          'Reuse the entry logic shared by the top six strategies and trade only on higher-quality setups.',
          `Keep the unified entry threshold around ${params.threshold.toFixed(4)} to reduce low-quality noise trades.`,
          'Favor symbols that repeatedly appear in the strongest agents and limit concurrent scan breadth.',
        ];

  const exitFocus =
    lang === 'zh'
      ? [
          `停損先收斂到 ${params.stopLoss.toFixed(3)}，讓回撤更可控。`,
          `停利提高到 ${params.takeProfit.toFixed(3)}，保留優勢行情的延伸空間。`,
          `單筆風險預算壓到 ${(params.maxRiskPerTrade * 100).toFixed(1)}%，避免高獲利策略被過度槓桿破壞。`,
        ]
      : [
          `Tighten stop-loss toward ${params.stopLoss.toFixed(3)} to keep drawdowns contained.`,
          `Lift take-profit toward ${params.takeProfit.toFixed(3)} to preserve upside from stronger runs.`,
          `Cap per-trade risk near ${(params.maxRiskPerTrade * 100).toFixed(1)}% so leverage does not erase the edge.`,
        ];

  const reviewNotes =
    lang === 'zh'
      ? [
          `來源來自儀表板前六名 AI：${sourceAgents.map((agent) => agent.name).join('、')}。`,
          `目前共複盤 ${sourceClosedTrades.length} 筆已平倉資料，勝率 ${winRate.toFixed(1)}%，平均單筆 ${avgPnl >= 0 ? '+' : ''}$${avgPnl.toFixed(2)}。`,
          avgLeverage >= 8
            ? '來源策略平均槓桿偏高，因此新模型已主動壓低槓桿上限。'
            : '來源策略槓桿相對可控，因此新模型保留中低槓桿設定。',
        ]
      : [
          `Source set comes from the dashboard top six agents: ${sourceAgents.map((agent) => agent.name).join(', ')}.`,
          `The replay covers ${sourceClosedTrades.length} closed trades with ${winRate.toFixed(1)}% win rate and ${avgPnl >= 0 ? '+' : ''}$${avgPnl.toFixed(2)} average trade.`,
          avgLeverage >= 8
            ? 'Source leverage runs hot, so the new model lowers the leverage ceiling on purpose.'
            : 'Source leverage is relatively controlled, so the new model keeps a moderate leverage profile.',
        ];

  const strategyTitle = lang === 'zh' ? 'AI#101 融合學習模型' : 'AI#101 Unified Learning Model';
  const unifiedStrategy =
    lang === 'zh'
      ? `融合前六名盈利策略的共通信號，保留 ${sourceStrategyTypes.slice(0, 3).join(' / ')} 的有效進場特徵，並用更保守的風控去執行。`
      : `Blend the shared signals from the top six profitable strategies, keep the best entry traits from ${sourceStrategyTypes.slice(0, 3).join(' / ')}, and execute them with tighter risk control.`;

  const sourceFingerprint = [
    sourceAgents.map((agent) => agent.id).join(','),
    sourceClosedTrades.length,
    latestClosedTradeAt,
  ].join('|');

  return {
    version: 1,
    generatedAt: Date.now(),
    sourceFingerprint,
    sourceAgentIds: sourceAgents.map((agent) => agent.id),
    sourceAgentNames: sourceAgents.map((agent) => agent.name),
    sourceStrategyTypes,
    closedTradesReviewed: sourceClosedTrades.length,
    latestClosedTradeAt,
    totalPnl,
    avgPnl,
    winRate,
    avgLeverage,
    strategyTitle,
    unifiedStrategy,
    entryFocus,
    exitFocus,
    reviewNotes,
    transferNote:
      lang === 'zh'
        ? '每當前六名來源策略出現新的平倉資料，這個融合模型就會重新整理，供 AI#101 使用。'
        : 'Whenever the source top-six strategies produce a new closed trade, this unified model is refreshed for AI#101.',
    params,
  };
}

export function readLearningModel() {
  try {
    const raw = localStorage.getItem(LEARNING_MODEL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LearningModel;
  } catch {
    return null;
  }
}

export function writeLearningModel(model: LearningModel) {
  try {
    localStorage.setItem(LEARNING_MODEL_STORAGE_KEY, JSON.stringify(model));
  } catch (error) {
    console.warn('learning model write failed', error);
  }
}

export function clearLearningModel() {
  try {
    localStorage.removeItem(LEARNING_MODEL_STORAGE_KEY);
  } catch (error) {
    console.warn('learning model clear failed', error);
  }
}
