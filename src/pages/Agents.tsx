import React, { useMemo, useState } from 'react';
import { Search, Download, Users } from 'lucide-react';
import { cn } from '../lib/utils';

type ExportRow = {
  id: number;
  name: string;
  strategyType: string;
  equity: number;
  performance: number;
  positions: number;
};

export default function Agents() {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<'performance' | 'equity' | 'positions'>('performance');

  // For now, pull last saved state from backend (same as Dashboard), but show it in a focused list.
  const [rows, setRows] = useState<ExportRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      const agents = Array.isArray(data) ? data : (Array.isArray(data?.agents) ? data.agents : null);
      if (!Array.isArray(agents)) {
        setRows([]);
        return;
      }
      const mapped: ExportRow[] = agents.map((a: any) => ({
        id: a.id,
        name: a.name,
        strategyType: a.strategyType,
        equity: a.equity,
        performance: a.performance,
        positions: a.activePositions ? Object.keys(a.activePositions).length : 0,
      }));
      setRows(mapped);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const base = (rows ?? []).filter(r => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.strategyType.toLowerCase().includes(q);
    });
    const sorted = base.slice().sort((a, b) => {
      if (sortKey === 'equity') return b.equity - a.equity;
      if (sortKey === 'positions') return b.positions - a.positions;
      return b.performance - a.performance;
    });
    return sorted;
  }, [rows, query, sortKey]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agents_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0]">
      <div className="max-w-[1200px] mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-500" /> 代理清單
            </h1>
            <p className="text-xs text-white/40 mt-1">把「代理艦隊」的資訊獨立成一頁，方便搜尋、排序與匯出。</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-bold border transition-colors",
                "bg-white/5 border-white/10 hover:bg-white/10"
              )}
              disabled={loading}
            >
              {loading ? '載入中…' : '從 API 載入'}
            </button>
            <button
              onClick={exportJson}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2",
                "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15 text-emerald-400"
              )}
              disabled={!rows || rows.length === 0}
            >
              <Download className="w-4 h-4" /> 匯出 JSON
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜尋代理名稱 / 策略類型…"
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as any)}
            className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-emerald-500/50"
          >
            <option value="performance">排序：績效</option>
            <option value="equity">排序：淨值</option>
            <option value="positions">排序：持倉數</option>
          </select>
        </div>

        <div className="bg-[#111] border border-white/5 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[10px] uppercase tracking-widest text-white/40 font-bold border-b border-white/5">
            <div className="col-span-4">代理</div>
            <div className="col-span-4">策略</div>
            <div className="col-span-2 text-right">淨值</div>
            <div className="col-span-1 text-right">持倉</div>
            <div className="col-span-1 text-right">績效</div>
          </div>
          <div className="divide-y divide-white/5">
            {(rows === null) && (
              <div className="p-6 text-xs text-white/30">點「從 API 載入」開始。</div>
            )}
            {(rows !== null && filtered.length === 0) && (
              <div className="p-6 text-xs text-white/30">沒有資料或沒有符合條件的結果。</div>
            )}
            {filtered.slice(0, 200).map(r => (
              <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-xs hover:bg-white/5">
                <div className="col-span-4 text-white/80 font-bold">{r.name}</div>
                <div className="col-span-4 text-white/40">{r.strategyType}</div>
                <div className="col-span-2 text-right font-mono text-white/70">${Number(r.equity).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className="col-span-1 text-right font-mono text-white/40">{r.positions}</div>
                <div className={cn(
                  "col-span-1 text-right font-mono font-bold",
                  r.performance >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {r.performance >= 0 ? '+' : ''}{Number(r.performance).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

