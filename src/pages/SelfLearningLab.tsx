import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, BrainCircuit, History, Info, RefreshCw, Send, ShieldAlert, TrendingUp } from 'lucide-react';
import { Agent, Position, Trade } from '../types';
import { executeStrategy, fetchAllBybitTickers } from '../simulation';
import { cn } from '../lib/utils';
import {
  buildAgentRecommendation,
  readLearningModel,
  type Language,
  type LearningModel,
} from '../lib/learningLab';

type SelfLearningLabProps = {
  seedPrices: Record<string, number>;
  lang: Language;
};

type Ai101State = {
  savedAt: number;
  prices: Record<string, number>;
  appliedFingerprint: string;
  agent: Agent;
};

const STORAGE_KEY = 'ai101SandboxState:v1';
const AI_101_ID = 100;
const STARTING_BALANCE = 1000;
const TICK_MS = 5000;
const MIN_MODEL_SAMPLE_SIZE = 12;
const MAX_AI101_POSITIONS = 5;

const copy = {
  zh: {
    heroTitle: 'AI 自學實驗室',
    heroBody: '這一頁只運行 AI#101。它會讀取學習頁整理好的融合模型，並用獨立的 1000 USD 沙盒資金持續驗證成效。',
    heroNote: 'AI#101 的策略、績效、持倉與交易都只存在這個實驗室，不會改動主儀表板的 100 個 AI 數據。',
    reset: '重置 AI#101 沙盒',
    waiting: '目前還沒有學習模型可供 AI#101 使用，請先到學習頁累積來源 AI 的平倉資料。',
    totalProfit: 'AI#101 沙盒獲利',
    winRate: '勝率',
    avgPnl: '平均單筆',
    positions: '持倉',
    strategy: 'AI#101 目前策略',
    transferTitle: '最近接收的學習模型',
    reviewTitle: 'AI#101 成效複盤',
    learningRounds: '接收模型次數',
    sourceAgents: '來源 AI',
    sourceTrades: '來源平倉數',
    transferStatus: '模型傳送狀態',
    transferReady: '已接收最新模型',
    openPositionsTitle: 'AI#101 目前持倉',
    entryLogicTitle: 'AI#101 開單邏輯',
    entryReasonTitle: 'AI#101 為什麼開單',
    noOpenPositions: 'AI#101 目前沒有持倉。',
    noEntryReasons: '目前還沒有新的進場單，等 AI#101 開第一筆單後就會顯示原因。',
    positionSize: '艙位大小',
    leverage: '槓桿',
    entryPrice: '進場價',
    marketPrice: '現價',
    unrealized: '浮動盈虧',
    preferredSymbols: '優先觀察標的',
    modelThreshold: '進場門檻',
    modelExit: '出場門檻',
    modelRisk: '單筆風險',
    sampleGate: '開單樣本門檻',
    maxPositions: '最多持倉數',
    waitingForSample: `來源平倉樣本未達 ${MIN_MODEL_SAMPLE_SIZE} 筆前，AI#101 只會等待，不會開單。`,
    reviewStable: 'AI#101 目前仍能依照融合模型維持正向表現。',
    reviewWeak: 'AI#101 目前表現轉弱，代表融合模型仍需要更多來源樣本。',
    strengths: '目前做得好的地方',
    risks: '目前要留意的地方',
    fallbackRisk: '目前沒有明顯的結構風險，但仍要持續觀察下一批平倉結果。',
  },
  en: {
    heroTitle: 'AI Self-Learning Lab',
    heroBody: 'This page runs AI#101 only. It reads the unified model generated on the learning page and validates it with an isolated 1000 USD sandbox balance.',
    heroNote: 'AI#101 strategy, performance, positions, and trades live only inside this lab and never modify the main dashboard 100-agent dataset.',
    reset: 'Reset AI#101 Sandbox',
    waiting: 'No learning model is available for AI#101 yet. Visit the learning page first so source agents can build more closed-trade history.',
    totalProfit: 'AI#101 Sandbox Profit',
    winRate: 'Win Rate',
    avgPnl: 'Avg Trade',
    positions: 'Positions',
    strategy: 'AI#101 Current Strategy',
    transferTitle: 'Latest Received Learning Model',
    reviewTitle: 'AI#101 Performance Review',
    learningRounds: 'Model Sync Count',
    sourceAgents: 'Source AI',
    sourceTrades: 'Source Closed Trades',
    transferStatus: 'Model Transfer Status',
    transferReady: 'Latest model received',
    openPositionsTitle: 'AI#101 Open Positions',
    entryLogicTitle: 'AI#101 Entry Logic',
    entryReasonTitle: 'Why AI#101 Opened The Trade',
    noOpenPositions: 'AI#101 has no open positions right now.',
    noEntryReasons: 'There are no fresh entry orders yet. The reason panel will fill in after AI#101 opens a trade.',
    positionSize: 'Position Size',
    leverage: 'Leverage',
    entryPrice: 'Entry Price',
    marketPrice: 'Market Price',
    unrealized: 'Unrealized PnL',
    preferredSymbols: 'Preferred Symbols',
    modelThreshold: 'Entry Threshold',
    modelExit: 'Exit Threshold',
    modelRisk: 'Risk Per Trade',
    sampleGate: 'Sample Gate',
    maxPositions: 'Max Positions',
    waitingForSample: `AI#101 stays idle until source closed trades reach ${MIN_MODEL_SAMPLE_SIZE}.`,
    reviewStable: 'AI#101 is still maintaining a positive edge under the unified model.',
    reviewWeak: 'AI#101 is weakening, which means the unified model still needs more source data.',
    strengths: 'Current strengths',
    risks: 'Current risks',
    fallbackRisk: 'No major structural risk stands out yet, but the next closed trades still matter.',
  },
} as const;

