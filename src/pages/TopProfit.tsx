import { useMemo } from 'react';
import { ArrowRight, BadgeDollarSign, Bot, BrainCircuit, ShieldAlert, TrendingUp, TriangleAlert } from 'lucide-react';
import { Agent, Trade } from '../types';
import { buildAgentRecommendation, type Language } from './Learning';
import { cn } from '../lib/utils';

type TopProfitProps = {
  agents: Agent[];
  lang: Language;
  onOpenAgent: (agentId: number) => void;
};

type RankedAgent = ReturnType<typeof buildAgentRecommendation> & {
  strategy: string;
  review: {
    summary: string;
    strengths: string[];
    risks: string[];
    action: string;
  };
};

const copy = {
  zh: {
    heroTitle: '前六名營利 AI',
    heroBody: '這個頁面會挑出目前總獲利最高的六個 AI，集中顯示它們的策略、表現重點與檢討內容。',
    heroNote: '排序依已實現總獲利由高到低，方便你快速查看目前最會賺的模型。',
    empty: '目前還沒有可列入排行榜的營利 AI，等更多平倉資料產生後會出現在這裡。',
    totalProfit: '總獲利',
    winRate: '勝率',
    avgPnl: '平均單筆',
    positions: '持倉',
    strategy: '策略',
    review: '檢討',
    strengths: '做得好的地方',
    risks: '要留意的地方',
    action: '下一步建議',
    openDetail: '查看 AI 詳情',
    rank: (value: number) => `第 ${value} 名`,
    summaryStable: '這個 AI 在目前樣本中維持正向獲利，策略執行相對穩定。',
    summaryStrong: '這個 AI 的累積獲利明顯領先，是目前最值得優先觀察的策略之一。',
    strengthProfit: '已實現總獲利維持正值，代表平倉後仍能留下淨收益。',
    strengthWinRate: '勝率站上 55%，表示進出場邏輯整體仍具一致性。',
    strengthRisk: '平均槓桿偏低，獲利不是單純靠高風險堆出來的。',
    riskSample: '平倉樣本仍偏少，現在下結論還太早。',
    riskWinRate: '勝率不到 45%，近期獲利可能集中在少數交易。',
    riskLeverage: '平均槓桿偏高，若行情反轉，回撤可能會放大。',
    riskPositions: '同時持有多個部位，資金分散後更需要注意倉位管理。',
    actionDefend: '延續核心策略，同時把資金控管與出場紀律維持住。',
    actionTune: '保留主策略，接下來優先微調風險參數與進場頻率。',
  },
  en: {
    heroTitle: 'Top 6 Profitable AI',
    heroBody: 'This page highlights the six AI agents with the highest realized profit and summarizes their strategy and review notes.',
    heroNote: 'Ranking is based on realized total profit from highest to lowest so you can inspect the current leaders quickly.',
    empty: 'No profitable AI agents are available yet. Once more trades close in profit, they will appear here.',
    totalProfit: 'Total Profit',
    winRate: 'Win Rate',
    avgPnl: 'Avg Trade',
    positions: 'Positions',
    strategy: 'Strategy',
    review: 'Review',
    strengths: 'What is working',
    risks: 'What to watch',
    action: 'Next step',
    openDetail: 'Open AI Detail',
    rank: (value: number) => `Rank #${value}`,
    summaryStable: 'This AI is holding positive realized profit with relatively stable strategy execution in the current sample.',
    summaryStrong: 'This AI has built a clear profit lead and is one of the strongest models to review first right now.',
    strengthProfit: 'Realized profit remains positive after closed trades, which means gains are surviving after exits.',
    strengthWinRate: 'Win rate is above 55%, showing decent consistency in the current entry and exit logic.',
    strengthRisk: 'Average leverage is still controlled, so profits are not coming only from oversized risk.',
    riskSample: 'The closed-trade sample is still small, so confidence should stay moderate.',
    riskWinRate: 'Win rate is below 45%, which suggests recent gains may rely on only a few trades.',
    riskLeverage: 'Average leverage is elevated, so a reversal could produce a sharper drawdown.',
    riskPositions: 'Multiple open positions are active at the same time, so capital allocation needs closer attention.',
    actionDefend: 'Keep the core strategy and protect it with disciplined exits and capital control.',
    actionTune: 'Keep the main thesis, then fine-tune risk settings and entry frequency next.',
  },
} as const;

