import { useMemo, type ReactNode } from 'react';
import { Bot, BrainCircuit, Lightbulb, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { Agent, Trade } from '../types';
import { cn } from '../lib/utils';

type LearningProps = {
  agents: Agent[];
};

type ReviewedTrade = {
  agentName: string;
  strategyType: string;
  trade: Trade & { realizedPL: number };
  verdict: 'good' | 'warning';
  note: string;
};

type StrategySummary = {
  strategyType: string;
  closedTrades: number;
  wins: number;
  losses: number;
  avgPnl: number;
  avgLeverage: number;
  recommendation: string;
};

type AgentAdvice = {
  id: number;
  name: string;
  strategyType: string;
  closedTrades: number;
  avgPnl: number;
  winRate: number;
  avgLeverage: number;
  activePositions: number;
  recommendation: string;
};

function reviewTrade(agent: Agent, trade: Trade & { realizedPL: number }): ReviewedTrade {
  const leverage = trade.leverage ?? 1;
  const isLoss = trade.realizedPL < 0;
  const isHighLeverageLoss = isLoss && leverage >= 10;

  let note = '這筆平倉為正報酬，可先保留目前條件，觀察是否能持續複製。';
  if (isHighLeverageLoss) {
    note = '這筆虧損伴隨高槓桿，建議先降低槓桿上限，再觀察回撤是否收斂。';
  } else if (isLoss) {
    note = '這筆平倉為虧損，建議先收緊進場 threshold，避免太早進場。';
  }

  return {
    agentName: agent.name,
    strategyType: agent.strategyType,
    trade,
    verdict: isLoss ? 'warning' : 'good',
    note,
  };
}

function buildAgentRecommendation(agent: Agent): AgentAdvice {
  const closedTrades = agent.trades.filter(
    (trade): trade is Trade & { realizedPL: number } =>
      trade.action === 'EXIT' && typeof trade.realizedPL === 'number'
  );

  const wins = closedTrades.filter((trade) => trade.realizedPL >= 0).length;
  const losses = closedTrades.length - wins;
  const totalPnl = closedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);
  const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const avgLeverage =
    closedTrades.length > 0
      ? closedTrades.reduce((sum, trade) => sum + (trade.leverage ?? 1), 0) / closedTrades.length
      : Object.values(agent.activePositions).reduce((sum, pos) => sum + pos.leverage, 0) / Math.max(Object.values(agent.activePositions).length, 1);

  let recommendation = '先持續收集更多平倉紀錄，暫時不要直接動參數。';

  if (closedTrades.length >= 3) {
    if (winRate < 40) {
      recommendation = '勝率偏低，建議提高 threshold，並把 riskTolerance 往下收。';
    } else if (avgPnl < 0 && avgLeverage >= 8) {
      recommendation = '平均盈虧為負且槓桿偏高，建議先下修槓桿上限。';
    } else if (avgPnl < 0) {
      recommendation = '平均盈虧為負，建議優先檢查停損是否過慢，或縮小單筆部位。';
    } else if (winRate >= 55 && avgPnl > 0) {
      recommendation = '近期表現穩定，可以先維持參數，只觀察是否出現回撤放大。';
    } else {
      recommendation = '表現中性，建議先微調停利停損，不要同時改太多參數。';
    }
  } else if (Object.keys(agent.activePositions).length > 1) {
    recommendation = '目前同時持倉較多，建議先控制同時開倉數，再觀察波動。';
  }

  if (agent.performance < -5) {
    recommendation = '近期回撤偏大，建議先降低 riskTolerance 與槓桿上限。';
  }

  return {
    id: agent.id,
    name: agent.name,
    strategyType: agent.strategyType,
    closedTrades: closedTrades.length,
    avgPnl,
    winRate,
    avgLeverage: Number.isFinite(avgLeverage) ? avgLeverage : 1,
    activePositions: Object.keys(agent.activePositions).length,
    recommendation,
  };
}