function buildAi101Agent(model: LearningModel | null, seedPrices: Record<string, number>) {
  const preferredSymbols =
    model?.params.preferredSymbols.length
      ? model.params.preferredSymbols
      : Object.keys(seedPrices).slice(0, 12);

  return {
    id: AI_101_ID,
    name: 'AI#101',
    strategyType: model ? 'Unified Learning Model' : 'Waiting Learning Model',
    strategy: model?.unifiedStrategy ?? 'Waiting for the learning page to generate a transferable model.',
    balance: STARTING_BALANCE,
    activePositions: {},
    equity: STARTING_BALANCE,
    unrealizedPL: 0,
    trades: [],
    performance: 0,
    color: 'hsl(163, 86%, 48%)',
    status: 'IDLE' as Agent['status'],
    strategyParams: {
      riskTolerance: model?.params.riskTolerance ?? 0.08,
      timeframe: 'SHORT',
      sensitivity: model?.params.sensitivity ?? 1,
      threshold: model?.params.threshold ?? 0.002,
      exitThreshold: model?.params.exitThreshold ?? 0.005,
      stopLoss: model?.params.stopLoss ?? 0.02,
      takeProfit: model?.params.takeProfit ?? 0.04,
      leverageMin: model?.params.leverageMin ?? 3,
      leverageMax: model?.params.leverageMax ?? 10,
      maxRiskPerTrade: model?.params.maxRiskPerTrade ?? 0.02,
      scanCount: model?.params.scanCount ?? 10,
      maxConcurrentPositions: MAX_AI101_POSITIONS,
      preferredSymbols,
      learningModelFingerprint: model?.sourceFingerprint ?? 'none',
      learnRevision: 0,
      learningNote: model?.transferNote ?? '',
    },
  };
}

function applyModelToAi101(agent: Agent, model: LearningModel) {
  return {
    ...agent,
    strategyType: 'Unified Learning Model',
    strategy: model.unifiedStrategy,
    strategyParams: {
      ...agent.strategyParams,
      ...model.params,
      timeframe: 'SHORT',
      preferredSymbols: model.params.preferredSymbols,
      maxConcurrentPositions: MAX_AI101_POSITIONS,
      learningModelFingerprint: model.sourceFingerprint,
      learningNote: model.transferNote,
      learnRevision: Number(agent.strategyParams?.learnRevision ?? 0) + 1,
    },
  };
}

function parseState(raw: string | null, model: LearningModel | null): Ai101State | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Ai101State>;
    if (!parsed || !parsed.agent || !parsed.prices || typeof parsed.prices !== 'object') return null;

    const nextAgent = model ? applyModelToAi101(parsed.agent as Agent, model) : (parsed.agent as Agent);

    return {
      savedAt: Number(parsed.savedAt) || Date.now(),
      prices: { ...(parsed.prices as Record<string, number>) },
      appliedFingerprint: model?.sourceFingerprint ?? 'none',
      agent: nextAgent,
    };
  } catch {
    return null;
  }
}

