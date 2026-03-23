import { useMemo, type ReactNode } from 'react';
import { ArrowLeft, Bot, BrainCircuit, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { Agent, Trade } from '../types';
import { cn } from '../lib/utils';
import { buildAgentRecommendation, type Language } from './Learning';

type LearningAgentDetailProps = {
  agent: Agent | null;
  onBack: () => void;
  lang: Language;
};

const copy = {
  zh: {
    back: '返回學習頁',
    missing: '找不到這個 AI 的學習資料。',
    recommendation: '調參建議',
    history: '最近平倉紀錄',
    strategy: '策略概況',
    noTrades: '這個 AI 目前還沒有足夠的平倉紀錄可供分析。',
    stats: {
      winRate: '勝率',
      avgPnl: '平均單筆盈虧',
      leverage: '平均槓桿',
      positions: '目前持倉',
    },
  },
  en: {
    back: 'Back To Learning',
    missing: 'No learning data was found for this AI.',
    recommendation: 'Tuning Advice',
    history: 'Recent Closed Trades',
    strategy: 'Strategy Overview',
    noTrades: 'This AI does not have enough closed-trade history to analyze yet.',
    stats: {
      winRate: 'Win Rate',
      avgPnl: 'Average PnL',
      leverage: 'Avg Leverage',
      positions: 'Active Positions',
    },
  },
} as const;

export default function LearningAgentDetail({ agent, onBack, lang }: LearningAgentDetailProps) {
  const t = copy[lang];

  const detail = useMemo(() => {
    if (!agent) return null;

    const closedTrades = agent.trades.filter(
      (trade): trade is Trade & { realizedPL: number } =>
        trade.action === 'EXIT' && typeof trade.realizedPL === 'number'
    );
    const totalPnl = closedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0);
    const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
    const advice = buildAgentRecommendation(agent, lang);

    return {
      advice,
      closedTrades: closedTrades.slice(0, 20),
      avgPnl,
    };
  }, [agent, lang]);

  if (!agent || !detail) {
    return (
      <main className="mx-auto max-w-[1200px] p-4 sm:p-6">
        <div className="rounded-2xl border border-white/5 bg-[#111] p-8 text-white/60">{t.missing}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] space-y-6 p-4 sm:p-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.back}
      </button>

      <section className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-5 text-sky-50 shadow-[0_0_30px_rgba(14,165,233,0.08)]">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-sky-400/15 p-2 text-sky-300">
            <Bot className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold tracking-wide text-sky-100">{agent.name}</p>
            <p className="text-sm leading-relaxed text-sky-50/90">{agent.strategyType}</p>
            <p className="text-xs leading-relaxed text-sky-100/70">{detail.advice.recommendation}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t.stats.winRate} value={`${detail.advice.winRate.toFixed(1)}%`} accent={detail.advice.winRate >= 50 ? 'emerald' : 'amber'} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label={t.stats.avgPnl} value={`${detail.avgPnl >= 0 ? '+' : ''}$${detail.avgPnl.toFixed(2)}`} accent={detail.avgPnl >= 0 ? 'emerald' : 'rose'} icon={<TrendingDown className="h-4 w-4" />} />
        <StatCard label={t.stats.leverage} value={`${detail.advice.avgLeverage.toFixed(1)}x`} accent="sky" icon={<BrainCircuit className="h-4 w-4" />} />
        <StatCard label={t.stats.positions} value={detail.advice.activePositions} accent={detail.advice.activePositions > 1 ? 'amber' : 'emerald'} icon={<TriangleAlert className="h-4 w-4" />} />
      </div>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-white/60">{t.recommendation}</h2>
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-50/90">
          {detail.advice.recommendation}
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-white/60">{t.history}</h2>
        <div className="space-y-3">
          {detail.closedTrades.length > 0 ? (
            detail.closedTrades.map((trade) => (
              <div key={trade.id} className="rounded-xl border border-white/5 bg-black/30 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-white/5 px-2 py-1 text-[11px] font-mono text-white/70">
                      {trade.symbol} {trade.action} {trade.type}
                    </span>
                    <span
                      className={cn(
                        'rounded px-2 py-1 text-[11px] font-mono',
                        trade.realizedPL >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      )}
                    >
                      {trade.realizedPL >= 0 ? '+' : ''}${trade.realizedPL.toFixed(2)}
                    </span>
                    <span className="rounded bg-white/5 px-2 py-1 text-[11px] font-mono text-white/50">{(trade.leverage ?? 1)}x</span>
                  </div>
                  <span className="text-[11px] text-white/35">{new Date(trade.timestamp).toLocaleString()}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{trade.reason}</p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/5 bg-black/30 p-6 text-sm text-white/40">{t.noTrades}</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-white/60">{t.strategy}</h2>
        <p className="text-sm leading-relaxed text-white/70">{agent.strategy}</p>
      </section>
    </main>
  );
}

function StatCard({
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
        <div className={cn('rounded-lg p-2', accentClass)}>{icon}</div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
