import { useMemo, type ReactNode } from 'react';
import { ArrowRight, Bot, BrainCircuit, Lightbulb, Send, TrendingDown, TrendingUp } from 'lucide-react';
import { Agent } from '../types';
import { cn } from '../lib/utils';
import {
  buildAgentRecommendation,
  buildUnifiedLearningModel,
  getLearningSourceAgents,
  type Language,
} from '../lib/learningLab';

export type { Language } from '../lib/learningLab';

type LearningProps = {
  agents: Agent[];
  onOpenAgent: (agentId: number) => void;
  lang: Language;
};

const copy = {
  zh: {
    heroTitle: 'AI 學習頁面',
    heroBody: '這裡只學習儀表板前六名盈利 AI 的策略、下單依據、平倉結果與複盤重點，整理成一個更好的融合模型。',
    heroNote: '每當來源 AI 新增一筆平倉，學習模型就會更新，並可提供給 AI#101 在獨立沙盒裡持續做單。',
    metrics: {
      sourceAgents: '學習來源 AI',
      closedTrades: '已學習平倉數',
      winRate: '來源勝率',
      avgPnl: '來源平均單筆',
    },
    summaryTitle: '融合模型總結',
    sourceTitle: '前六名盈利 AI 學習來源',
    entryTitle: '整合後下單依據',
    exitTitle: '整合後出場與風控',
    reviewTitle: '複盤結論',
    transferTitle: '傳送到 AI#101',
    modelTitle: '學習完成模型',
    openDetail: '查看 AI 詳情',
    sourceRank: (value: number) => `來源第 ${value} 名`,
    noSource: '目前還沒有足夠的來源資料可供學習。',
    avgLeverage: (value: number) => `平均槓桿 ${value.toFixed(1)}x`,
    reviewBadge: '已整合',
    transferNote: 'AI#101 會讀取這個最新模型，但不會改動主儀表板的 100 個 AI 資料。',
    stats: {
      totalProfit: '總獲利',
      winRate: '勝率',
      leverage: '平均槓桿',
      positions: '持倉',
      closedTrades: '平倉筆數',
    },
  },
  en: {
    heroTitle: 'AI Learning Page',
    heroBody: 'This page learns only from the dashboard top six profitable AI agents, then merges their strategy, order logic, exits, and replay results into a stronger unified model.',
    heroNote: 'Whenever the source agents produce a new closed trade, the learning model refreshes and can be passed to AI#101 inside its own sandbox.',
    metrics: {
      sourceAgents: 'Source AI Agents',
      closedTrades: 'Closed Trades Learned',
      winRate: 'Source Win Rate',
      avgPnl: 'Source Avg Trade',
    },
    summaryTitle: 'Unified Model Summary',
    sourceTitle: 'Top 6 Profitable AI Sources',
    entryTitle: 'Merged Entry Logic',
    exitTitle: 'Merged Exit And Risk Logic',
    reviewTitle: 'Replay Conclusions',
    transferTitle: 'Transfer To AI#101',
    modelTitle: 'Finished Learning Model',
    openDetail: 'Open AI Detail',
    sourceRank: (value: number) => `Source Rank #${value}`,
    noSource: 'There is not enough source data to learn from yet.',
    avgLeverage: (value: number) => `Avg leverage ${value.toFixed(1)}x`,
    reviewBadge: 'Integrated',
    transferNote: 'AI#101 reads this latest model, while the main dashboard 100-agent dataset remains untouched.',
    stats: {
      totalProfit: 'Total Profit',
      winRate: 'Win Rate',
      leverage: 'Avg Leverage',
      positions: 'Positions',
      closedTrades: 'Closed Trades',
    },
  },
} as const;