function readAi101State(model: LearningModel | null) {
  try {
    return parseState(localStorage.getItem(STORAGE_KEY), model);
  } catch {
    return null;
  }
}

function buildInitialState(model: LearningModel | null, seedPrices: Record<string, number>): Ai101State {
  return {
    savedAt: Date.now(),
    prices: { ...seedPrices },
    appliedFingerprint: model?.sourceFingerprint ?? 'none',
    agent: buildAi101Agent(model, seedPrices),
  };
}

function buildReview(agent: Agent, lang: Language) {
  const advice = buildAgentRecommendation(agent, lang);
  const t = copy[lang];
  const closedTrades = agent.trades.filter(
    (trade): trade is Trade & { realizedPL: number } =>
      trade.action === 'EXIT' && typeof trade.realizedPL === 'number'
  );

  const strengths: string[] = [];
  const risks: string[] = [];

  if (advice.totalPnl >= 0) strengths.push(lang === 'zh' ? '目前沙盒累積仍為正報酬，代表模型方向還在發揮效果。' : 'Sandbox profit remains positive, so the model direction is still contributing.');
  if (advice.winRate >= 50) strengths.push(lang === 'zh' ? '勝率維持在 50% 以上，出手品質尚可。' : 'Win rate is holding above 50%, so execution quality is acceptable.');
  if (advice.avgLeverage <= 6) strengths.push(lang === 'zh' ? '平均槓桿仍在可控區間。' : 'Average leverage remains in a controlled range.');

  if (closedTrades.length < 6) risks.push(lang === 'zh' ? 'AI#101 的平倉樣本還不大，暫時不要過度放大結果。' : 'AI#101 still has a small closed-trade sample, so results should stay provisional.');
  if (advice.winRate < 45) risks.push(lang === 'zh' ? '勝率偏低，模型可能還需要下一輪來源資料修正。' : 'Win rate is soft, so the model may still need the next source update.');
  if (advice.avgLeverage >= 8) risks.push(lang === 'zh' ? '平均槓桿偏高，回撤放大風險要留意。' : 'Average leverage is elevated, so drawdown risk can expand quickly.');
  if (risks.length === 0) risks.push(t.fallbackRisk);

  return {
    ...advice,
    summary: advice.totalPnl >= 0 ? t.reviewStable : t.reviewWeak,
    strengths,
    risks,
  };
}

function getPositionSize(position: Position) {
  return position.amount * position.avgEntryPrice / position.leverage;
}

