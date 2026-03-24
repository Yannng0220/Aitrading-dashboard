import { useMemo, type ReactNode } from 'react';
import { Bot, BrainCircuit, ChevronRight, Lightbulb, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { Agent, Trade } from '../types';
import { cn } from '../lib/utils';

export type Language = 'zh' | 'en';

export type ReviewedTrade = {
  agentName: string;
  strategyType: string;
  trade: Trade & { realizedPL: number };
  verdict: 'good' | 'warning';
  note: string;
};

export type StrategySummary = {
  strategyType: string;
  closedTrades: number;
  wins: number;
  losses: number;
  avgPnl: number;
  avgLeverage: number;
  recommendation: string;
};

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

type LearningProps = {
  agents: Agent[];
  onOpenAgent: (agentId: number) => void;
  lang: Language;
};

const copy = {
  zh: {
    heroTitle: 'AI 學習建議',
    heroBody: '這一頁只做交易後檢討、回測方向與參數建議，不會自動改你的策略或替你下單。',
    heroNote: '每個 AI 都有自己的建議，列表會依總營利由高到低排序，方便你先看最有效的模型。',
    metrics: {
      closedTrades: '已分析平倉',
      winRate: '整體勝率',
      avgPnl: '平均單筆盈虧',
      highLeverageLosses: '高槓桿虧損',
    },
    summaryTitle: '學習建議摘要',
    recentTitle: '最近 20 筆檢討',
    agentTitle: '每個 AI 的獨立入口',
    strategyTitle: '策略群組建議',
    noReviews: '目前還沒有足夠的平倉資料可供檢討，先讓模擬多跑一段時間。',
    noStrategies: '目前還沒有足夠的已平倉資料可整理出策略群組建議。',
    openDetail: '查看 AI 詳情',
    closedTradesUnit: '筆平倉',
    stats: {
      winRate: '勝率',
      leverage: '平均槓桿',
      positions: '持倉',
      totalProfit: '總營利',
    },
    strategyMeta: (closedTrades: number, wins: number, losses: number) =>
      `平倉 ${closedTrades} 筆，獲利 ${wins} / 虧損 ${losses}`,
    averageLeverage: (value: number) => `平均槓桿 ${value.toFixed(1)}x`,
    verdictKeep: 'keep',
    verdictReview: 'review',
  },
  en: {
    heroTitle: 'AI Learning Insights',
    heroBody: 'This page provides post-trade review, backtest direction, and parameter suggestions only. It will not auto-modify strategies or place trades for you.',
    heroNote: 'Each AI has its own recommendation card, and the list is sorted by total profit from highest to lowest so you can review the strongest models first.',
    metrics: {
      closedTrades: 'Closed Trades Reviewed',
      winRate: 'Overall Win Rate',
      avgPnl: 'Average PnL Per Trade',
      highLeverageLosses: 'High-Leverage Losses',
    },
    summaryTitle: 'Learning Summary',
    recentTitle: 'Latest 20 Reviews',
    agentTitle: 'Independent AI Entries',
    strategyTitle: 'Strategy Group Advice',
    noReviews: 'There are not enough closed trades yet. Let the simulation run longer to generate reviewable history.',
    noStrategies: 'There is not enough closed-trade data yet to build strategy-group guidance.',
    openDetail: 'Open AI Detail',
    closedTradesUnit: 'closed trades',
    stats: {
      winRate: 'Win Rate',
      leverage: 'Avg Leverage',
      positions: 'Positions',
      totalProfit: 'Total Profit',
    },
    strategyMeta: (closedTrades: number, wins: number, losses: number) =>
      `${closedTrades} closed trades, ${wins} wins / ${losses} losses`,
    averageLeverage: (value: number) => `Avg leverage ${value.toFixed(1)}x`,
    verdictKeep: 'keep',
    verdictReview: 'review',
  },
} as const;

function createTradeNote(lang: Language, trade: Trade & { realizedPL: number }) {
  const leverage = trade.leverage ?? 1;
  const isLoss = trade.realizedPL < 0;

  if (lang === 'zh') {
    if (isLoss && leverage >= 10) return '這筆虧損發生在高槓桿情境，建議優先檢查槓桿倍率與風險容忍度設定。';
    if (isLoss) return '這筆平倉為虧損，建議回頭檢查進場 threshold 與停損條件是否過鬆。';
    return '這筆交易獲利了結，可回頭確認當時的進場條件與倉位控管是否值得延續。';
  }

  if (isLoss && leverage >= 10) return 'This loss happened under high leverage. Review leverage size and risk tolerance first.';
  if (isLoss) return 'This trade closed at a loss. Review the entry threshold and stop-loss conditions.';
  return 'This trade closed profitably. Review whether the entry setup and position sizing are worth repeating.';
}

export function reviewTrade(agent: Agent, trade: Trade & { realizedPL: number }, lang: Language = 'zh'): ReviewedTrade {
  return {
    agentName: agent.name,
    strategyType: agent.strategyType,
    trade,
    verdict: trade.realizedPL < 0 ? 'warning' : 'good',
    note: createTradeNote(lang, trade),
  };
}

function buildRecommendationText(agent: Agent, closedTrades: Array<Trade & { realizedPL: number }>, totalPnl: number, avgPnl: number, winRate: number, avgLeverage: number, activePositions: number, lang: Language) {
  if (agent.performance < -5) {
    return lang === 'zh'
      ? '近期總體表現偏弱，建議先降低 riskTolerance，並縮小單筆風險曝險。'
      : 'Recent overall performance is weak. Consider lowering risk tolerance and shrinking per-trade exposure.';
  }

  if (closedTrades.length >= 3) {
    if (winRate < 40) {
      return lang === 'zh'
        ? '勝率偏低，建議提高進場 threshold，避免過度頻繁進場。'
        : 'Win rate is low. Raise the entry threshold to avoid overtrading.';
    }
    if (avgPnl < 0 && avgLeverage >= 8) {
      return lang === 'zh'
        ? '平均單筆仍為虧損且槓桿偏高，建議優先下修槓桿與風險係數。'
        : 'Average trade PnL is still negative with elevated leverage. Reduce leverage and risk settings first.';
    }
    if (avgPnl < 0) {
      return lang === 'zh'
        ? '平均單筆盈虧為負，建議檢查停利停損比例與出場條件是否失衡。'
        : 'Average trade PnL is negative. Revisit take-profit, stop-loss, and exit balance.';
    }
    if (winRate >= 55 && totalPnl > 0) {
      return lang === 'zh'
        ? '目前表現穩定，可保留核心邏輯，僅小幅微調進場密度與風險。'
        : 'Performance is stable. Keep the core setup and only fine-tune entry frequency and risk.';
    }
    return lang === 'zh'
      ? '表現中性，建議維持現有框架，持續觀察下一批平倉結果。'
      : 'Performance is neutral. Keep the current setup and observe the next batch of closed trades.';
  }

  if (activePositions > 1) {
    return lang === 'zh'
      ? '目前持倉較分散，建議先觀察多筆持倉的資金分配是否合理。'
      : 'Current exposure is spread across multiple positions. Review capital allocation before changing rules.';
  }

  return lang === 'zh'
    ? '樣本數仍少，先累積更多平倉紀錄，再進行實質調參。'
    : 'The sample is still small. Accumulate more closed trades before making meaningful parameter changes.';
}

export function buildAgentRecommendation(agent: Agent, lang: Language = 'zh'): AgentAdvice {
  const closedTrades = agent.trades.filter(
    (trade): trade is Trade & { realizedPL: number } =>
      trade.action === 'EXIT' && typeof trade.realizedPL === 'number'
  );

  const wins = closedTrades.filter((trade) => trade.realizedPL >= 0).length;
  const totalPnl = closedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);
  const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const activePositions = Object.keys(agent.activePositions).length;
  const avgLeverage =
    closedTrades.length > 0
      ? closedTrades.reduce((sum, trade) => sum + (trade.leverage ?? 1), 0) / closedTrades.length
      : Object.values(agent.activePositions).reduce((sum, pos) => sum + pos.leverage, 0) / Math.max(activePositions, 1);

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
    recommendation: buildRecommendationText(agent, closedTrades, totalPnl, avgPnl, winRate, avgLeverage, activePositions, lang),
  };
}