function buildReview(agent: Agent, lang: Language) {
  const t = copy[lang];
  const advice = buildAgentRecommendation(agent, lang);
  const closedTrades = agent.trades.filter(
    (trade): trade is Trade & { realizedPL: number } =>
      trade.action === 'EXIT' && typeof trade.realizedPL === 'number'
  );

  const strengths: string[] = [t.strengthProfit];
  if (advice.winRate >= 55) strengths.push(t.strengthWinRate);
  if (advice.avgLeverage <= 4) strengths.push(t.strengthRisk);

  const risks: string[] = [];
  if (closedTrades.length < 8) risks.push(t.riskSample);
  if (advice.winRate < 45) risks.push(t.riskWinRate);
  if (advice.avgLeverage >= 8) risks.push(t.riskLeverage);
  if (advice.activePositions >= 3) risks.push(t.riskPositions);
  if (risks.length === 0) risks.push(lang === 'zh' ? '目前沒有明顯的結構性風險，但仍要持續觀察下一批平倉表現。' : 'No major structural risk stands out right now, but the next batch of closed trades still matters.');

  return {
    ...advice,
    strategy: agent.strategy,
    review: {
      summary: advice.totalPnl >= 10 ? t.summaryStrong : t.summaryStable,
      strengths,
      risks,
      action: advice.winRate >= 55 && advice.avgPnl >= 0 ? t.actionDefend : t.actionTune,
    },
  };
}

export default function TopProfit({ agents, lang, onOpenAgent }: TopProfitProps) {
  const t = copy[lang];

  const rankedAgents = useMemo(() => {
    return agents
      .map((agent) => buildReview(agent, lang))
      .filter((agent) => agent.totalPnl > 0)
      .sort((a, b) => {
        if (b.totalPnl !== a.totalPnl) return b.totalPnl - a.totalPnl;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return a.id - b.id;
      })
      .slice(0, 6);
  }, [agents, lang]);

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-50 shadow-[0_0_30px_rgba(16,185,129,0.08)]">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-400/15 p-2 text-emerald-300">
            <BadgeDollarSign className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold tracking-wide text-emerald-100">{t.heroTitle}</p>
            <p className="text-sm leading-relaxed text-emerald-50/90">{t.heroBody}</p>
            <p className="text-xs leading-relaxed text-emerald-100/70">{t.heroNote}</p>
          </div>
        </div>
      </section>

      {rankedAgents.length === 0 ? (
        <section className="rounded-2xl border border-white/5 bg-[#111] p-8 text-sm text-white/50">
          {t.empty}
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rankedAgents.map((agent, index) => (
            <article key={agent.id} className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {t.rank(index + 1)}
                  </div>
                  <p className="text-lg font-bold text-white">{agent.name}</p>
                  <p className="text-xs text-white/40">{agent.strategyType}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className={cn('text-2xl font-mono font-bold', agent.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {agent.totalPnl >= 0 ? '+' : ''}${agent.totalPnl.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-white/35">{t.totalProfit}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <SmallStat label={t.totalProfit} value={`${agent.totalPnl >= 0 ? '+' : ''}$${agent.totalPnl.toFixed(2)}`} />
                <SmallStat label={t.winRate} value={`${agent.winRate.toFixed(0)}%`} />
                <SmallStat label={t.avgPnl} value={`${agent.avgPnl >= 0 ? '+' : ''}$${agent.avgPnl.toFixed(2)}`} />
                <SmallStat label={t.positions} value={agent.activePositions} />
              </div>

              <section className="mt-5 rounded-xl border border-sky-500/15 bg-sky-500/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-sky-300">
                  <BrainCircuit className="h-4 w-4" />
                  {t.strategy}
                </div>
                <p className="text-sm leading-relaxed text-white/75">{agent.strategy}</p>
              </section>

              <section className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-300">
                  <ShieldAlert className="h-4 w-4" />
                  {t.review}
                </div>
                <p className="text-sm leading-relaxed text-white/80">{agent.review.summary}</p>

                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-300">{t.strengths}</p>
                  <div className="space-y-2">
                    {agent.review.strengths.map((item) => (
                      <div key={item} className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-sm text-white/75">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-rose-300">{t.risks}</p>
                  <div className="space-y-2">
                    {agent.review.risks.map((item) => (
                      <div key={item} className="rounded-lg border border-rose-500/10 bg-rose-500/5 px-3 py-2 text-sm text-white/75">
                        <div className="flex items-start gap-2">
                          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                          <span>{item}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-white/5 bg-black/20 p-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-white/40">{t.action}</p>
                  <p className="text-sm leading-relaxed text-white/80">{agent.review.action}</p>
                </div>
              </section>

              <button
                onClick={() => onOpenAgent(agent.id)}
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-sky-300 transition-colors hover:text-sky-200"
              >
                <Bot className="h-4 w-4" />
                {t.openDetail}
                <ArrowRight className="h-4 w-4" />
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</p>
      <p className="mt-2 text-lg font-mono font-bold text-white">{value}</p>
    </div>
  );
}
