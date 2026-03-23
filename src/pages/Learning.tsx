import { useMemo, type ReactNode } from 'react';
import { BrainCircuit, Lightbulb, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { Agent, Trade } from '../types';
import { cn } from '../lib/utils';

type LearningProps = {
  agents: Agent[];
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

type ReviewedTrade = {
  agentName: string;
  strategyType: string;
  trade: Trade;
  verdict: 'good' | 'warning';
  note: string;
};

function getTradeReview(agent: Agent, trade: Trade): ReviewedTrade | null {
  if (trade.action !== 'EXIT' || trade.realizedPL === undefined) {
    return null;
  }

  const leverage = trade.leverage ?? 1;
  const isLoss = trade.realizedPL < 0;
  const isHighLeverageLoss = isLoss && leverage >= 10;

  return {
    agentName: agent.name,
    strategyType: agent.strategyType,
    trade,
    verdict: isHighLeverageLoss || isLoss ? 'warning' : 'good',
    note: isHighLeverageLoss
      ? '高槓桿虧損，建議先降低槓桿上限或縮小單筆風險。'
      : isLoss
        ? '這筆平倉為虧損，建議檢查進場門檻是否太寬。'
        : '這筆平倉為正報酬，可保留目前條件並觀察是否能複製。'
  };
}

export default function Learning({ agents }: LearningProps) {
  const analysis = useMemo(() => {
    const closedTrades = agents
      .flatMap(agent => agent.trades.map(trade => ({ agent, trade })))
      .filter((item): item is { agent: Agent; trade: Trade & { realizedPL: number } } =>
        item.trade.action === 'EXIT' && typeof item.trade.realizedPL === 'number'
      )
      .sort((a, b) => b.trade.timestamp - a.trade.timestamp);

    const reviewedTrades = closedTrades
      .map(({ agent, trade }) => getTradeReview(agent, trade))
      .filter((item): item is ReviewedTrade => item !== null)
      .slice(0, 20);

    const wins = closedTrades.filter(item => item.trade.realizedPL >= 0).length;
    const losses = closedTrades.length - wins;
    const totalPnl = closedTrades.reduce((sum, item) => sum + item.trade.realizedPL, 0);
    const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
    const highLeverageLosses = closedTrades.filter(item => item.trade.realizedPL < 0 && (item.trade.leverage ?? 1) >= 10).length;

    const byStrategy = new Map<string, { trades: number; wins: number; pnl: number; leverageTotal: number; losses: number }>();
    for (const { agent, trade } of closedTrades) {
      const current = byStrategy.get(agent.strategyType) ?? { trades: 0, wins: 0, pnl: 0, leverageTotal: 0, losses: 0 };
      current.trades += 1;
      current.pnl += trade.realizedPL;
      current.leverageTotal += trade.leverage ?? 1;
      if (trade.realizedPL >= 0) {
        current.wins += 1;
      } else {
        current.losses += 1;
      }
      byStrategy.set(agent.strategyType, current);
    }

    const strategySummaries: StrategySummary[] = Array.from(byStrategy.entries())
      .map(([strategyType, stats]) => {
        const avgStrategyPnl = stats.trades > 0 ? stats.pnl / stats.trades : 0;
        const avgLeverage = stats.trades > 0 ? stats.leverageTotal / stats.trades : 1;
        const strategyWinRate = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;

        let recommendation = '資料量還偏少，先持續收集更多平倉紀錄。';
        if (stats.trades >= 3) {
          if (strategyWinRate < 40) {
            recommendation = '勝率偏低，建議提高進場 threshold，並收緊 riskTolerance。';
          } else if (avgStrategyPnl < 0 && avgLeverage >= 8) {
            recommendation = '平均盈虧為負且槓桿偏高，建議先壓低槓桿上限。';
          } else if (strategyWinRate >= 55 && avgStrategyPnl > 0) {
            recommendation = '近期表現穩定，可先維持策略設定，只監控回撤。';
          } else {
            recommendation = '策略表現中性，建議優先檢查停損與出場條件是否過慢。';
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
              建議先觀察至少數十筆完整平倉紀錄，再把有效的調整手動套回策略參數。
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">目前代理數</p>
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
              尚未收集到足夠的策略平倉資料，因此還沒有策略群組建議。
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