export default function Learning({ agents }: LearningProps) {
  const analysis = useMemo(() => {
    const closedTrades = agents
      .flatMap((agent) =>
        agent.trades
          .filter((trade): trade is Trade & { realizedPL: number } => trade.action === 'EXIT' && typeof trade.realizedPL === 'number')
          .map((trade) => ({ agent, trade }))
      )
      .sort((a, b) => b.trade.timestamp - a.trade.timestamp);

    const reviewedTrades = closedTrades
      .slice(0, 20)
      .map(({ agent, trade }) => reviewTrade(agent, trade));

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
      if (trade.realizedPL >= 0) {
        current.wins += 1;
      } else {
        current.losses += 1;
      }
      groupedByStrategy.set(agent.strategyType, current);
    }

    const strategySummaries: StrategySummary[] = Array.from(groupedByStrategy.entries())
      .map(([strategyType, stats]) => {
        const avgStrategyPnl = stats.trades > 0 ? stats.pnl / stats.trades : 0;
        const avgLeverage = stats.trades > 0 ? stats.leverageTotal / stats.trades : 1;
        const strategyWinRate = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;

        let recommendation = '資料量還偏少，先持續收集更多平倉紀錄。';
        if (stats.trades >= 3) {
          if (strategyWinRate < 40) {
            recommendation = '這組策略勝率偏低，建議提高進場門檻並收緊 riskTolerance。';
          } else if (avgStrategyPnl < 0 && avgLeverage >= 8) {
            recommendation = '平均盈虧為負且槓桿偏高，建議先下修槓桿上限。';
          } else if (strategyWinRate >= 55 && avgStrategyPnl > 0) {
            recommendation = '近期表現穩定，可先維持目前設定，持續觀察回撤。';
          } else {
            recommendation = '建議先微調停損與停利，不要一次調整太多條件。';
          }
        }

        return {
          strategyType,
          closedTrades: stats.trades,
          wins: stats.wins,
          losses: stats.losses,
          avgPnl: avgStrategyPnl,
          avgLeverage,
          recommendation,
        };
      })
      .sort((a, b) => b.closedTrades - a.closedTrades);

    const agentAdvice = agents
      .map(buildAgentRecommendation)
      .sort((a, b) => {
        if (b.closedTrades !== a.closedTrades) return b.closedTrades - a.closedTrades;
        return b.avgPnl - a.avgPnl;
      });

    const suggestions: string[] = [];
    if (closedTrades.length === 0) {
      suggestions.push('目前還沒有平倉資料，先讓代理跑出幾筆完整進出場，再開始調參。');
    } else {
      if (winRate < 45) {
        suggestions.push('整體勝率偏低，建議先提高進場門檻，避免過度頻繁進場。');
      }
      if (avgPnl < 0) {
        suggestions.push('平均單筆盈虧為負，建議先檢查停損與停利比例是否失衡。');
      }
      if (highLeverageLosses >= 3) {
        suggestions.push('高槓桿虧損筆數偏多，建議把高風險代理的槓桿上限先往下調。');
      }
      if (suggestions.length === 0) {
        suggestions.push('目前整體結果穩定，可以先維持參數，只持續蒐集更多樣本。');
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
  }, [agents]);

  return (
    <main className="max-w-[1600px] mx-auto p-4 space-y-6 sm:p-6">
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-5 text-sky-50 shadow-[0_0_30px_rgba(14,165,233,0.08)]">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-sky-400/15 p-2 text-sky-300">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold tracking-wide text-sky-100">AI 學習建議</p>
            <p className="text-sm leading-relaxed text-sky-50/90">
              這一頁只做交易後檢討、回測方向與參數建議，不會自動改你的策略或幫你下單。
            </p>
            <p className="text-xs leading-relaxed text-sky-100/70">
              每個 AI 都會有自己的建議，你可以先觀察，再手動把有效調整套回策略。
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="已分析平倉" value={analysis.closedTradesCount} accent="sky" icon={<BrainCircuit className="h-4 w-4" />} />
        <MetricCard label="整體勝率" value={`${analysis.winRate.toFixed(1)}%`} accent={analysis.winRate >= 50 ? 'emerald' : 'amber'} icon={<TrendingUp className="h-4 w-4" />} />
        <MetricCard label="平均單筆盈虧" value={`${analysis.avgPnl >= 0 ? '+' : ''}$${analysis.avgPnl.toFixed(2)}`} accent={analysis.avgPnl >= 0 ? 'emerald' : 'rose'} icon={<TrendingDown className="h-4 w-4" />} />
        <MetricCard label="高槓桿虧損" value={analysis.highLeverageLosses} accent={analysis.highLeverageLosses > 0 ? 'amber' : 'emerald'} icon={<TriangleAlert className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            學習建議摘要
          </div>
          <div className="space-y-3">
            {analysis.suggestions.map((suggestion) => (
              <div key={suggestion} className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-50/90">
                {suggestion}
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">獲利筆數</p>
              <p className="mt-2 text-2xl font-bold text-emerald-400">{analysis.wins}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">虧損筆數</p>
              <p className="mt-2 text-2xl font-bold text-rose-400">{analysis.losses}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">代理數量</p>
              <p className="mt-2 text-2xl font-bold text-white">{agents.length}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
            <BrainCircuit className="h-4 w-4 text-sky-400" />
            最近 20 筆檢討
          </div>
          <div className="space-y-3 max-h-[580px] overflow-y-auto pr-2 custom-scrollbar">
            {analysis.reviewedTrades.length > 0 ? (
              analysis.reviewedTrades.map((item) => (
                <div key={item.trade.id} className="rounded-xl border border-white/5 bg-black/30 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">{item.agentName}</p>
                      <p className="text-[11px] text-white/40">{item.strategyType}</p>
                    </div>
                    <span className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
                      item.verdict === 'good'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-amber-500/10 text-amber-300'
                    )}>
                      {item.verdict === 'good' ? 'keep' : 'review'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                    <span className="rounded bg-white/5 px-2 py-1 text-white/70">
                      {item.trade.symbol} {item.trade.action} {item.trade.type}
                    </span>
                    <span className={cn(
                      'rounded px-2 py-1',
                      item.trade.realizedPL >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    )}>
                      {item.trade.realizedPL >= 0 ? '+' : ''}${item.trade.realizedPL.toFixed(2)}
                    </span>
                    <span className="rounded bg-white/5 px-2 py-1 text-white/50">
                      {(item.trade.leverage ?? 1)}x
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/70">{item.note}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/5 bg-black/30 p-6 text-sm text-white/40">
                目前還沒有可回顧的平倉資料。先讓模擬完成幾筆進出場，這裡就會開始產生學習建議。
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
          <Bot className="h-4 w-4 text-emerald-400" />
          每個 AI 的調參建議
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {analysis.agentAdvice.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{item.name}</p>
                  <p className="mt-1 text-[11px] text-white/40">{item.strategyType}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className={cn(
                    'text-sm font-mono font-bold',
                    item.avgPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {item.avgPnl >= 0 ? '+' : ''}${item.avgPnl.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-white/35">{item.closedTrades} 筆平倉</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <SmallStat label="勝率" value={`${item.winRate.toFixed(0)}%`} />
                <SmallStat label="均槓桿" value={`${item.avgLeverage.toFixed(1)}x`} />
                <SmallStat label="持倉" value={item.activePositions} />
              </div>

              <p className="mt-4 text-sm leading-relaxed text-white/70">{item.recommendation}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
          <BrainCircuit className="h-4 w-4 text-emerald-400" />
          策略群組建議
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {analysis.strategySummaries.length > 0 ? (
            analysis.strategySummaries.map((summary) => (
              <div key={summary.strategyType} className="rounded-xl border border-white/5 bg-black/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{summary.strategyType}</p>
                    <p className="mt-1 text-[11px] text-white/40">
                      平倉 {summary.closedTrades} 筆，勝 {summary.wins} / 負 {summary.losses}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className={cn(
                      'text-sm font-mono font-bold',
                      summary.avgPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    )}>
                      {summary.avgPnl >= 0 ? '+' : ''}${summary.avgPnl.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-white/35">平均槓桿 {summary.avgLeverage.toFixed(1)}x</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/70">{summary.recommendation}</p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/5 bg-black/30 p-6 text-sm text-white/40">
              目前還沒有足夠的策略群組平倉資料，因此暫時沒有群組級建議。
            </div>
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
      ? 'text-emerald-400 bg-emerald-500/10'
      : accent === 'rose'
        ? 'text-rose-400 bg-rose-500/10'
        : accent === 'amber'
          ? 'text-amber-300 bg-amber-500/10'
          : 'text-sky-300 bg-sky-500/10';

  return (
    <div className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div className={cn('rounded-lg p-2', accentClass)}>
          {icon}
        </div>
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
