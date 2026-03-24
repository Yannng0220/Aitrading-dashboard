import { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, RefreshCw, ShieldAlert, TrendingUp, TriangleAlert } from 'lucide-react';
import { Agent, Trade } from '../types';
import { getDashboardRankedAgents } from '../lib/ranking';
import { buildAgentRecommendation, type Language } from './Learning';
import { executeStrategy, fetchAllBybitTickers } from '../simulation';
import { cn } from '../lib/utils';

type SelfLearningLabProps = {
  seedAgents: Agent[];
  seedPrices: Record<string, number>;
  lang: Language;
};

type SandboxState = {
  savedAt: number;
  startedAt: number;
  agents: Agent[];
  prices: Record<string, number>;
};

const STORAGE_KEY = 'selfLearningLabState:v1';
const TICK_MS = 5000;
const MAX_REPLAY_AGENTS = 6;

const copy = {
  zh: {
    heroTitle: '前六名複盤自學實驗室',
    heroBody: '這個頁面只會複製儀表板前六名 AI，並在獨立沙盒內做複盤、自我學習與策略微調。',
    heroNote: '排名來源仍以儀表板為準，但這裡的策略調整、後續績效與學習結果都不會回寫到主儀表板。',
    reset: '重新複製儀表板前六名',
    totalProfit: '沙盒獲利',
    winRate: '勝率',
    avgPnl: '平均單筆',
    positions: '持倉',
    learningRounds: '學習輪次',
    strategy: '目前策略',
    review: '複盤檢討',
    learningAction: '自我學習調整',
    strengths: '做得好的地方',
    risks: '要留意的地方',
    empty: '目前還沒有可複盤的前六名資料。',
    rank: (value: number) => `第 ${value} 名`,
    stable: '這個 AI 在沙盒複盤中仍維持正向優勢。',
    weak: '這個 AI 在沙盒複盤中出現轉弱跡象，建議再觀察下一輪。',
    strengthProfit: '目前仍維持正獲利，代表核心策略在複盤後還有延續性。',
    strengthWinRate: '勝率維持在 50% 以上，執行品質仍在可接受範圍。',
    strengthRisk: '槓桿與同時持倉數量仍在可控範圍內。',
    riskSample: '目前沙盒樣本還不大，對策略優勢的判斷要保守。',
    riskWinRate: '勝率偏低，近期表現可能集中在少數交易。',
    riskLeverage: '平均槓桿偏高，下一次反轉時回撤可能放大。',
    riskPositions: '同時持倉偏多，資金分配需要更謹慎。',
    actionDefend: '先保留主策略，並用更嚴格的出場與風控保護成果。',
    actionTune: '先降低風險承受，再微調進場門檻與敏感度。',
    fallbackRisk: '目前沒有明顯結構性風險，但下一輪學習結果仍值得持續觀察。',
    fallbackLearning: '維持目前調整方向，繼續累積更多複盤樣本再判斷。',
  },
  en: {
    heroTitle: 'Top 6 Replay And Self-Learning Lab',
    heroBody: 'This page clones only the dashboard top six agents, then runs isolated replay, self-learning, and strategy tuning inside its own sandbox.',
    heroNote: 'The ranking still comes from the dashboard, but every adjustment and later result stays separate from the main dashboard state.',
    reset: 'Reclone Dashboard Top 6',
    totalProfit: 'Sandbox Profit',
    winRate: 'Win Rate',
    avgPnl: 'Avg Trade',
    positions: 'Positions',
    learningRounds: 'Learning Rounds',
    strategy: 'Current Strategy',
    review: 'Replay Review',
    learningAction: 'Self-Learning Adjustment',
    strengths: 'Current strengths',
    risks: 'Current risks',
    empty: 'No replay data is available for the dashboard top six yet.',
    rank: (value: number) => `Rank #${value}`,
    stable: 'This AI is still holding an edge inside the replay sandbox.',
    weak: 'This AI is weakening inside the replay sandbox and needs another review pass.',
    strengthProfit: 'It still holds positive profit, so the core idea is still working after replay.',
    strengthWinRate: 'Win rate is still above 50%, which keeps execution quality acceptable.',
    strengthRisk: 'Leverage and concurrent position count are still under control.',
    riskSample: 'The sandbox learning sample is still limited, so confidence should stay measured.',
    riskWinRate: 'Win rate is soft, so the recent edge may not be stable enough yet.',
    riskLeverage: 'Average leverage is elevated, which can magnify the next reversal.',
    riskPositions: 'Too many concurrent positions can dilute capital control.',
    actionDefend: 'Keep the main strategy and protect it with disciplined exits and risk control.',
    actionTune: 'Reduce risk appetite first, then tune entry thresholds and sensitivity.',
    fallbackRisk: 'No major structural risk stands out yet, but the next learning round still matters.',
    fallbackLearning: 'Keep the current tuning direction and gather more replay samples before changing course.',
  },
} as const;

function cloneAgents(agents: Agent[]) {
  return JSON.parse(JSON.stringify(agents)) as Agent[];
}

