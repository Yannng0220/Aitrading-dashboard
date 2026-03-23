import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Users, 
  Wallet, 
  BarChart3, 
  Zap,
  Cpu,
  Clock,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  History,
  Info,
  AlertCircle,
  ShieldAlert,
  BrainCircuit,
  LayoutDashboard,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from './lib/utils';
import { Agent, MarketData, Trade, Position } from './types';
import { generateAgents, executeStrategy, fetchAllBybitTickers } from './simulation';
import Learning from './pages/Learning';
import LearningAgentDetail from './pages/LearningAgentDetail';

const AGENT_COUNT = 100;
const AGENTS_STORAGE_KEY = 'agentsState:v2';

type SavedAgentsState = {
  savedAt: number;
  agents: Agent[];
};

const parseSavedState = (raw: string | null): SavedAgentsState | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === AGENT_COUNT) {
      return { savedAt: 0, agents: parsed };
    }
    if (parsed && Array.isArray(parsed.agents) && parsed.agents.length === AGENT_COUNT) {
      return { savedAt: Number(parsed.savedAt) || 0, agents: parsed.agents };
    }
  } catch {
    return null;
  }
  return null;
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [isStarted, setIsStarted] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('startedAt');
      if (saved) {
        const parsed = Number(saved);
        if (!Number.isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch (error) {
      console.warn('localStorage read failed', error);
    }
    return Date.now();
  });
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  
  const pricesRef = useRef<Record<string, number>>({});
  const historyMapRef = useRef<Record<string, number[]>>({});

  // Initialize agents and market history
  useEffect(() => {
    let cancelled = false;

    const initMarket = async () => {
      const allPrices = await fetchAllBybitTickers();
      const symbols = Object.keys(allPrices);

      if (cancelled) return;
      
      pricesRef.current = allPrices;
      setPrices(allPrices);

      let resolvedAgents: Agent[] | null = null;

      // Prefer local browser state so refresh does not wipe active trades.
      const localState = parseSavedState(localStorage.getItem(AGENTS_STORAGE_KEY));
      if (localState) {
        resolvedAgents = localState.agents;
      }

      // Then try backend state as a cross-device/shared fallback.
      try {
        const response = await fetch("/api/agents");
        const savedAgents = await response.json();
        if (cancelled) return;
        const serverState: SavedAgentsState | null = Array.isArray(savedAgents)
          ? { savedAt: 0, agents: savedAgents }
          : (savedAgents && Array.isArray(savedAgents.agents) ? { savedAt: Number(savedAgents.savedAt) || 0, agents: savedAgents.agents } : null);

        if (serverState && serverState.agents.length === AGENT_COUNT) {
          if (!localState || serverState.savedAt > localState.savedAt) {
            resolvedAgents = serverState.agents;
          }
        } else if (!resolvedAgents) {
          // Initialize agents with random symbols from Bybit
          resolvedAgents = generateAgents(AGENT_COUNT, symbols);
        }
      } catch (error) {
        console.error("Failed to fetch agents state:", error);
        if (!resolvedAgents) {
          resolvedAgents = generateAgents(AGENT_COUNT, symbols);
        }
      }

      if (!resolvedAgents) {
        resolvedAgents = generateAgents(AGENT_COUNT, symbols);
      }

      // Initialize history for each symbol
      const newHistoryMap: Record<string, number[]> = {};
      symbols.forEach(s => {
        const basePrice = allPrices[s];
        newHistoryMap[s] = Array.from({ length: 20 }, () => basePrice + (Math.random() - 0.5) * (basePrice * 0.005));
      });
      historyMapRef.current = newHistoryMap;

      if (cancelled) return;
      setAgents(resolvedAgents);
      setIsHydrated(true);
    };

    initMarket();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist state quickly so a refresh does not reset the simulation.
  useEffect(() => {
    if (!isHydrated || agents.length !== AGENT_COUNT) return;

    const snapshot: SavedAgentsState = { savedAt: Date.now(), agents };
    try {
      localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('local agent state write failed', error);
    }

    const saveTimer = window.setTimeout(async () => {
      try {
        await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify(snapshot)
        });
      } catch (error) {
        console.error("Failed to save agents state:", error);
      }
    }, 1000);

    return () => window.clearTimeout(saveTimer);
  }, [agents, isHydrated]);

  // Simulation Loop
  useEffect(() => {
    if (!isHydrated || isPaused || !isStarted) return;

    const interval = setInterval(async () => {
      // 1. Update All Market Prices (Bybit API)
      const allPrices = await fetchAllBybitTickers();
      if (Object.keys(allPrices).length === 0) return;
      
      pricesRef.current = allPrices;
      setPrices(allPrices);

      // Update history for each symbol
      Object.keys(allPrices).forEach(s => {
        if (!historyMapRef.current[s]) historyMapRef.current[s] = [];
        const currentHistory = historyMapRef.current[s];
        historyMapRef.current[s] = [...currentHistory.slice(-19), allPrices[s]];
      });

      // 2. Update Agents
      setAgents(prevAgents => 
        prevAgents.map(agent => {
          const updates = executeStrategy(agent, allPrices, historyMapRef.current);
          return { ...agent, ...updates };
        })
      );
    }, 5000); // 5s interval as requested

    return () => clearInterval(interval);
  }, [isHydrated, isPaused, isStarted]);

  useEffect(() => {
    const formatDuration = (ms: number) => {
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
      const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
      const s = (totalSec % 60).toString().padStart(2, '0');
      return `${h}:${m}:${s}`;
    };

    const timer = setInterval(() => {
      setElapsedTime(formatDuration(Date.now() - startedAt));
    }, 1000);

    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    try {
      localStorage.setItem('startedAt', String(startedAt));
    } catch (error) {
      console.warn('localStorage write failed', error);
    }
  }, [startedAt]);

  const filteredAgents = useMemo(() => {
    return agents
      .filter(a => 
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        a.strategyType.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => b.performance - a.performance);
  }, [agents, searchTerm]);

  const topPerformers = agents.slice().sort((a, b) => b.performance - a.performance).slice(0, 5);
  const liquidatedAgents = agents.filter(a => a.equity <= 0).sort((a, b) => b.performance - a.performance);
  const totalEquity = agents.reduce((sum, a) => sum + a.equity, 0);
  const avgPerformance = agents.reduce((sum, a) => sum + a.performance, 0) / AGENT_COUNT;
  const learningAgentMatch = location.pathname.match(/^\/learning\/agent\/(\d+)$/);
  const learningAgentId = learningAgentMatch ? Number(learningAgentMatch[1]) : null;
  const currentPage = learningAgentId !== null
    ? 'learning-agent'
    : location.pathname === '/learning'
      ? 'learning'
      : 'dashboard';

  const selectedAgent = selectedAgentId !== null ? agents.find(a => a.id === selectedAgentId) : null;
  const selectedLearningAgent = learningAgentId !== null ? agents.find((agent) => agent.id === learningAgentId) ?? null : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-4 flex flex-col gap-4 sm:px-6 md:h-16 md:flex-row md:items-center md:justify-between md:py-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.4)]">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">Yang-RotBot Trading</h1>
          </div>

          <div className="flex w-full flex-wrap items-center justify-between gap-3 md:w-auto md:flex-nowrap md:gap-6">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 order-first w-full md:order-none md:w-auto">
              <button
                onClick={() => navigate('/')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors',
                  currentPage === 'dashboard'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-white/50 hover:text-white'
                )}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </button>
              <button
                onClick={() => navigate('/learning')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors',
                  currentPage === 'learning' || currentPage === 'learning-agent'
                    ? 'bg-sky-500/10 text-sky-300'
                    : 'text-white/50 hover:text-white'
                )}
              >
                <BrainCircuit className="h-3.5 w-3.5" />
                Learning
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-500 text-[10px] font-bold tracking-widest uppercase">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Live Market Engine
            </div>

            {/* AI Selector Dropdown */}
            <div className="relative hidden md:block">
              <button 
                onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all text-sm font-medium"
              >
                <Cpu className="w-4 h-4 text-emerald-500" />
                {selectedAgent ? selectedAgent.name : "選擇 AI 代理"}
                <ChevronDown className={cn("w-4 h-4 transition-transform", isSelectorOpen && "rotate-180")} />
              </button>
              
              <AnimatePresence>
                {isSelectorOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 w-64 max-h-96 overflow-y-auto bg-[#111] border border-white/10 rounded-xl shadow-2xl z-[60] p-2 custom-scrollbar"
                  >
                    <div className="sticky top-0 bg-[#111] pb-2 mb-2 border-b border-white/5">
                      <input 
                        type="text" 
                        placeholder="搜索代理..." 
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    {filteredAgents.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => {
                          setSelectedAgentId(agent.id);
                          setIsSelectorOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between",
                          selectedAgentId === agent.id ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-white/5 text-white/60"
                        )}
                      >
                        <span>{agent.name}</span>
                        <span className="text-[10px] font-mono opacity-50">{agent.performance.toFixed(1)}%</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">市場狀態</span>
              <span className="font-mono text-lg font-medium text-emerald-400">
                多資產
              </span>
            </div>
            
            <button 
              onClick={() => setIsPaused(!isPaused)}
              className="p-2 hover:bg-white/5 rounded-full transition-colors group"
            >
              {isPaused ? <RefreshCw className="w-5 h-5 text-emerald-500 animate-pulse" /> : <Activity className="w-5 h-5 text-white/60 group-hover:text-white" />}
            </button>
          </div>
        </div>
      </header>

      {currentPage === 'learning' ? (
        <Learning agents={agents} onOpenAgent={(agentId) => navigate(`/learning/agent/${agentId}`)} />
      ) : currentPage === 'learning-agent' ? (
        <LearningAgentDetail agent={selectedLearningAgent} onBack={() => navigate('/learning')} />
      ) : (
      <main className="max-w-[1600px] mx-auto p-4 grid grid-cols-12 gap-4 sm:p-6 sm:gap-6">
        <div className="col-span-12 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.08)] sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-amber-400/15 p-2 text-amber-300">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold tracking-wide text-amber-200">風險與免責聲明</p>
              <p className="text-sm leading-relaxed text-amber-50/90">
                本網站內容、模擬數據、代理策略、績效展示與任何訊號，均不構成投資建議、交易建議、財務建議或任何獲利保證，僅供產品展示、研究模擬與娛樂用途。
              </p>
              <p className="text-xs leading-relaxed text-amber-100/70">
                請勿將本頁資訊視為真實下單依據；任何投資決策與風險，應由使用者自行判斷並自行承擔。
              </p>
            </div>
          </div>
        </div>
        
        {/* Left Column: Market Overview */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard 
              label="活躍代理" 
              value={AGENT_COUNT} 
              icon={<Users className="w-4 h-4" />} 
              trend="+0"
            />
            <StatCard 
              label="總資產管理規模" 
              value={`$${(totalEquity / 1000000).toFixed(2)}M`} 
              icon={<Wallet className="w-4 h-4" />} 
              trend={`${avgPerformance > 0 ? '+' : ''}${avgPerformance.toFixed(2)}%`}
              trendUp={avgPerformance > 0}
            />
            <StatCard 
              label="網絡負載" 
              value="1.2ms" 
              icon={<Cpu className="w-4 h-4" />} 
              trend="最佳"
            />
            <StatCard 
              label="運行時間" 
              value={elapsedTime} 
              icon={<Clock className="w-4 h-4" />} 
              trend="實時"
            />
          </div>

          {/* Market Ticker Wall (Optional, but useful to see prices) */}
          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/60 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Bybit 多資產數據流
              </h2>
              <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">實時報價</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 max-h-[180px] sm:max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(prices).slice(0, 20).map(([symbol, price]) => (
                <div key={symbol} className="bg-black/40 border border-white/5 rounded-lg p-2 flex flex-col items-center">
                  <span className="text-[9px] font-bold text-white/40">{symbol}</span>
                  <span className="text-xs font-mono text-emerald-400">
                    ${(price as number) > 1 ? (price as number).toLocaleString() : (price as number).toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent Grid */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">代理艦隊狀態</h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                  type="text" 
                  placeholder="按名稱或策略過濾..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredAgents.slice(0, 12).map((agent) => (
                  <motion.div
                    key={agent.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={cn(
                      "group relative bg-[#111] border border-white/5 rounded-xl p-4 cursor-pointer transition-all hover:border-emerald-500/30 hover:bg-[#151515]",
                      selectedAgentId === agent.id && "border-emerald-500 ring-1 ring-emerald-500/50"
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-2 h-2 rounded-full animate-pulse" 
                          style={{ backgroundColor: agent.color }}
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{agent.name}</h3>
                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-white/60 border border-white/5">
                              {Object.keys(agent.activePositions).length} 持倉
                            </span>
                            {(Object.values(agent.activePositions) as Position[]).some((pos) => pos.side === 'LONG') && (
                              <span className="px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                                LONG
                              </span>
                            )}
                            {(Object.values(agent.activePositions) as Position[]).some((pos) => pos.side === 'SHORT') && (
                              <span className="px-1.5 py-0.5 rounded border border-rose-500/20 bg-rose-500/10 text-[9px] font-bold uppercase tracking-widest text-rose-400">
                                SHORT
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-white/40 font-mono uppercase tracking-tighter">{agent.strategyType}</p>
                        </div>
                      </div>
                      <div className={cn(
                        "text-xs font-mono font-bold",
                        agent.performance >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {agent.performance >= 0 ? '+' : ''}{agent.performance.toFixed(2)}%
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-black/40 rounded-lg p-2 border border-white/5">
                        <p className="text-[8px] uppercase text-white/30 font-bold mb-1">淨值</p>
                        <p className="text-xs font-mono">${agent.equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                      </div>
                      <div className="bg-black/40 rounded-lg p-2 border border-white/5">
                        <p className="text-[8px] uppercase text-white/30 font-bold mb-1">浮動盈虧</p>
                        <p className={cn(
                          "text-xs font-mono font-bold",
                          agent.unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {agent.unrealizedPL >= 0 ? '+' : ''}${agent.unrealizedPL.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Mini Sparkline Placeholder */}
                    <div className="h-8 w-full flex items-end gap-0.5 opacity-30 group-hover:opacity-60 transition-opacity">
                      {Array.from({ length: 15 }).map((_, i) => (
                        <div 
                          key={i} 
                          className="flex-1 bg-emerald-500 rounded-t-[1px]" 
                          style={{ height: `${20 + Math.random() * 80}%` }}
                        />
                      ))}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            {filteredAgents.length > 12 && (
              <div className="text-center py-4">
                <p className="text-xs text-white/20 font-mono">顯示符合條件的 {filteredAgents.length} 個代理中的 12 個</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Leaderboard & Details */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          
          {/* Top Performers */}
          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-6 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> 績效排行榜
            </h2>
            <div className="space-y-4">
              {topPerformers.map((agent, idx) => (
                <div key={agent.id} className="flex flex-col items-start justify-between gap-2 group cursor-pointer sm:flex-row sm:items-center" onClick={() => setSelectedAgentId(agent.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-white/20 w-4">{idx + 1}</span>
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold border border-white/10 group-hover:border-emerald-500/50 transition-colors">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">{agent.name}</p>
                      <p className="text-[10px] text-white/40">{agent.strategyType}</p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-mono font-bold text-emerald-400">+{agent.performance.toFixed(2)}%</p>
                    <p className="text-[10px] text-white/20">${(agent.equity / 1000).toFixed(1)}k</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Liquidated Agents */}
          {liquidatedAgents.length > 0 && (
            <div className="bg-[#111] border border-rose-500/20 rounded-2xl p-4 sm:p-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-rose-500/60 mb-6 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" /> 已爆倉代理人 ({liquidatedAgents.length})
              </h2>
              <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {liquidatedAgents.map((agent) => (
                  <div key={agent.id} className="flex flex-col items-start justify-between gap-2 group cursor-pointer sm:flex-row sm:items-center" onClick={() => setSelectedAgentId(agent.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-rose-500/5 flex items-center justify-center text-xs font-bold border border-rose-500/10 group-hover:border-rose-500/50 transition-colors">
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white/60 group-hover:text-rose-400 transition-colors">{agent.name}</p>
                        <p className="text-[10px] text-white/20">{agent.strategyType}</p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-mono font-bold text-rose-500">-100%</p>
                      <p className="text-[10px] text-white/10">$0.0</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected Agent Details */}
          <AnimatePresence mode="wait">
            {selectedAgent ? (
              <motion.div 
                key={selectedAgent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-[#111] border border-emerald-500/30 rounded-2xl p-4 shadow-[0_0_50px_rgba(16,185,129,0.1)] sm:p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                    <Cpu className="w-4 h-4" /> 代理智能
                  </h2>
                  <button onClick={() => setSelectedAgentId(null)} className="text-white/20 hover:text-white transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full" style={{ backgroundColor: selectedAgent.color }} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white leading-tight">{selectedAgent.name}</h3>
                      <p className="text-xs text-white/40 font-mono italic">{selectedAgent.strategy}</p>
                    </div>
                  </div>

                  <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase text-white/30 font-bold">活躍持倉</p>
                      <p className="text-[10px] uppercase text-white/30 font-bold">浮動盈虧: 
                        <span className={cn(
                          "ml-2 font-mono",
                          selectedAgent.unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {selectedAgent.unrealizedPL >= 0 ? '+' : ''}${selectedAgent.unrealizedPL.toFixed(2)}
                        </span>
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      {Object.values(selectedAgent.activePositions).length > 0 ? (
                        Object.values(selectedAgent.activePositions).map((pos: Position) => (
                          <div key={pos.symbol} className="flex flex-col gap-3 bg-white/5 rounded-lg p-2 border border-white/5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-bold text-white">{pos.symbol}</p>
                                <span className={cn(
                                  "px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border",
                                  pos.side === 'SHORT'
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                )}>
                                  {pos.side === 'SHORT' ? 'SHORT' : 'LONG'}
                                </span>
                                <span className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] font-bold uppercase tracking-widest">
                                  {pos.leverage}x 槓桿
                                </span>
                              </div>
                              <p className="text-[10px] text-white/40">
                                {pos.amount.toFixed(4)} 單位 @ ${pos.avgEntryPrice.toLocaleString()}
                              </p>
                              <p className="text-[9px] text-white/20 uppercase font-bold mt-1">
                                實際價值: ${(pos.amount * pos.avgEntryPrice / pos.leverage).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD {pos.leverage}x
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-xs font-mono text-emerald-400">${(prices[pos.symbol] || 0).toLocaleString()}</p>
                              <p className={cn(
                                "text-[10px] font-mono",
                                pos.unrealizedPL >= 0 ? "text-emerald-400" : "text-rose-400"
                              )}>
                                {pos.unrealizedPL >= 0 ? '+' : ''}${pos.unrealizedPL.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center py-4 text-[10px] text-white/20 italic">無活躍持倉</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase text-white/30 font-bold flex items-center gap-2">
                        <History className="w-3 h-3" /> 策略信號日誌
                      </p>
                      <span className="text-[8px] text-white/20 uppercase">最近 20 個事件</span>
                    </div>
                    
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                      {selectedAgent.trades.length > 0 ? (
                        selectedAgent.trades.map(trade => (
                          <div key={trade.id} className="group/trade bg-black/40 rounded-xl p-3 border border-white/5 hover:border-white/10 transition-all">
                            <div className="flex flex-col items-start gap-2 mb-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn(
                                  "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                                  trade.type === 'BUY' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                )}>
                                  {trade.symbol} {trade.action} {trade.type} {trade.leverage && `${trade.leverage}x`}
                                </span>
                                <span className="text-xs font-mono text-white font-medium">${trade.price.toLocaleString()}</span>
                              </div>
                              <span className="text-[10px] font-mono text-white/20">{new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <Info className="w-3 h-3 text-emerald-500/40 mt-0.5 shrink-0" />
                              <p className="text-[11px] text-white/60 leading-relaxed italic">
                                {trade.reason}
                              </p>
                            </div>
                            <div className="mt-2 pt-2 border-t border-white/5 flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:justify-between sm:items-center">
                              <div className="flex gap-3">
                                <span className="text-[9px] text-white/30 uppercase font-bold">
                                  實際價值: {(trade.amount * trade.price / (trade.leverage || 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD {trade.leverage && `${trade.leverage}x`}
                                </span>
                                <span className="text-[9px] text-white/30 uppercase font-bold">手續費: ${trade.fee.toFixed(4)}</span>
                                {trade.realizedPL !== undefined && (
                                  <span className={cn(
                                    "text-[9px] uppercase font-bold",
                                    trade.realizedPL >= 0 ? "text-emerald-500" : "text-rose-500"
                                  )}>
                                    盈虧: ${trade.realizedPL.toFixed(4)}
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-white/10 uppercase font-bold">ID: {trade.id}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-12 space-y-3">
                          <Activity className="w-8 h-8 text-white/5 mx-auto" />
                          <p className="text-[10px] text-white/20 italic">等待第一個策略信號...</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[10px] uppercase text-white/30 font-bold">策略概況</p>
                      <span className="px-2 py-0.5 bg-white/5 rounded text-[9px] font-mono text-white/40">{selectedAgent.strategyType}</span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      該代理採用 <span className="text-emerald-500">{selectedAgent.strategyType}</span> 模型，
                      處理實時市場波動以執行交易。當前效率評分：
                      <span className="text-white ml-1">{(0.85 + Math.random() * 0.1).toFixed(2)}</span>
                    </p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="bg-[#111] border border-white/5 rounded-2xl p-8 text-center space-y-4 sm:p-12">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                  <Activity className="w-8 h-8 text-white/10" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">未選擇代理</h3>
                  <p className="text-xs text-white/20 mt-2">從艦隊中選擇一個代理，或使用上方的 AI 選擇器來分析特定的策略日誌。</p>
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* System Logs */}
          <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-4">系統日誌</h2>
            <div className="space-y-2 font-mono text-[10px]">
              <div className="flex gap-2 text-emerald-500/60">
                <span>[16:35:44]</span>
                <span>系統：所有 100 個代理已同步。</span>
              </div>
              <div className="flex gap-2 text-white/30">
                <span>[16:35:42]</span>
                <span>網絡：延遲穩定在 1.2ms。</span>
              </div>
              <div className="flex gap-2 text-white/30">
                <span>[16:35:40]</span>
                <span>市場：已通過 WebSocket 建立價格推送。</span>
              </div>
              <div className="flex gap-2 text-amber-500/60">
                <span>[16:35:38]</span>
                <span>警告：在第 7 區檢測到高波動。</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      )}

      {/* Footer */}
      <footer className="max-w-[1600px] mx-auto px-6 py-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-[10px] text-white/20 uppercase tracking-widest font-bold">© 2026 AI 交易矩陣 • 高頻模擬環境</p>
        <div className="flex gap-6">
          <a href="#" className="text-[10px] text-white/20 hover:text-white transition-colors uppercase tracking-widest font-bold">文檔</a>
          <a href="#" className="text-[10px] text-white/20 hover:text-white transition-colors uppercase tracking-widest font-bold">API 訪問</a>
          <a href="#" className="text-[10px] text-white/20 hover:text-white transition-colors uppercase tracking-widest font-bold">安全</a>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, icon, trend, trendUp }: { label: string, value: string | number, icon: React.ReactNode, trend: string, trendUp?: boolean }) {
  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 bg-white/5 rounded-lg text-white/40">
          {icon}
        </div>
        <div className={cn(
          "text-[10px] font-bold px-1.5 py-0.5 rounded",
          trendUp === true ? "bg-emerald-500/10 text-emerald-500" : 
          trendUp === false ? "bg-rose-500/10 text-rose-500" : 
          "bg-white/5 text-white/40"
        )}>
          {trend}
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">{label}</p>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
    </div>
  );
}
