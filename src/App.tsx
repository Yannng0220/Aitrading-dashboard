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
  X,
  Home,
  Mail,
  ArrowRight,
  ShieldCheck,
  Globe2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from './lib/utils';
import { buildUnifiedLearningModel, clearLearningModel, type Language, writeLearningModel } from './lib/learningLab';
import { compareAgentsByDashboardRank, getDashboardRankedAgents } from './lib/ranking';
import { Agent, MarketData, Trade, Position } from './types';
import { applyAgentMigrations, enforceAutoCloseThresholds, generateAgents, executeStrategy, fetchAllBybitTickers } from './simulation';
import Learning from './pages/Learning';
import LearningAgentDetail from './pages/LearningAgentDetail';
import SelfLearningLab from './pages/SelfLearningLab';

const AGENT_COUNT = 100;
const AGENTS_STORAGE_KEY = 'agentsState:v2';
const DEVICE_ID_STORAGE_KEY = 'agentsDeviceId:v1';
const UI_LANG_STORAGE_KEY = 'uiLang:v1';
const VISIT_SESSION_STORAGE_KEY = 'siteVisitSession:v1';

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
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [deviceId] = useState(() => {
    try {
      const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (existing) return existing;
      const next = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
      return next;
    } catch {
      return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [isStarted, setIsStarted] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [engineMode, setEngineMode] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(UI_LANG_STORAGE_KEY);
      return saved === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });
  const [visitCount, setVisitCount] = useState<number | null>(null);
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
  const latestSavedAtRef = useRef(0);

  const applySavedAgents = (nextAgents: Agent[], savedAt: number) => {
    latestSavedAtRef.current = savedAt;
    setAgents(
      applyAgentMigrations(nextAgents, Object.keys(pricesRef.current)).map((agent) => {
        const forcedClose = enforceAutoCloseThresholds(agent, pricesRef.current);
        return forcedClose ? { ...agent, ...forcedClose } : agent;
      })
    );
  };

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
      let resolvedSavedAt = 0;

      // Prefer local browser state so refresh does not wipe active trades.
      const localState = parseSavedState(localStorage.getItem(AGENTS_STORAGE_KEY));
      if (localState) {
        resolvedAgents = localState.agents;
        resolvedSavedAt = localState.savedAt;
      }

      // Then try backend state as a cross-device/shared fallback.
      try {
        const response = await fetch("/api/agents");
        const savedAgents = await response.json();
        if (cancelled) return;
        const serverEngineMode = Boolean(savedAgents?.engineMode);
        setEngineMode(serverEngineMode);
        const serverState: SavedAgentsState | null = Array.isArray(savedAgents)
          ? { savedAt: 0, agents: savedAgents }
          : (savedAgents && Array.isArray(savedAgents.agents) ? { savedAt: Number(savedAgents.savedAt) || 0, agents: savedAgents.agents } : null);

        if (serverState && serverState.agents.length === AGENT_COUNT) {
          if (!localState || serverState.savedAt > localState.savedAt) {
            resolvedAgents = serverState.agents;
            resolvedSavedAt = serverState.savedAt;
          }
          if (savedAgents && typeof savedAgents.startedAt === 'number' && savedAgents.startedAt > 0) {
            setStartedAt(savedAgents.startedAt);
          }
          if (savedAgents && savedAgents.prices && typeof savedAgents.prices === 'object') {
            pricesRef.current = savedAgents.prices;
            setPrices(savedAgents.prices);
          }
        } else if (!resolvedAgents) {
          // Initialize agents with random symbols from Bybit
          resolvedAgents = generateAgents(AGENT_COUNT, symbols);
          resolvedSavedAt = Date.now();
        }
      } catch (error) {
        console.error("Failed to fetch agents state:", error);
        if (!resolvedAgents) {
          resolvedAgents = generateAgents(AGENT_COUNT, symbols);
          resolvedSavedAt = Date.now();
        }
      }

      if (!resolvedAgents) {
        resolvedAgents = generateAgents(AGENT_COUNT, symbols);
        resolvedSavedAt = Date.now();
      }

      // Initialize history for each symbol
      const newHistoryMap: Record<string, number[]> = {};
      symbols.forEach(s => {
        const basePrice = allPrices[s];
        newHistoryMap[s] = Array.from({ length: 20 }, () => basePrice + (Math.random() - 0.5) * (basePrice * 0.005));
      });
      historyMapRef.current = newHistoryMap;

      if (cancelled) return;
      applySavedAgents(resolvedAgents, resolvedSavedAt);
      setIsHydrated(true);
    };

    initMarket();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist state quickly so a refresh does not reset the simulation.
  useEffect(() => {
    if (engineMode) return;
    if (!isHydrated || agents.length !== AGENT_COUNT) return;

    const savedAt = isLeader ? Date.now() : (latestSavedAtRef.current || Date.now());
    latestSavedAtRef.current = savedAt;
    const snapshot: SavedAgentsState = { savedAt, agents };
    try {
      localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('local agent state write failed', error);
    }

    if (!isLeader) {
      return;
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
  }, [agents, isHydrated, isLeader, engineMode]);

  useEffect(() => {
    if (engineMode || !isHydrated) {
      setIsLeader(false);
      return;
    }

    let cancelled = false;

    const heartbeat = async () => {
      try {
        const response = await fetch("/api/leader", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holderId: deviceId }),
        });
        const data = await response.json();
        if (!cancelled) {
          setIsLeader(Boolean(data?.leader));
        }
      } catch (error) {
        console.error("Failed to update leader lock:", error);
        if (!cancelled) {
          setIsLeader(false);
        }
      }
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [deviceId, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    let cancelled = false;

    const syncFromServer = async () => {
      try {
        const response = await fetch("/api/agents");
        const savedAgents = await response.json();
        if (cancelled) return;
        if (typeof savedAgents?.engineMode === 'boolean') {
          setEngineMode(savedAgents.engineMode);
        }
        const serverState: SavedAgentsState | null = Array.isArray(savedAgents)
          ? { savedAt: 0, agents: savedAgents }
          : (savedAgents && Array.isArray(savedAgents.agents) ? { savedAt: Number(savedAgents.savedAt) || 0, agents: savedAgents.agents } : null);

        if (serverState && serverState.agents.length === AGENT_COUNT && serverState.savedAt > latestSavedAtRef.current) {
          applySavedAgents(serverState.agents, serverState.savedAt);
        }
        if (savedAgents && typeof savedAgents.startedAt === 'number' && savedAgents.startedAt > 0) {
          setStartedAt(savedAgents.startedAt);
        }
        if (savedAgents && savedAgents.prices && typeof savedAgents.prices === 'object') {
          pricesRef.current = savedAgents.prices;
          setPrices(savedAgents.prices);
        }
      } catch (error) {
        console.error("Failed to sync agents state:", error);
      }
    };

    if (engineMode || !isLeader) {
      syncFromServer();
    }

    const interval = window.setInterval(() => {
      if (engineMode || !isLeader) {
        syncFromServer();
      }
    }, 6000);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && (engineMode || !isLeader)) {
        syncFromServer();
      }
    };

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isHydrated, isLeader, engineMode]);

  // Simulation Loop
  useEffect(() => {
    if (engineMode) return;
    if (!isHydrated || isPaused || !isStarted || !isLeader) return;

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
        applyAgentMigrations(prevAgents, Object.keys(allPrices)).map(agent => {
          const updates = executeStrategy(agent, allPrices, historyMapRef.current);
          return { ...agent, ...updates };
        })
      );
    }, 5000); // 5s interval as requested

    return () => clearInterval(interval);
  }, [isHydrated, isPaused, isStarted, isLeader, engineMode]);

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

  useEffect(() => {
    try {
      localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
    } catch (error) {
      console.warn('localStorage write failed', error);
    }
  }, [lang]);

  useEffect(() => {
    let cancelled = false;

    const syncVisitCount = async () => {
      let sessionId = '';

      try {
        const existing = sessionStorage.getItem(VISIT_SESSION_STORAGE_KEY);
        if (existing) {
          sessionId = existing;
        } else {
          sessionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          sessionStorage.setItem(VISIT_SESSION_STORAGE_KEY, sessionId);
        }
      } catch {
        sessionId = `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }

      try {
        const response = await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const data = await response.json();
        if (!cancelled) {
          setVisitCount(Number(data?.count) || 0);
        }
      } catch (error) {
        console.error('Failed to sync visit count:', error);
        try {
          const response = await fetch('/api/visits');
          const data = await response.json();
          if (!cancelled) {
            setVisitCount(Number(data?.count) || 0);
          }
        } catch (fallbackError) {
          console.error('Failed to load visit count:', fallbackError);
        }
      }
    };

    syncVisitCount();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || agents.length !== AGENT_COUNT) return;
    const learningModel = buildUnifiedLearningModel(agents, lang);
    if (learningModel.closedTradesReviewed > 0) {
      writeLearningModel(learningModel);
    } else {
      clearLearningModel();
    }
  }, [agents, isHydrated, lang]);

  const filteredAgents = useMemo(() => {
    const keyword = searchTerm.toLowerCase();

    return agents
      .filter((agent) => agent && typeof agent.id === 'number')
      .filter((agent) => {
        const name = typeof agent.name === 'string' ? agent.name : `AI#${agent.id}`;
        const strategyType = typeof agent.strategyType === 'string' ? agent.strategyType : '';
        return name.toLowerCase().includes(keyword) || strategyType.toLowerCase().includes(keyword);
      })
      .sort(compareAgentsByDashboardRank);
  }, [agents, searchTerm]);

  const totalEquity = agents.reduce((sum, a) => sum + a.equity, 0);
  const avgPerformance = agents.reduce((sum, a) => sum + a.performance, 0) / AGENT_COUNT;
  const learningAgentMatch = location.pathname.match(/^\/learning\/agent\/(\d+)$/);
  const learningAgentId = learningAgentMatch ? Number(learningAgentMatch[1]) : null;
  const currentPage = learningAgentId !== null
    ? 'learning-agent'
    : location.pathname === '/self-learning-lab'
      ? 'self-learning-lab'
    : location.pathname === '/dashboard'
      ? 'dashboard'
    : location.pathname === '/about'
      ? 'about'
      : location.pathname === '/privacy'
        ? 'privacy'
    : location.pathname === '/learning'
      ? 'learning'
      : 'home';

  const selectedAgent = selectedAgentId !== null ? agents.find(a => a.id === selectedAgentId) : null;
  const selectedLearningAgent = learningAgentId !== null ? agents.find((agent) => agent.id === learningAgentId) ?? null : null;

  useEffect(() => {
    if (currentPage !== 'dashboard') {
      setSelectedAgentId(null);
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== 'dashboard' || !selectedAgent) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [currentPage, selectedAgent]);

  const ui = lang === 'zh'
    ? {
        navHome: '首頁',
        navDashboard: '儀表板',
        navLearning: '學習頁',
        navSelfLearningLab: 'AI 自學實驗室',
        navSelfLearningLabMobile: '自學實驗室',
        liveEngine: '即時市場引擎',
        selectorPlaceholder: '選擇 AI',
        selectorSearch: '搜尋名稱或策略...',
        marketStatusLabel: '市場狀態',
        marketStatusValue: '多資產',
        footerAbout: '關於',
        footerContact: '聯絡我們',
        footerPrivacy: '隱私',
        footerDashboard: '儀表板',
        footerVisits: '訪問次數',
        footerCopyright: '© 2026 Yang-RotBot Trading 模擬交易環境',
        contactHref: 'mailto:contact@yangzilla.dpdns.org',
        homeHeroEyebrow: '模擬交易品牌首頁',
        homeHeroTitle: '建立可解釋、可觀察、可持續進化的 AI 交易實驗室',
        homeHeroBody: 'Yang-RotBot Trading 專注於多代理交易模擬、風險控制、學習模型整合與策略可視化，讓你先看懂系統，再進入主儀表板觀察實際運作。',
        homeHeroPrimary: '進入主儀表板',
        homeHeroSecondary: '聯絡我們',
        homeStatsTitle: '我們正在做什麼',
        homeStats: [
          { label: '模擬代理', value: '100', note: '主儀表板獨立運作' },
          { label: '自學沙盒', value: 'AI#101', note: '與主資料完全分離' },
          { label: '風險來源', value: 'Polyglobe', note: '整合外部地緣風險' },
        ],
        homeSectionAbout: '關於我們',
        homeSectionAboutBody: '我們把交易系統拆成可理解的模組，從進場、平倉、持倉、樣本學習到外部風險濾網，讓每一個判斷都能被看見、被檢查、被優化。',
        homeSectionProject: '我們的專案',
        homeSectionProjectBody: '主儀表板負責展示 100 個 AI 的模擬行情反應，學習頁整合高排名模型，自學實驗室則讓 AI#101 在獨立沙盒中驗證新策略，不回寫主數據。',
        homeSectionContact: '聯絡我們',
        homeSectionContactBody: '如果你想合作、客製首頁文案、接入更多市場來源，或調整廣告與品牌頁資訊，可以直接透過 Email 聯絡站點維護者。',
        homeSectionTrust: '使用說明',
        homeSectionTrustBody: '首頁用來介紹產品與聯絡資訊；主儀表板顯示的是模擬交易資料，不是投資建議，也不會直接替你執行真實下單。',
        aboutTitle: '關於 Yang-RotBot Trading',
        aboutDescription: 'Yang-RotBot Trading 是一個以瀏覽器為基礎的交易模擬儀表板，用來展示多代理策略行為、介面設計，以及教育用途的市場分析。',
        aboutSections: [
          {
            heading: '網站用途',
            body: '本站展示模擬代理、資產變化、策略日誌與學習建議，讓訪客可以在可控環境中理解交易規則如何隨時間運作。',
          },
          {
            heading: '資訊性質',
            body: '本站顯示的所有資料、績效結果與策略洞察都屬於模擬內容，不構成投資建議、交易建議，也不保證真實世界的金融結果。',
          },
          {
            heading: '內容說明',
            body: '此頁面用來清楚說明產品定位、模擬範圍與教育目的，讓訪客不只看到即時介面，也能理解網站提供的內容。',
          },
        ],
        privacyTitle: '隱私政策',
        privacyDescription: '本站可能會儲存有限的瀏覽器資料，並處理呈現儀表板、維持同步與提供伺服器功能所需的請求。',
        privacySections: [
          {
            heading: '瀏覽器儲存',
            body: '網站可能會在瀏覽器中保存裝置識別、介面狀態與模擬快照，讓頁面重新整理後能正確恢復並維持跨工作階段連續性。',
          },
          {
            heading: 'Cloudflare 處理',
            body: '本站請求可能由 Cloudflare Pages、Workers、Durable Objects、KV 與相關記錄服務處理，以支援路由、同步、可靠性與效能。',
          },
          {
            heading: '廣告與第三方服務',
            body: '如果啟用廣告或分析服務，相關供應商可能會依其自身政策處理資料。站主應額外揭露任何啟用中的第三方服務。',
          },
        ],
      }
    : {
        navHome: 'Home',
        navDashboard: 'Dashboard',
        navLearning: 'Learning',
        navSelfLearningLab: 'AI Lab',
        navSelfLearningLabMobile: 'AI Lab',
        liveEngine: 'Live Market Engine',
        selectorPlaceholder: 'Select AI',
        selectorSearch: 'Search by name or strategy...',
        marketStatusLabel: 'Market Status',
        marketStatusValue: 'Multi-Asset',
        footerAbout: 'About',
        footerContact: 'Contact',
        footerPrivacy: 'Privacy',
        footerDashboard: 'Dashboard',
        footerVisits: 'Visits',
        footerCopyright: '© 2026 Yang-RotBot Trading Simulation Trading Environment',
        contactHref: 'mailto:contact@yangzilla.dpdns.org',
        homeHeroEyebrow: 'AI Trading Brand Home',
        homeHeroTitle: 'Build an explainable, observable, and continuously improving AI trading lab',
        homeHeroBody: 'Yang-RotBot Trading focuses on multi-agent trading simulation, risk control, model learning, and strategy visualization so visitors can understand the system before entering the main dashboard.',
        homeHeroPrimary: 'Open Dashboard',
        homeHeroSecondary: 'Contact Us',
        homeStatsTitle: 'What We Run',
        homeStats: [
          { label: 'Sim Agents', value: '100', note: 'Main dashboard state' },
          { label: 'Sandbox AI', value: 'AI#101', note: 'Fully isolated lab' },
          { label: 'Risk Feed', value: 'Polyglobe', note: 'External geopolitical filter' },
        ],
        homeSectionAbout: 'About Us',
        homeSectionAboutBody: 'We break trading systems into understandable modules so entries, exits, positions, sample learning, and external risk filters can all be inspected and improved.',
        homeSectionProject: 'Our Project',
        homeSectionProjectBody: 'The main dashboard shows how 100 agents react to simulated markets, the learning page blends top-ranked models, and the self-learning lab lets AI#101 validate new strategy behavior without writing back to main data.',
        homeSectionContact: 'Contact Us',
        homeSectionContactBody: 'If you want to collaborate, customize the landing page, connect more market sources, or update brand and advertising information, contact the site owner by email.',
        homeSectionTrust: 'How To Use',
        homeSectionTrustBody: 'This landing page introduces the product and contact details first. The main dashboard contains simulated trading data only and does not execute real orders.',
        aboutTitle: 'About Yang-RotBot Trading',
        aboutDescription: 'Yang-RotBot Trading is a browser-based trading simulation dashboard built to demonstrate multi-agent strategy behavior, interface design, and educational market analysis.',
        aboutSections: [
          {
            heading: 'Purpose of the site',
            body: 'This website presents simulated agents, portfolio changes, strategy logs, and learning suggestions so visitors can understand how trading rules behave over time in a controlled environment.',
          },
          {
            heading: 'Nature of the information',
            body: 'All data, performance results, and strategy insights shown on this site are part of a simulation. They do not constitute investment advice, trading advice, or any guarantee of real-world financial results.',
          },
          {
            heading: 'Publisher content',
            body: 'This page exists to clearly explain the product, the simulation scope, and the educational purpose of the dashboard so that visitors can understand what the site is about beyond the live interface.',
          },
        ],
        privacyTitle: 'Privacy Policy',
        privacyDescription: 'This website may store limited browser data and process operational requests needed to render the dashboard, maintain synchronization, and deliver server-side features.',
        privacySections: [
          {
            heading: 'Browser storage',
            body: 'The site may store local identifiers, interface state, and simulation snapshots in browser storage so pages can recover correctly after refresh and maintain cross-session continuity.',
          },
          {
            heading: 'Cloudflare processing',
            body: 'Requests may be handled by Cloudflare Pages, Workers, Durable Objects, KV, and related logging services for routing, synchronization, reliability, and performance.',
          },
          {
            heading: 'Advertising and third parties',
            body: 'If advertising or analytics services are enabled, those providers may apply their own policies and data handling practices. The site owner should disclose any active third-party services accordingly.',
          },
        ],
      };
  const locale = lang === 'en' ? 'en-US' : 'zh-TW';
  const display = lang === 'zh'
    ? {
        simulationBannerTitle: '模擬環境提示',
        simulationBannerBody: '這個介面只顯示交易模擬與策略觀察，不會連接真實券商帳戶，也不會替你執行真實下單。',
        simulationBannerNote: '這裡顯示的績效、持倉與建議都屬於教育用途的模擬輸出，不代表投資承諾或獲利保證。',
        statsAgents: 'AI 代理數',
        statsEquity: '總資產',
        statsLatency: '系統延遲',
        statsUptime: '運行時間',
        statsLatencyTrend: '穩定',
        statsUptimeTrend: '運行中',
        tickerTitle: 'Bybit 市場報價',
        tickerLive: '即時',
        agentsPanelTitle: 'AI 代理列表',
        agentsSearchPlaceholder: '搜尋代理名稱或策略...',
        positionsCount: '持倉',
        positionLong: '多單',
        positionShort: '空單',
        equityLabel: '權益',
        unrealizedPnlLabel: '浮動盈虧',
        showingAgents: (count: number) => `目前顯示前 12 / 共 ${count} 個 AI`,
        agentDetailTitle: '代理詳情',
        openPositions: '目前持倉',
        currentUnrealized: '當前浮動盈虧',
        leverageLabel: '槓桿',
        quantityLabel: '數量',
        marginLabel: '保證金',
        openDetailCta: '點擊查看詳情',
        noOpenPositions: '目前沒有持倉。',
        recentTrades: '最近交易紀錄',
        recentTradesLimit: '最近 20 筆',
        feeLabel: '手續費',
        realizedPnlLabel: '已實現盈虧',
        noTrades: '目前還沒有交易紀錄。',
        strategyOverview: '策略概況',
        strategyConfidenceText: '目前策略類型為',
        strategyConfidenceSuffix: '，模擬信心分數為',
        systemLogs: '系統更新',
        systemLogsBody: '這裡只顯示介面與 AI#101 沙盒功能更新，不會修改任何儀表板數據資料。',
        logs: [
          '儀表板 AI 卡片已可直接點擊開啟詳情，手機版也已完成點擊適配。',
          'AI#101 現在只會在前十名來源策略出現平倉資料後才接收最新模型。',
          'AI#101 已加入樣本門檻、最多 5 筆持倉，以及實際艙位大小顯示。',
          '以上調整只影響介面與 AI#101 沙盒，不會動到主儀表板數據。',
        ],
      }
    : {
        simulationBannerTitle: 'Simulation Environment Notice',
        simulationBannerBody: 'This interface shows trading simulations and strategy observations only. It does not connect to a live brokerage account or execute real orders on your behalf.',
        simulationBannerNote: 'Treat the performance, positions, and recommendations shown here as educational simulation output, not as an investment promise or profit guarantee.',
        statsAgents: 'AI Agents',
        statsEquity: 'Total Equity',
        statsLatency: 'System Latency',
        statsUptime: 'Uptime',
        statsLatencyTrend: 'Stable',
        statsUptimeTrend: 'Running',
        tickerTitle: 'Bybit Market Prices',
        tickerLive: 'Live',
        agentsPanelTitle: 'AI Agent List',
        agentsSearchPlaceholder: 'Search agents or strategies...',
        positionsCount: 'Positions',
        positionLong: 'Long',
        positionShort: 'Short',
        equityLabel: 'Equity',
        unrealizedPnlLabel: 'Unrealized PnL',
        showingAgents: (count: number) => `Showing top 12 of ${count} agents`,
        agentDetailTitle: 'Agent Detail',
        openPositions: 'Open Positions',
        currentUnrealized: 'Current Unrealized PnL',
        leverageLabel: 'Leverage',
        quantityLabel: 'Quantity',
        marginLabel: 'Margin',
        openDetailCta: 'Tap for detail',
        noOpenPositions: 'No open positions right now.',
        recentTrades: 'Recent Trade History',
        recentTradesLimit: 'Last 20',
        feeLabel: 'Fee',
        realizedPnlLabel: 'Realized PnL',
        noTrades: 'No trades have been recorded yet.',
        strategyOverview: 'Strategy Overview',
        strategyConfidenceText: 'Current strategy type:',
        strategyConfidenceSuffix: 'with a simulated confidence score of',
        systemLogs: 'System Updates',
        systemLogsBody: 'This area shows interface and AI#101 sandbox updates only. It does not modify any dashboard data.',
        logs: [
          'Dashboard agent cards now open detail directly, including mobile-friendly tapping.',
          'AI#101 now receives new models only after the top-ten source strategies produce closed trades.',
          'AI#101 now enforces a sample gate, a five-position cap, and real position-size display.',
          'These changes affect UI and the AI#101 sandbox only, not the main dashboard dataset.',
        ],
      };
  const sideLabel = (side: Position['side']) => (side === 'SHORT' ? display.positionShort : display.positionLong);
  const tradeActionLabel = (action: Trade['action']) => (lang === 'zh' ? (action === 'ENTRY' ? '進場' : '平倉') : action);
  const tradeTypeLabel = (type: Trade['type']) => (lang === 'zh' ? (type === 'BUY' ? '買入' : '賣出') : type);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-4 flex flex-col gap-4 sm:px-6 md:h-16 md:flex-row md:items-center md:justify-between md:py-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.4)]">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl md:text-2xl">Yang-RotBot Trading</h1>
          </div>

          <div className="flex w-full flex-wrap items-center justify-between gap-3 md:w-auto md:flex-nowrap md:gap-6">
            <div className="order-first grid w-full grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 sm:grid-cols-4 md:order-none md:flex md:w-auto md:items-center md:gap-2 md:rounded-full">
              <button
                onClick={() => navigate('/')}
                className={cn(
                  'inline-flex min-w-0 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide transition-colors sm:text-[10px] sm:tracking-widest md:px-3 md:text-[12px]',
                  currentPage === 'home'
                    ? 'bg-sky-500/10 text-sky-300'
                    : 'text-white/50 hover:text-white'
                )}
              >
                <Home className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                <span className="truncate">{ui.navHome}</span>
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className={cn(
                  'inline-flex min-w-0 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide transition-colors sm:text-[10px] sm:tracking-widest md:px-3 md:text-[12px]',
                  currentPage === 'dashboard'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-white/50 hover:text-white'
                )}
              >
                <LayoutDashboard className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                <span className="truncate">{ui.navDashboard}</span>
              </button>
              <button
                onClick={() => navigate('/learning')}
                className={cn(
                  'inline-flex min-w-0 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide transition-colors sm:text-[10px] sm:tracking-widest md:px-3 md:text-[12px]',
                  currentPage === 'learning' || currentPage === 'learning-agent'
                    ? 'bg-sky-500/10 text-sky-300'
                    : 'text-white/50 hover:text-white'
                )}
              >
                <BrainCircuit className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                <span className="truncate">{ui.navLearning}</span>
              </button>
              <button
                onClick={() => navigate('/self-learning-lab')}
                className={cn(
                  'inline-flex min-w-0 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide transition-colors sm:text-[10px] sm:tracking-widest md:px-3 md:text-[12px]',
                  currentPage === 'self-learning-lab'
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'text-white/50 hover:text-white'
                )}
              >
                <BrainCircuit className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                <span className="truncate sm:hidden">{ui.navSelfLearningLabMobile}</span>
                <span className="hidden truncate sm:inline">{ui.navSelfLearningLab}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500 md:text-[12px]">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              {ui.liveEngine}
            </div>

            {/* AI Selector Dropdown */}
            <div className="relative hidden md:block">
              <button 
                onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium transition-all hover:bg-white/10 md:text-base"
              >
                <Cpu className="w-4 h-4 text-emerald-500" />
                {selectedAgent ? selectedAgent.name : ui.selectorPlaceholder}
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
                        placeholder={ui.selectorSearch} 
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
                          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors md:text-sm",
                          selectedAgentId === agent.id ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-white/5 text-white/60"
                        )}
                      >
                        <span>{agent.name}</span>
                        <span className="font-mono text-[10px] opacity-50 md:text-[12px]">{agent.performance.toFixed(1)}%</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1">
              {(['zh', 'en'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setLang(option)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors md:text-[12px]',
                    lang === option ? 'bg-sky-500/15 text-sky-300' : 'text-white/45 hover:text-white'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 md:text-[12px]">{ui.marketStatusLabel}</span>
              <span className="font-mono text-lg font-medium text-emerald-400 md:text-2xl">{ui.marketStatusValue}</span>
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

      {currentPage === 'home' ? (
        <LandingPage
          lang={lang}
          ui={ui}
          visitCount={visitCount}
          locale={locale}
          onOpenDashboard={() => navigate('/dashboard')}
        />
      ) : currentPage === 'learning' ? (
        <Learning agents={agents} onOpenAgent={(agentId) => navigate(`/learning/agent/${agentId}`)} lang={lang} />
      ) : currentPage === 'learning-agent' ? (
        <LearningAgentDetail agent={selectedLearningAgent} onBack={() => navigate('/learning')} lang={lang} />
      ) : currentPage === 'self-learning-lab' ? (
        <SelfLearningLab seedPrices={prices} lang={lang} />
      ) : currentPage === 'about' ? (
        <StaticPage
          title={ui.aboutTitle}
          description={ui.aboutDescription}
          sections={ui.aboutSections}
        />
      ) : currentPage === 'privacy' ? (
        <StaticPage
          title={ui.privacyTitle}
          description={ui.privacyDescription}
          sections={ui.privacySections}
        />
      ) : (
      <main className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6">
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.08)] sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-amber-400/15 p-2 text-amber-300">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold tracking-wide text-amber-200">{display.simulationBannerTitle}</p>
              <p className="text-sm leading-relaxed text-amber-50/90">{display.simulationBannerBody}</p>
              <p className="text-xs leading-relaxed text-amber-100/70">{display.simulationBannerNote}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatCard label={display.statsAgents} value={AGENT_COUNT} icon={<Users className="w-4 h-4" />} trend="+0" />
            <StatCard
              label={display.statsEquity}
              value={`$${(totalEquity / 1000000).toFixed(2)}M`}
              icon={<Wallet className="w-4 h-4" />}
              trend={`${avgPerformance > 0 ? '+' : ''}${avgPerformance.toFixed(2)}%`}
              trendUp={avgPerformance > 0}
            />
            <StatCard label={display.statsLatency} value="1.2ms" icon={<Cpu className="w-4 h-4" />} trend={display.statsLatencyTrend} />
            <StatCard label={display.statsUptime} value={elapsedTime} icon={<Clock className="w-4 h-4" />} trend={display.statsUptimeTrend} />
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
                <Activity className="w-4 h-4" /> {display.tickerTitle}
              </h2>
              <span className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-500">{display.tickerLive}</span>
            </div>
            <div className="grid max-h-[180px] grid-cols-2 gap-2 overflow-y-auto pr-2 custom-scrollbar sm:max-h-[120px] sm:gap-3 md:grid-cols-5">
              {Object.entries(prices).slice(0, 20).map(([symbol, price]) => (
                <div key={symbol} className="flex flex-col items-center rounded-lg border border-white/5 bg-black/40 p-2">
                  <span className="text-[9px] font-bold text-white/40">{symbol}</span>
                  <span className="text-xs font-mono text-emerald-400">
                    ${(price as number) > 1 ? (price as number).toLocaleString(locale) : (price as number).toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#111] p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
                <History className="w-4 h-4 text-emerald-400" /> {display.systemLogs}
              </h2>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-white/35">{display.systemLogsBody}</p>
            <div className="space-y-2 font-mono text-[10px]">
              <div className="flex gap-2 text-emerald-500/70">
                <span>[Update]</span>
                <span>{display.logs[0]}</span>
              </div>
              <div className="flex gap-2 text-white/45">
                <span>[Update]</span>
                <span>{display.logs[1]}</span>
              </div>
              <div className="flex gap-2 text-white/45">
                <span>[Update]</span>
                <span>{display.logs[2]}</span>
              </div>
              <div className="flex gap-2 text-amber-400/70">
                <span>[Safe]</span>
                <span>{display.logs[3]}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">{display.agentsPanelTitle}</h2>
              <div className="relative w-full sm:w-72 lg:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/20" />
                <input
                  type="text"
                  placeholder={display.agentsSearchPlaceholder}
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm transition-colors focus:border-emerald-500/50 focus:outline-none md:text-base"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {filteredAgents.slice(0, 12).map((agent) => (
                  <motion.button
                    key={agent.id}
                    type="button"
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={cn(
                      'group relative w-full cursor-pointer rounded-xl border border-white/5 bg-[#111] p-4 text-left transition-all hover:border-emerald-500/30 hover:bg-[#151515] active:scale-[0.99]',
                      selectedAgentId === agent.id && 'border-emerald-500 ring-1 ring-emerald-500/50'
                    )}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: agent.color }} />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-white transition-colors group-hover:text-emerald-400 md:text-lg">{agent.name}</h3>
                            <span className="rounded border border-white/5 bg-white/5 px-1.5 py-0.5 text-[9px] font-mono text-white/60">
                              {Object.keys(agent.activePositions).length} {display.positionsCount}
                            </span>
                            {(Object.values(agent.activePositions) as Position[]).some((pos) => pos.side === 'LONG') && (
                              <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                                {display.positionLong}
                              </span>
                            )}
                            {(Object.values(agent.activePositions) as Position[]).some((pos) => pos.side === 'SHORT') && (
                              <span className="rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-rose-400">
                                {display.positionShort}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] font-mono uppercase tracking-tighter text-white/40 md:text-[12px]">{agent.strategyType}</p>
                        </div>
                      </div>
                      <div className={cn('text-xs font-mono font-bold md:text-base', agent.performance >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {agent.performance >= 0 ? '+' : ''}{agent.performance.toFixed(2)}%
                      </div>
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-white/5 bg-black/40 p-2">
                        <p className="mb-1 text-[8px] font-bold uppercase text-white/30">{display.equityLabel}</p>
                        <p className="text-xs font-mono md:text-base">${agent.equity.toLocaleString(locale, { maximumFractionDigits: 0 })}</p>
                      </div>
                      <div className="rounded-lg border border-white/5 bg-black/40 p-2">
                        <p className="mb-1 text-[8px] font-bold uppercase text-white/30">{display.unrealizedPnlLabel}</p>
                        <p className={cn('text-xs font-mono font-bold md:text-base', agent.unrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {agent.unrealizedPL >= 0 ? '+' : ''}${agent.unrealizedPL.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="flex h-8 w-full items-end gap-0.5 opacity-30 transition-opacity group-hover:opacity-60">
                      {Array.from({ length: 15 }).map((_, i) => (
                        <div key={i} className="flex-1 rounded-t-[1px] bg-emerald-500" style={{ height: `${20 + Math.random() * 80}%` }} />
                      ))}
                    </div>
                    <div className="mt-3 inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                      {display.openDetailCta}
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>

            {filteredAgents.length > 12 && (
              <div className="py-4 text-center">
                <p className="text-xs font-mono text-white/20">{display.showingAgents(filteredAgents.length)}</p>
              </div>
            )}
          </div>
        </div>

      </main>
      )}

      <AnimatePresence>
        {currentPage === 'dashboard' && selectedAgent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-start"
            onClick={() => setSelectedAgentId(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.18 }}
              className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-emerald-500/30 bg-[#111] p-4 shadow-[0_0_60px_rgba(16,185,129,0.16)] sm:mt-10 sm:max-h-[calc(100vh-5rem)] sm:w-[min(1100px,calc(100vw-2rem))] sm:rounded-2xl sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex justify-center sm:hidden">
                <div className="h-1.5 w-14 rounded-full bg-white/15" />
              </div>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-500">
                  <Cpu className="w-4 h-4" /> {display.agentDetailTitle}
                </h2>
                <button
                  onClick={() => setSelectedAgentId(null)}
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-white/40 transition-colors hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                    <div className="h-6 w-6 rounded-full" style={{ backgroundColor: selectedAgent.color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold leading-tight text-white">{selectedAgent.name}</h3>
                    <p className="text-xs font-mono italic text-white/40">{selectedAgent.strategy}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <QuickDetailStat label={display.equityLabel} value={`$${selectedAgent.equity.toLocaleString(locale, { maximumFractionDigits: 0 })}`} />
                  <QuickDetailStat
                    label={display.unrealizedPnlLabel}
                    value={`${selectedAgent.unrealizedPL >= 0 ? '+' : ''}$${selectedAgent.unrealizedPL.toFixed(2)}`}
                    tone={selectedAgent.unrealizedPL >= 0 ? 'emerald' : 'rose'}
                  />
                  <QuickDetailStat label={display.positionsCount} value={Object.keys(selectedAgent.activePositions).length} />
                  <QuickDetailStat
                    label={display.recentTrades}
                    value={selectedAgent.trades.length}
                  />
                </div>

                <div className="space-y-4 rounded-xl border border-white/5 bg-black/40 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase text-white/30">{display.openPositions}</p>
                    <p className="text-[10px] font-bold uppercase text-white/30">
                      {display.currentUnrealized}:
                      <span className={cn('ml-2 font-mono', selectedAgent.unrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {selectedAgent.unrealizedPL >= 0 ? '+' : ''}${selectedAgent.unrealizedPL.toFixed(2)}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    {Object.values(selectedAgent.activePositions).length > 0 ? (
                      Object.values(selectedAgent.activePositions).map((pos: Position) => (
                        <div key={pos.symbol} className="flex flex-col gap-3 rounded-lg border border-white/5 bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-bold text-white">{pos.symbol}</p>
                              <span className={cn(
                                'rounded border px-1 py-0.5 text-[8px] font-bold uppercase tracking-widest',
                                pos.side === 'SHORT'
                                  ? 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                              )}>
                                {sideLabel(pos.side)}
                              </span>
                              <span className="rounded bg-emerald-500/10 px-1 py-0.5 text-[8px] font-bold uppercase tracking-widest text-emerald-500">
                                {pos.leverage}x {display.leverageLabel}
                              </span>
                            </div>
                            <p className="text-[10px] text-white/40">{display.quantityLabel} {pos.amount.toFixed(4)} @ ${pos.avgEntryPrice.toLocaleString(locale)}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-xs font-mono text-emerald-400">${(prices[pos.symbol] || 0).toLocaleString(locale)}</p>
                            <p className={cn('text-[10px] font-mono', pos.unrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                              {pos.unrealizedPL >= 0 ? '+' : ''}${pos.unrealizedPL.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="py-4 text-center text-[10px] italic text-white/20">{display.noOpenPositions}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/30">
                      <History className="w-3 h-3" /> {display.recentTrades}
                    </p>
                    <span className="text-[8px] uppercase text-white/20">{display.recentTradesLimit}</span>
                  </div>

                  <div className="max-h-[360px] space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                    {selectedAgent.trades.length > 0 ? (
                      selectedAgent.trades.slice(0, 20).map((trade) => (
                        <div key={trade.id} className="rounded-xl border border-white/5 bg-black/40 p-3">
                          <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn(
                                'rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                                trade.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              )}>
                                {trade.symbol} {tradeActionLabel(trade.action)} {tradeTypeLabel(trade.type)} {trade.leverage && `${trade.leverage}x`}
                              </span>
                              <span className="text-xs font-mono font-medium text-white">${trade.price.toLocaleString(locale)}</span>
                            </div>
                            <span className="text-[10px] font-mono text-white/20">
                              {new Date(trade.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <Info className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500/40" />
                            <p className="text-[11px] italic leading-relaxed text-white/60">{trade.reason}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-3 py-12 text-center">
                        <Activity className="mx-auto h-8 w-8 text-white/5" />
                        <p className="text-[10px] italic text-white/20">{display.noTrades}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-[1600px] mx-auto px-6 py-8 border-t border-white/5 flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex flex-col items-center gap-2 md:items-start">
          <p className="text-[10px] text-white/20 uppercase tracking-widest font-bold">{ui.footerCopyright}</p>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/45">
            <span>{ui.footerVisits}</span>
            <span className="font-mono text-emerald-400">{visitCount === null ? '--' : visitCount.toLocaleString(locale)}</span>
          </div>
        </div>
        <div className="flex gap-6">
          <button onClick={() => navigate('/about')} className="text-[10px] text-white/20 hover:text-white transition-colors uppercase tracking-widest font-bold">{ui.footerAbout}</button>
          <button onClick={() => navigate('/privacy')} className="text-[10px] text-white/20 hover:text-white transition-colors uppercase tracking-widest font-bold">{ui.footerPrivacy}</button>
          <a href={ui.contactHref} className="text-[10px] text-white/20 hover:text-white transition-colors uppercase tracking-widest font-bold">{ui.footerContact}</a>
          <button onClick={() => navigate('/dashboard')} className="text-[10px] text-white/20 hover:text-white transition-colors uppercase tracking-widest font-bold">{ui.footerDashboard}</button>
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
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/40 md:text-[12px]">{label}</p>
      <p className="text-2xl font-bold tracking-tight text-white md:text-4xl">{value}</p>
    </div>
  );
}

function QuickDetailStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'emerald' | 'rose';
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</p>
      <p
        className={cn(
          'mt-2 text-lg font-mono font-bold',
          tone === 'emerald' ? 'text-emerald-400' : tone === 'rose' ? 'text-rose-400' : 'text-white'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function LandingPage({
  lang,
  ui,
  visitCount,
  locale,
  onOpenDashboard,
}: {
  lang: Language;
  ui: any;
  visitCount: number | null;
  locale: string;
  onOpenDashboard: () => void;
}) {
  return (
    <main className="mx-auto max-w-[1600px] space-y-8 p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_24%),linear-gradient(135deg,#04110d_0%,#09151f_45%,#050505_100%)] px-6 py-8 shadow-[0_0_60px_rgba(16,185,129,0.08)] sm:px-8 sm:py-10 lg:px-12 lg:py-14">
        <div className="absolute inset-y-0 right-[-8%] hidden w-[42%] rounded-full bg-emerald-400/10 blur-3xl lg:block" />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-300">
              <Globe2 className="h-4 w-4" />
              {ui.homeHeroEyebrow}
            </div>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-black leading-[0.95] text-white sm:text-5xl lg:text-7xl">
                {ui.homeHeroTitle}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-white/72 sm:text-base lg:text-lg">
                {ui.homeHeroBody}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onOpenDashboard}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-black transition-transform hover:scale-[1.01]"
              >
                {ui.homeHeroPrimary}
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href={ui.contactHref}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-white/20 hover:text-white"
              >
                <Mail className="h-4 w-4" />
                {ui.homeHeroSecondary}
              </a>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {ui.homeStats.map((item: { label: string; value: string; note: string }) => (
              <div key={item.label} className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40">{item.label}</p>
                <p className="mt-3 text-3xl font-black text-white sm:text-4xl">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-white/55">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <LandingInfoCard icon={<BrainCircuit className="h-5 w-5" />} title={ui.homeSectionAbout} body={ui.homeSectionAboutBody} />
        <LandingInfoCard icon={<LayoutDashboard className="h-5 w-5" />} title={ui.homeSectionProject} body={ui.homeSectionProjectBody} />
        <LandingInfoCard icon={<Mail className="h-5 w-5" />} title={ui.homeSectionContact} body={ui.homeSectionContactBody} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[28px] border border-white/10 bg-[#111] p-6 shadow-2xl sm:p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            {ui.homeSectionTrust}
          </div>
          <p className="text-sm leading-7 text-white/72 sm:text-base">{ui.homeSectionTrustBody}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={onOpenDashboard}
              className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300 transition-colors hover:bg-emerald-500/15"
            >
              {ui.footerDashboard}
            </button>
            <button
              onClick={() => window.location.assign('/about')}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-white/72 transition-colors hover:text-white"
            >
              {ui.footerAbout}
            </button>
            <button
              onClick={() => window.location.assign('/privacy')}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-white/72 transition-colors hover:text-white"
            >
              {ui.footerPrivacy}
            </button>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#121212_0%,#0a0a0a_100%)] p-6 shadow-2xl sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40">{ui.footerVisits}</p>
          <p className="mt-3 font-mono text-5xl font-black text-emerald-400">
            {visitCount === null ? '--' : visitCount.toLocaleString(locale)}
          </p>
          <p className="mt-3 text-sm leading-7 text-white/55">
            {lang === 'zh'
              ? '這個首頁會先介紹品牌資訊、聯絡方式與產品定位，接著再帶你進入主儀表板。'
              : 'This home page introduces the brand, contact details, and product context before taking visitors into the main dashboard.'}
          </p>
        </div>
      </section>
    </main>
  );
}

function LandingInfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#111] p-6 shadow-2xl sm:p-7">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-emerald-300">
        {icon}
      </div>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-white/65">{body}</p>
    </section>
  );
}

function StaticPage({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: Array<{ heading: string; body: string }>;
}) {
  return (
    <main className="max-w-[1100px] mx-auto p-4 space-y-6 sm:p-6">
      <section className="rounded-2xl border border-white/5 bg-[#111] p-6 shadow-2xl sm:p-8">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-white/70 sm:text-base">{description}</p>
      </section>

      {sections.map((section) => (
        <section key={section.heading} className="rounded-2xl border border-white/5 bg-[#111] p-6 shadow-2xl sm:p-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-400">{section.heading}</h2>
          <p className="mt-4 text-sm leading-7 text-white/70 sm:text-base">{section.body}</p>
        </section>
      ))}
    </main>
  );
}

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

class AppErrorBoundary extends React.Component<any, AppErrorBoundaryState> {
  declare props: AppErrorBoundaryProps;
  declare state: AppErrorBoundaryState;

  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('App render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#0a0a0a] px-4 py-10 text-[#e0e0e0] sm:px-6">
          <section className="mx-auto max-w-[900px] rounded-2xl border border-rose-500/20 bg-[#111] p-6 shadow-2xl">
            <p className="text-sm font-bold uppercase tracking-widest text-rose-400">Rendering Recovery</p>
            <h1 className="mt-3 text-2xl font-bold text-white">The page hit a runtime error.</h1>
            <p className="mt-3 text-sm leading-7 text-white/70">
              Please refresh once. If the page still fails, the app will keep this fallback visible instead of showing a blank screen.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