export default function Learning({ agents, onOpenAgent, lang }: LearningProps) {
  const t = copy[lang];

  const analysis = useMemo(() => {
    const sourceAgents = getLearningSourceAgents(agents);
    const model = buildUnifiedLearningModel(agents, lang);
    const sourceAdvice = sourceAgents.map((agent, index) => ({
      rank: index + 1,
      advice: buildAgentRecommendation(agent, lang),
      agent,
    }));

    return {
      sourceAgents,
      sourceAdvice,
      model,
    };
  }, [agents, lang]);

  if (analysis.sourceAgents.length === 0) {
    return (
      <main className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
        <section className="rounded-2xl border border-white/5 bg-[#111] p-8 text-sm text-white/50">{t.noSource}</section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <section className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-5 text-sky-50 shadow-[0_0_30px_rgba(14,165,233,0.08)]">
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
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t.metrics.sourceAgents} value={analysis.sourceAgents.length} accent="sky" icon={<Bot className="h-4 w-4" />} />
        <MetricCard label={t.metrics.closedTrades} value={analysis.model.closedTradesReviewed} accent="emerald" icon={<BrainCircuit className="h-4 w-4" />} />
        <MetricCard label={t.metrics.winRate} value={`${analysis.model.winRate.toFixed(1)}%`} accent={analysis.model.winRate >= 50 ? 'emerald' : 'amber'} icon={<TrendingUp className="h-4 w-4" />} />
        <MetricCard label={t.metrics.avgPnl} value={`${analysis.model.avgPnl >= 0 ? '+' : ''}$${analysis.model.avgPnl.toFixed(2)}`} accent={analysis.model.avgPnl >= 0 ? 'emerald' : 'rose'} icon={<TrendingDown className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
            <Lightbulb className="h-4 w-4 text-amber-300" />
            {t.summaryTitle}
          </div>
          <div className="space-y-3">
            {analysis.model.reviewNotes.map((item) => (
              <div key={item} className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-50/90">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
            <Send className="h-4 w-4 text-emerald-400" />
            {t.transferTitle}
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
              <p className="text-sm font-bold text-white">{analysis.model.strategyTitle}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{analysis.model.unifiedStrategy}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SmallStat label={t.stats.totalProfit} value={`${analysis.model.totalPnl >= 0 ? '+' : ''}$${analysis.model.totalPnl.toFixed(2)}`} />
              <SmallStat label={t.stats.closedTrades} value={analysis.model.closedTradesReviewed} />
              <SmallStat label={t.stats.winRate} value={`${analysis.model.winRate.toFixed(1)}%`} />
              <SmallStat label={t.stats.leverage} value={`${analysis.model.avgLeverage.toFixed(1)}x`} />
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 p-4 text-sm leading-relaxed text-white/70">
              <p>{analysis.model.transferNote}</p>
              <p className="mt-2 text-xs text-white/45">{t.transferNote}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
          <BrainCircuit className="h-4 w-4 text-sky-300" />
          {t.modelTitle}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ModelPanel title={t.entryTitle} items={analysis.model.entryFocus} />
          <ModelPanel title={t.exitTitle} items={analysis.model.exitFocus} />
          <section className="rounded-xl border border-white/5 bg-black/30 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">{t.reviewTitle}</p>
            <div className="mt-3 space-y-2">
              {analysis.model.reviewNotes.map((item) => (
                <div key={item} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-white/75">
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
          <Bot className="h-4 w-4 text-emerald-400" />
          {t.sourceTitle}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {analysis.sourceAdvice.map(({ rank, advice, agent }) => (
            <article key={agent.id} className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {t.sourceRank(rank)}
                  </div>
                  <p className="text-sm font-bold text-white">{agent.name}</p>
                  <p className="text-[11px] text-white/40">{agent.strategyType}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className={cn('text-sm font-mono font-bold', advice.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {advice.totalPnl >= 0 ? '+' : ''}${advice.totalPnl.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-white/35">{advice.closedTrades} {t.stats.closedTrades}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                <SmallStat label={t.stats.totalProfit} value={`${advice.totalPnl >= 0 ? '+' : ''}$${advice.totalPnl.toFixed(2)}`} />
                <SmallStat label={t.stats.winRate} value={`${advice.winRate.toFixed(0)}%`} />
                <SmallStat label={t.stats.leverage} value={`${advice.avgLeverage.toFixed(1)}x`} />
                <SmallStat label={t.stats.positions} value={advice.activePositions} />
              </div>

              <div className="mt-4 rounded-xl border border-sky-500/10 bg-sky-500/5 p-4">
                <p className="text-sm leading-relaxed text-white/75">{agent.strategy}</p>
              </div>
              <div className="mt-3 rounded-xl border border-amber-500/10 bg-amber-500/5 p-4 text-sm leading-relaxed text-white/75">
                {advice.recommendation}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/45">
                  {t.reviewBadge}
                </span>
                <button
                  onClick={() => onOpenAgent(agent.id)}
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sky-300 transition-colors hover:text-sky-200"
                >
                  {t.openDetail}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))}
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

function ModelPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-xl border border-white/5 bg-black/30 p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-white/75">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