function normalizeAgents(agents: Agent[]) {
  return getDashboardRankedAgents(cloneAgents(agents)).slice(0, MAX_REPLAY_AGENTS);
}

function buildInitialState(seedAgents: Agent[], seedPrices: Record<string, number>): SandboxState {
  return {
    savedAt: Date.now(),
    startedAt: Date.now(),
    agents: normalizeAgents(seedAgents),
    prices: { ...seedPrices },
  };
}

function parseSavedState(raw: string | null): SandboxState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SandboxState>;
    if (!parsed || !Array.isArray(parsed.agents) || !parsed.prices || typeof parsed.prices !== 'object') {
      return null;
    }

    return {
      savedAt: Number(parsed.savedAt) || Date.now(),
      startedAt: Number(parsed.startedAt) || Date.now(),
      agents: normalizeAgents(parsed.agents as Agent[]),
      prices: { ...(parsed.prices as Record<string, number>) },
    };
  } catch {
    return null;
  }
}

function readStoredSandboxState() {
  try {
    return parseSavedState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getActivePositionCount(agent: Agent) {
  return Object.keys(agent.activePositions ?? {}).length;
}

function tuneAgentWithLearning(agent: Agent, lang: Language) {
  const advice = buildAgentRecommendation(agent, lang);
  const params = {
    riskTolerance: Number(agent.strategyParams?.riskTolerance ?? 0.1),
    sensitivity: Number(agent.strategyParams?.sensitivity ?? 1),
    threshold: Number(agent.strategyParams?.threshold ?? 0.001),
    exitThreshold: Number(agent.strategyParams?.exitThreshold ?? 0.003),
    stopLoss: Number(agent.strategyParams?.stopLoss ?? 0.02),
    takeProfit: Number(agent.strategyParams?.takeProfit ?? 0.04),
    learnRevision: Number(agent.strategyParams?.learnRevision ?? 0),
  };

  if (advice.winRate < 45 || advice.totalPnl < 0 || agent.performance < 0) {
    params.riskTolerance = clamp(params.riskTolerance * 0.92, 0.03, 0.35);
    params.threshold = clamp(params.threshold * 1.08, 0.0004, 0.02);
    params.sensitivity = clamp(params.sensitivity * 0.96, 0.5, 2.5);
    params.stopLoss = clamp(params.stopLoss * 0.92, 0.005, 0.05);
  } else if (advice.winRate >= 55 && advice.avgPnl >= 0) {
    params.riskTolerance = clamp(params.riskTolerance * 1.03, 0.03, 0.4);
    params.threshold = clamp(params.threshold * 0.98, 0.0003, 0.02);
    params.takeProfit = clamp(params.takeProfit * 1.04, 0.01, 0.12);
    params.sensitivity = clamp(params.sensitivity * 1.02, 0.5, 2.5);
  } else {
    params.threshold = clamp(params.threshold * 1.02, 0.0003, 0.02);
    params.exitThreshold = clamp(params.exitThreshold * 1.01, 0.001, 0.04);
  }

  params.learnRevision += 1;

  const baseStrategy = agent.strategy.split(' | Learn ')[0];
  const nextStrategy =
    lang === 'zh'
      ? `${baseStrategy} | Learn ${params.learnRevision} (風險 ${params.riskTolerance.toFixed(2)}, 敏感度 ${params.sensitivity.toFixed(2)})`
      : `${baseStrategy} | Learn ${params.learnRevision} (risk ${params.riskTolerance.toFixed(2)}, sensitivity ${params.sensitivity.toFixed(2)})`;

  return {
    ...agent,
    strategy: nextStrategy,
    strategyParams: {
      ...agent.strategyParams,
      ...params,
      lastLearningAt: Date.now(),
      learningNote: advice.recommendation,
    },
  };
}

function buildReplayReview(agent: Agent, lang: Language) {
  const t = copy[lang];
  const advice = buildAgentRecommendation(agent, lang);
  const closedTrades = agent.trades.filter(
    (trade): trade is Trade & { realizedPL: number } =>
      trade.action === 'EXIT' && typeof trade.realizedPL === 'number'
  );

  const strengths: string[] = [t.strengthProfit];
  if (advice.winRate >= 50) strengths.push(t.strengthWinRate);
  if (advice.avgLeverage <= 6 && advice.activePositions <= 3) strengths.push(t.strengthRisk);

  const risks: string[] = [];
  if (closedTrades.length < 6) risks.push(t.riskSample);
  if (advice.winRate < 45) risks.push(t.riskWinRate);
  if (advice.avgLeverage >= 8) risks.push(t.riskLeverage);
  if (advice.activePositions >= 4) risks.push(t.riskPositions);
  if (risks.length === 0) risks.push(t.fallbackRisk);

  return {
    ...advice,
    summary: advice.totalPnl >= 0 ? t.stable : t.weak,
    strengths,
    risks,
    action: advice.totalPnl >= 0 && advice.winRate >= 50 ? t.actionDefend : t.actionTune,
  };
}

export default function SelfLearningLab({ seedAgents, seedPrices, lang }: SelfLearningLabProps) {
  const t = copy[lang];
  const [sandbox, setSandbox] = useState<SandboxState>(() => readStoredSandboxState() ?? buildInitialState(seedAgents, seedPrices));
  const historyMapRef = useRef<Record<string, number[]>>({});
  const tickRef = useRef(0);

  useEffect(() => {
    historyMapRef.current = Object.fromEntries(
      Object.entries(sandbox.prices).map(([symbol, price]) => [symbol, Array.from({ length: 20 }, () => price)])
    );
  }, [sandbox.prices]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...sandbox, savedAt: Date.now() }));
    } catch (error) {
      console.warn('self-learning sandbox write failed', error);
    }
  }, [sandbox]);

  useEffect(() => {
    let cancelled = false;

    const interval = window.setInterval(async () => {
      try {
        const allPrices = await fetchAllBybitTickers();
        if (cancelled || Object.keys(allPrices).length === 0) return;

        Object.keys(allPrices).forEach((symbol) => {
          const seedPrice = allPrices[symbol];
          const currentHistory = historyMapRef.current[symbol] ?? Array.from({ length: 20 }, () => seedPrice);
          historyMapRef.current[symbol] = [...currentHistory.slice(-19), seedPrice];
        });

        tickRef.current += 1;
        const shouldLearn = tickRef.current % 3 === 0;

        setSandbox((prev) => {
          const simulated = prev.agents.map((agent) => ({
            ...agent,
            ...executeStrategy(agent, allPrices, historyMapRef.current),
          }));
          const learned = shouldLearn ? simulated.map((agent) => tuneAgentWithLearning(agent, lang)) : simulated;

          return {
            ...prev,
            savedAt: Date.now(),
            prices: allPrices,
            agents: normalizeAgents(learned),
          };
        });
      } catch (error) {
        console.warn('self-learning sandbox tick failed', error);
      }
    }, TICK_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [lang]);

  const replayAgents = useMemo(() => {
    return normalizeAgents(sandbox.agents).map((agent, index) => ({
      agent,
      rank: index + 1,
      review: buildReplayReview(agent, lang),
    }));
  }, [sandbox.agents, lang]);

  const resetFromDashboard = () => {
    const next = buildInitialState(seedAgents, seedPrices);
    historyMapRef.current = Object.fromEntries(
      Object.entries(next.prices).map(([symbol, price]) => [symbol, Array.from({ length: 20 }, () => price)])
    );
    tickRef.current = 0;
    setSandbox(next);
  };

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-50 shadow-[0_0_30px_rgba(16,185,129,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-400/15 p-2 text-emerald-300">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold tracking-wide text-emerald-100">{t.heroTitle}</p>
              <p className="text-sm leading-relaxed text-emerald-50/90">{t.heroBody}</p>
              <p className="text-xs leading-relaxed text-emerald-100/70">{t.heroNote}</p>
            </div>
          </div>
          <button
            onClick={resetFromDashboard}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/80 transition-colors hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            {t.reset}
          </button>
        </div>
      </section>

      {replayAgents.length === 0 ? (
        <section className="rounded-2xl border border-white/5 bg-[#111] p-8 text-sm text-white/50">
          {t.empty}
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {replayAgents.map(({ agent, rank, review }) => (
            <article key={agent.id} className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {t.rank(rank)}
                  </div>
                  <p className="text-lg font-bold text-white">{agent.name}</p>
                  <p className="text-xs text-white/40">{agent.strategyType}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className={cn('text-2xl font-mono font-bold', review.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {review.totalPnl >= 0 ? '+' : ''}${review.totalPnl.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-white/35">{t.totalProfit}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <SmallStat label={t.totalProfit} value={`${review.totalPnl >= 0 ? '+' : ''}$${review.totalPnl.toFixed(2)}`} />
                <SmallStat label={t.winRate} value={`${review.winRate.toFixed(0)}%`} />
                <SmallStat label={t.avgPnl} value={`${review.avgPnl >= 0 ? '+' : ''}$${review.avgPnl.toFixed(2)}`} />
                <SmallStat label={t.positions} value={review.activePositions} />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <SmallStat label={t.learningRounds} value={Number(agent.strategyParams?.learnRevision ?? 0)} />
                <SmallStat label={t.positions} value={getActivePositionCount(agent)} />
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
                <p className="text-sm leading-relaxed text-white/80">{review.summary}</p>

                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-300">{t.strengths}</p>
                  <div className="space-y-2">
                    {review.strengths.map((item) => (
                      <div key={item} className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-sm text-white/75">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-rose-300">{t.risks}</p>
                  <div className="space-y-2">
                    {review.risks.map((item) => (
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
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-white/40">{t.learningAction}</p>
                  <p className="text-sm leading-relaxed text-white/80">
                    {typeof agent.strategyParams?.learningNote === 'string' && agent.strategyParams.learningNote.trim()
                      ? agent.strategyParams.learningNote
                      : review.action || t.fallbackLearning}
                  </p>
                </div>
              </section>
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
