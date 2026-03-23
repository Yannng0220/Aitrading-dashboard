import React, { useMemo, useState } from 'react';
import { Shield, Sliders, Save, Trash2, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';

type SimSettings = {
  tickIntervalMs: number;
  maxSymbolsScan: number;
  enableShort: boolean;
  hideDebugConsole: boolean;
};

const STORAGE_KEY = 'appSettings:v1';

export default function Settings() {
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<SimSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {
          tickIntervalMs: 5000,
          maxSymbolsScan: 15,
          enableShort: true,
          hideDebugConsole: true,
        };
      }
      const parsed = JSON.parse(raw);
      return {
        tickIntervalMs: Number(parsed.tickIntervalMs) || 5000,
        maxSymbolsScan: Number(parsed.maxSymbolsScan) || 15,
        enableShort: parsed.enableShort !== false,
        hideDebugConsole: parsed.hideDebugConsole !== false,
      };
    } catch {
      return {
        tickIntervalMs: 5000,
        maxSymbolsScan: 15,
        enableShort: true,
        hideDebugConsole: true,
      };
    }
  });

  const help = useMemo(() => {
    return [
      '真正的「隱私」＝核心策略邏輯放到後端跑，前端只拿結果。',
      '關閉 sourcemap / 加強壓縮，只能讓逆向更難，不能保證看不到。',
      'API Key 絕對不要放前端 bundle。',
    ];
  }, []);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0]">
      <div className="max-w-[1000px] mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-emerald-500" /> 設定
            </h1>
            <p className="text-xs text-white/40 mt-1">把功能分開後，這頁專注在模擬參數與隱私/部署提醒。</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2",
                "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15 text-emerald-400"
              )}
            >
              <Save className="w-4 h-4" /> {saved ? '已儲存' : '儲存'}
            </button>
            <button
              onClick={reset}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2",
                "bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/15 text-rose-300"
              )}
            >
              <Trash2 className="w-4 h-4" /> 重置
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#111] border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/60 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" /> 隱私提醒
            </h2>
            <ul className="text-xs text-white/50 space-y-2 list-disc pl-4">
              {help.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <EyeOff className="w-4 h-4 text-white/20" />
              目前此頁只做設定保存；若你要我把核心策略搬到後端，我可以再做一個 `/api/simulateTick`。
            </div>
          </div>

          <div className="bg-[#111] border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">模擬參數</h2>
            <div className="space-y-3">
              <label className="block">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40 font-bold">
                  <span>Tick 間隔 (ms)</span>
                  <span className="font-mono text-white/60">{settings.tickIntervalMs}</span>
                </div>
                <input
                  type="range"
                  min={1000}
                  max={15000}
                  step={500}
                  value={settings.tickIntervalMs}
                  onChange={(e) => setSettings(s => ({ ...s, tickIntervalMs: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>

              <label className="block">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40 font-bold">
                  <span>每次掃描 Symbol 數</span>
                  <span className="font-mono text-white/60">{settings.maxSymbolsScan}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={settings.maxSymbolsScan}
                  onChange={(e) => setSettings(s => ({ ...s, maxSymbolsScan: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>

              <label className="flex items-center justify-between gap-3 bg-black/40 border border-white/5 rounded-xl p-3">
                <div>
                  <div className="text-xs font-bold text-white/70">允許做空</div>
                  <div className="text-[10px] text-white/30">目前邏輯已支援 SHORT；此開關供後續接到後端或策略限制。</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableShort}
                  onChange={(e) => setSettings(s => ({ ...s, enableShort: e.target.checked }))}
                />
              </label>

              <label className="flex items-center justify-between gap-3 bg-black/40 border border-white/5 rounded-xl p-3">
                <div>
                  <div className="text-xs font-bold text-white/70">隱藏除錯輸出</div>
                  <div className="text-[10px] text-white/30">建議 production drop console（我們已在 Vite build 設定）。</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.hideDebugConsole}
                  onChange={(e) => setSettings(s => ({ ...s, hideDebugConsole: e.target.checked }))}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