function buildStrategyRecommendation(summary: StrategySummary, lang: Language) {
  const strategyWinRate = summary.closedTrades > 0 ? (summary.wins / summary.closedTrades) * 100 : 0;

  if (summary.closedTrades >= 3) {
    if (strategyWinRate < 40) {
      return lang === 'zh'
        ? '這組策略勝率偏低，建議提高進場門檻並縮小試單頻率。'
        : 'This strategy group has a low win rate. Raise entry requirements and reduce trade frequency.';
    }
    if (summary.avgPnl < 0 && summary.avgLeverage >= 8) {
      return lang === 'zh'
        ? '這組策略在高槓桿下承受負報酬，建議先降低槓桿暴露。'
        : 'This strategy group is losing under high leverage. Reduce leverage exposure first.';
    }
    if (strategyWinRate >= 55 && summary.avgPnl > 0) {
      return lang === 'zh'
        ? '這組策略表現穩定，可維持主體邏輯，只做小幅微調。'
        : 'This strategy group is stable. Keep the main logic and only apply small refinements.';
    }
  }

  return lang === 'zh'
    ? '目前策略表現中性，建議繼續累積樣本後再決定是否調整。'
    : 'Current strategy performance is neutral. Collect more samples before making larger changes.';
}

export default function Learning({ agents, onOpenAgent, lang }: LearningProps) {
  const t = copy[lang];

  const analysis = useMemo(() => {
    const closedTrades = agents
      .flatMap((agent) =>
        agent.trades
          .filter((trade): trade is Trade & { realizedPL: number } => trade.action === 'EXIT' && typeof trade.realizedPL === 'number')
          .map((trade) => ({ agent, trade }))
      )
      .sort((a, b) => b.trade.timestamp - a.trade.timestamp);

    const reviewedTrades = closedTrades.slice(0, 20).map(({ agent, trade }) => reviewTrade(agent, trade, lang));
    const wins = closedTrades.filter(({ trade }) => trade.realizedPL >= 0).length;
    const losses = closedTrades.length - wins;
    const totalPnl = closedTrades.reduce((sum, { trade }) => sum + trade.realizedPL, 0);
    const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
    const highLeverageLosses = closedTrades.filter(({ trade }) => trade.realizedPL < 0 && (trade.leverage ?? 1) >= 10).length;

    const groupedByStrategy = new Map<string, { trades: number; wins: number; pnl: number; leverageTotal: number; losses: number }>();
    for (const { agent, trade } of closedTrades) {
      const current = groupedByStrategy.get(agent.strategyType) ?? { trades: 0, wins: 0, pnl: 0, leverageTotal: 0, losses: 0 };
      current.trades += 1;
      current.pnl += trade.realizedPL;
      current.leverageTotal += trade.leverage ?? 1;
      if (trade.realizedPL >= 0) current.wins += 1;
      else current.losses += 1;
      groupedByStrategy.set(agent.strategyType, current);
    }

    const strategySummaries: StrategySummary[] = Array.from(groupedByStrategy.entries())
      .map(([strategyType, stats]) => {
        const avgStrategyPnl = stats.trades > 0 ? stats.pnl / stats.trades : 0;
        const avgLeverage = stats.trades > 0 ? stats.leverageTotal / stats.trades : 1;
        const summary: StrategySummary = {
          strategyType,
          closedTrades: stats.trades,
          wins: stats.wins,
          losses: stats.losses,
          avgPnl: avgStrategyPnl,
          avgLeverage,
          recommendation: '',
        };

        return {
          ...summary,
          recommendation: buildStrategyRecommendation(summary, lang),
        };
      })
      .sort((a, b) => b.avgPnl - a.avgPnl);

    const agentAdvice = agents
      .map((agent) => buildAgentRecommendation(agent, lang))
      .sort((a, b) => a.id - b.id);

    const suggestions: string[] = [];
    if (closedTrades.length === 0) {
      suggestions.push(
        lang === 'zh'
          ? '目前還沒有足夠平倉資料可供學習，先讓模擬持續累積樣本。'
          : 'There is not enough closed-trade history yet. Let the simulation continue to build a larger sample.'
      );
    } else {
      if (winRate < 45) {
        suggestions.push(
          lang === 'zh'
            ? '整體勝率偏低，建議先提高進場門檻，避免過度頻繁進場。'
            : 'Overall win rate is low. Raise the entry bar first to avoid overtrading.'
        );
      }
      if (avgPnl < 0) {
        suggestions.push(
          lang === 'zh'
            ? '平均單筆盈虧為負，建議先檢查停利與停損比例是否失衡。'
            : 'Average PnL per trade is negative. Revisit the balance between take-profit and stop-loss.'
        );
      }
      if (highLeverageLosses >= 3) {
        suggestions.push(
          lang === 'zh'
            ? '高槓桿虧損次數偏多，建議優先降低槓桿並放慢進場速度。'
            : 'High-leverage losses are piling up. Reduce leverage and slow down entry frequency.'
        );
      }
      if (suggestions.length === 0) {
        suggestions.push(
          lang === 'zh'
            ? '目前整體表現穩定，可先維持主體規則，持續觀察下一批平倉結果。'
            : 'Overall performance is stable. Keep the current core rules and monitor the next batch of closed trades.'
        );
      }
    }

    return {
      closedTradesCount: closedTrades.length,
      winRate,
      avgPnl,
      wins,
      losses,
      highLeverageLosses,
      reviewedTrades,
      strategySummaries,
      agentAdvice,
      suggestions,
    };
  }, [agents, lang]);

  return (
    <main className="max-w-[1600px] mx-auto space-y-6 p-4 sm:p-6">
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-5 text-sky-50 shadow-[0_0_30px_rgba(14,165,233,0.08)]">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-sky-400/15 p-2 text-sky-300">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold tracking-wide text-sky-100">{t.heroTitle}</p>
            <p className="text-sm leading-relaxed text-sky-50/90">{t.heroBody}</p>
            <p className="text-xs leading-relaxed text-sky-100/70">{t.heroNote}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t.metrics.closedTrades} value={analysis.closedTradesCount} accent="sky" icon={<BrainCircuit className="h-4 w-4" />} />
        <MetricCard label={t.metrics.winRate} value={`${analysis.winRate.toFixed(1)}%`} accent={analysis.winRate >= 50 ? 'emerald' : 'amber'} icon={<TrendingUp className="h-4 w-4" />} />
        <MetricCard label={t.metrics.avgPnl} value={`${analysis.avgPnl >= 0 ? '+' : ''}$${analysis.avgPnl.toFixed(2)}`} accent={analysis.avgPnl >= 0 ? 'emerald' : 'rose'} icon={<TrendingDown className="h-4 w-4" />} />
        <MetricCard label={t.metrics.highLeverageLosses} value={analysis.highLeverageLosses} accent={analysis.highLeverageLosses > 0 ? 'amber' : 'emerald'} icon={<TriangleAlert className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            {t.summaryTitle}
          </div>
          <div className="space-y-3">
            {analysis.suggestions.map((suggestion) => (
              <div key={suggestion} className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-50/90">
                {suggestion}
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <SmallStat label={lang === 'zh' ? '獲利筆數' : 'Wins'} value={analysis.wins} />
              <SmallStat label={lang === 'zh' ? '虧損筆數' : 'Losses'} value={analysis.losses} />
              <SmallStat label={lang === 'zh' ? '代理數量' : 'Agents'} value={agents.length} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
            <BrainCircuit className="h-4 w-4 text-sky-400" />
            {t.recentTitle}
          </div>
          <div className="custom-scrollbar max-h-[580px] space-y-3 overflow-y-auto pr-2">
            {analysis.reviewedTrades.length > 0 ? (
              analysis.reviewedTrades.map((item) => (
                <div key={item.trade.id} className="rounded-xl border border-white/5 bg-black/30 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">{item.agentName}</p>
                      <p className="text-[11px] text-white/40">{item.strategyType}</p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
                        item.verdict === 'good' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'
                      )}
                    >
                      {item.verdict === 'good' ? t.verdictKeep : t.verdictReview}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                    <span className="rounded bg-white/5 px-2 py-1 text-white/70">
                      {item.trade.symbol} {item.trade.action} {item.trade.type}
                    </span>
                    <span
                      className={cn(
                        'rounded px-2 py-1',
                        item.trade.realizedPL >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      )}
                    >
                      {item.trade.realizedPL >= 0 ? '+' : ''}${item.trade.realizedPL.toFixed(2)}
                    </span>
                    <span className="rounded bg-white/5 px-2 py-1 text-white/50">{(item.trade.leverage ?? 1)}x</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/70">{item.note}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/5 bg-black/30 p-6 text-sm text-white/40">{t.noReviews}</div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
          <Bot className="h-4 w-4 text-emerald-400" />
          {t.agentTitle}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {analysis.agentAdvice.map((item) => (
            <button
              key={item.id}
              onClick={() => onOpenAgent(item.id)}
              className="rounded-xl border border-white/5 bg-black/30 p-4 text-left transition-colors hover:border-sky-500/30 hover:bg-black/40"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{item.name}</p>
                  <p className="mt-1 text-[11px] text-white/40">{item.strategyType}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className={cn('text-sm font-mono font-bold', item.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {item.totalPnl >= 0 ? '+' : ''}${item.totalPnl.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-white/35">{item.closedTrades} {t.closedTradesUnit}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                <SmallStat label={t.stats.totalProfit} value={`${item.totalPnl >= 0 ? '+' : ''}$${item.totalPnl.toFixed(2)}`} />
                <SmallStat label={t.stats.winRate} value={`${item.winRate.toFixed(0)}%`} />
                <SmallStat label={t.stats.leverage} value={`${item.avgLeverage.toFixed(1)}x`} />
                <SmallStat label={t.stats.positions} value={item.activePositions} />
              </div>

              <p className="mt-4 text-sm leading-relaxed text-white/70">{item.recommendation}</p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-sky-300">
                {t.openDetail}
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
          <BrainCircuit className="h-4 w-4 text-emerald-400" />
          {t.strategyTitle}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {analysis.strategySummaries.length > 0 ? (
            analysis.strategySummaries.map((summary) => (
              <div key={summary.strategyType} className="rounded-xl border border-white/5 bg-black/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{summary.strategyType}</p>
                    <p className="mt-1 text-[11px] text-white/40">{t.strategyMeta(summary.closedTrades, summary.wins, summary.losses)}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className={cn('text-sm font-mono font-bold', summary.avgPnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {summary.avgPnl >= 0 ? '+' : ''}${summary.avgPnl.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-white/35">{t.averageLeverage(summary.avgLeverage)}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/70">{summary.recommendation}</p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/5 bg-black/30 p-6 text-sm text-white/40">{t.noStrategies}</div>
          )}
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  accent: 'sky' | 'emerald' | 'rose' | 'amber';
  icon: ReactNode;
}) {
  const accentClass =
    accent === 'emerald'
      ? 'bg-emerald-500/10 text-emerald-400'
      : accent === 'rose'
        ? 'bg-rose-500/10 text-rose-400'
        : accent === 'amber'
          ? 'bg-amber-500/10 text-amber-300'
          : 'bg-sky-500/10 text-sky-300';

  return (
    <div className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div className={cn('rounded-lg p-2', accentClass)}>{icon}</div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 p-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">{label}</p>
      <p className="mt-1 text-sm font-mono text-white">{value}</p>
    </div>
  );
}