export default function SelfLearningLab({ seedPrices, lang }: SelfLearningLabProps) {
  const t = copy[lang];
  const [model, setModel] = useState<LearningModel | null>(() => readLearningModel());
  const [sandbox, setSandbox] = useState<Ai101State>(() => {
    const initialModel = readLearningModel();
    return readAi101State(initialModel) ?? buildInitialState(initialModel, seedPrices);
  });
  const historyMapRef = useRef<Record<string, number[]>>({});

  useEffect(() => {
    const nextModel = readLearningModel();
    setModel(nextModel);
    setSandbox((prev) => {
      if (!nextModel || prev.appliedFingerprint === nextModel.sourceFingerprint) return prev;
      return {
        ...prev,
        savedAt: Date.now(),
        appliedFingerprint: nextModel.sourceFingerprint,
        agent: applyModelToAi101(prev.agent, nextModel),
      };
    });

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== 'learningModel:v1') return;
      const latest = readLearningModel();
      setModel(latest);
      setSandbox((prev) => {
        if (!latest || prev.appliedFingerprint === latest.sourceFingerprint) return prev;
        return {
          ...prev,
          savedAt: Date.now(),
          appliedFingerprint: latest.sourceFingerprint,
          agent: applyModelToAi101(prev.agent, latest),
        };
      });
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    historyMapRef.current = Object.fromEntries(
      Object.entries(sandbox.prices).map(([symbol, price]) => [symbol, Array.from({ length: 20 }, () => price)])
    );
  }, [sandbox.prices]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...sandbox, savedAt: Date.now() }));
    } catch (error) {
      console.warn('ai101 sandbox write failed', error);
    }
  }, [sandbox]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const latestModel = readLearningModel();
        if (latestModel && latestModel.sourceFingerprint !== sandbox.appliedFingerprint) {
          setModel(latestModel);
          setSandbox((prev) => ({
            ...prev,
            savedAt: Date.now(),
            appliedFingerprint: latestModel.sourceFingerprint,
            agent: applyModelToAi101(prev.agent, latestModel),
          }));
        }

        const allPrices = await fetchAllBybitTickers();
        if (Object.keys(allPrices).length === 0) return;

        Object.keys(allPrices).forEach((symbol) => {
          const currentHistory = historyMapRef.current[symbol] ?? Array.from({ length: 20 }, () => allPrices[symbol]);
          historyMapRef.current[symbol] = [...currentHistory.slice(-19), allPrices[symbol]];
        });

        setSandbox((prev) => {
          const activeModel = latestModel ?? model;
          const agentWithLatestModel =
            latestModel && prev.appliedFingerprint !== latestModel.sourceFingerprint
              ? applyModelToAi101(prev.agent, latestModel)
              : prev.agent;

          const shouldTrade = Boolean(activeModel && activeModel.closedTradesReviewed >= MIN_MODEL_SAMPLE_SIZE);

          const updatedAgent = shouldTrade
            ? {
                ...agentWithLatestModel,
                ...executeStrategy(agentWithLatestModel, allPrices, historyMapRef.current),
              }
            : {
                ...agentWithLatestModel,
                status: 'IDLE' as Agent['status'],
              };

          return {
            ...prev,
            savedAt: Date.now(),
            prices: allPrices,
            appliedFingerprint: latestModel?.sourceFingerprint ?? prev.appliedFingerprint,
            agent: updatedAgent,
          };
        });
      } catch (error) {
        console.warn('ai101 sandbox tick failed', error);
      }
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, [sandbox.appliedFingerprint, model]);

  const review = useMemo(() => buildReview(sandbox.agent, lang), [sandbox.agent, lang]);
  const openPositions = useMemo(() => Object.values(sandbox.agent.activePositions ?? {}), [sandbox.agent.activePositions]);
  const latestEntryTrades = useMemo(
    () =>
      sandbox.agent.trades
        .filter((trade) => trade.action === 'ENTRY')
        .slice(0, 6),
    [sandbox.agent.trades]
  );

  const resetSandbox = () => {
    const latestModel = readLearningModel();
    setModel(latestModel);
    setSandbox(buildInitialState(latestModel, seedPrices));
  };

  if (!model) {
    return (
      <main className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-50 shadow-[0_0_30px_rgba(16,185,129,0.08)]">
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
        </section>
        <section className="rounded-2xl border border-white/5 bg-[#111] p-8 text-sm text-white/50">{t.waiting}</section>
      </main>
    );
  }

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
            onClick={resetSandbox}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/80 transition-colors hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            {t.reset}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                <Bot className="h-3.5 w-3.5" />
                AI#101
              </div>
              <p className="text-lg font-bold text-white">{sandbox.agent.strategyType}</p>
              <p className="text-xs text-white/40">{t.transferReady}</p>
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

          <div className="mt-3 grid grid-cols-2 gap-3">
            <SmallStat label={t.learningRounds} value={Number(sandbox.agent.strategyParams?.learnRevision ?? 0)} />
            <SmallStat label={t.transferStatus} value={t.transferReady} />
          </div>

          <section className="mt-5 rounded-xl border border-sky-500/15 bg-sky-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-sky-300">
              <BrainCircuit className="h-4 w-4" />
              {t.strategy}
            </div>
            <p className="text-sm leading-relaxed text-white/75">{sandbox.agent.strategy}</p>
          </section>
        </article>

        <article className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
            <Send className="h-4 w-4 text-emerald-300" />
            {t.transferTitle}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SmallStat label={t.sourceAgents} value={model.sourceAgentNames.length} />
            <SmallStat label={t.sourceTrades} value={model.closedTradesReviewed} />
            <SmallStat label={t.winRate} value={`${model.winRate.toFixed(1)}%`} />
            <SmallStat label={t.avgPnl} value={`${model.avgPnl >= 0 ? '+' : ''}$${model.avgPnl.toFixed(2)}`} />
          </div>
          <div className="mt-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4">
            <p className="text-sm font-bold text-white">{model.strategyTitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{model.unifiedStrategy}</p>
          </div>
          <div className="mt-4 space-y-2">
            {model.reviewNotes.map((item) => (
              <div key={item} className="rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-sm text-white/75">
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
            <TrendingUp className="h-4 w-4 text-emerald-300" />
            {t.openPositionsTitle}
          </div>

          {openPositions.length > 0 ? (
            <div className="space-y-3">
              {openPositions.map((position) => {
                const marketPrice = sandbox.prices[position.symbol] ?? position.avgEntryPrice;
                const positionSize = getPositionSize(position);
                return (
                  <div key={position.symbol} className="rounded-xl border border-white/5 bg-black/30 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-white">{position.symbol}</p>
                          <span
                            className={cn(
                              'rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest',
                              position.side === 'SHORT'
                                ? 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                            )}
                          >
                            {position.side}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <SmallStat label={t.positionSize} value={`$${positionSize.toFixed(2)}`} />
                          <SmallStat label={t.leverage} value={`${position.leverage}x`} />
                          <SmallStat label={t.entryPrice} value={`$${position.avgEntryPrice.toLocaleString()}`} />
                          <SmallStat label={t.marketPrice} value={`$${marketPrice.toLocaleString()}`} />
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">{t.unrealized}</p>
                        <p className={cn('mt-2 text-lg font-mono font-bold', position.unrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {position.unrealizedPL >= 0 ? '+' : ''}${position.unrealizedPL.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-white/5 bg-black/30 p-6 text-sm text-white/45">{t.noOpenPositions}</div>
          )}
        </article>

        <article className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
            <BrainCircuit className="h-4 w-4 text-sky-300" />
            {t.entryLogicTitle}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-sky-500/10 bg-sky-500/5 p-4">
              <p className="text-sm font-bold text-white">{model.strategyTitle}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{model.unifiedStrategy}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SmallStat label={t.modelThreshold} value={model.params.threshold.toFixed(4)} />
              <SmallStat label={t.modelExit} value={model.params.exitThreshold.toFixed(4)} />
              <SmallStat label={t.modelRisk} value={`${(model.params.maxRiskPerTrade * 100).toFixed(1)}%`} />
              <SmallStat label={t.sampleGate} value={`${model.closedTradesReviewed}/${MIN_MODEL_SAMPLE_SIZE}`} />
              <SmallStat label={t.maxPositions} value={MAX_AI101_POSITIONS} />
              <SmallStat label={t.preferredSymbols} value={model.params.preferredSymbols.slice(0, 4).join(', ') || '-'} />
            </div>

            <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-3 py-2 text-sm text-white/75">
              {t.waitingForSample}
            </div>

            {model.entryFocus.map((item) => (
              <div key={item} className="rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-sm text-white/75">
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
          <History className="h-4 w-4 text-amber-300" />
          {t.entryReasonTitle}
        </div>

        {latestEntryTrades.length > 0 ? (
          <div className="space-y-3">
            {latestEntryTrades.map((trade) => (
              <div key={trade.id} className="rounded-xl border border-white/5 bg-black/30 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest',
                        trade.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      )}
                    >
                      {trade.symbol} {trade.type} {trade.leverage ? `${trade.leverage}x` : ''}
                    </span>
                    <span className="text-xs font-mono text-white/60">${trade.price.toLocaleString()}</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/30">{new Date(trade.timestamp).toLocaleString()}</span>
                </div>

                <div className="mt-3 flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                  <p className="text-sm leading-relaxed text-white/75">{trade.reason}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-black/30 p-6 text-sm text-white/45">{t.noEntryReasons}</div>
        )}
      </section>

      <section className="rounded-2xl border border-white/5 bg-[#111] p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
          <ShieldAlert className="h-4 w-4 text-amber-300" />
          {t.reviewTitle}
        </div>
        <p className="text-sm leading-relaxed text-white/80">{review.summary}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-300">{t.strengths}</p>
            <div className="space-y-2">
              {review.strengths.map((item) => (
                <div key={item} className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-sm text-white/75">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-rose-300">{t.risks}</p>
            <div className="space-y-2">
              {review.risks.map((item) => (
                <div key={item} className="rounded-lg border border-rose-500/10 bg-rose-500/5 px-3 py-2 text-sm text-white/75">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
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
