import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Clock, Radar, Grid3x3, Target, Wrench, Sun, Sparkles } from 'lucide-react';

const NAV_TABS = [
  { id: '3d-radar', label: '3D RADAR', icon: Radar },
  { id: 'threat-matrix', label: 'THREAT MATRIX', icon: Grid3x3 },
  { id: 'b-plane', label: 'B-PLANE', icon: Target },
  { id: 'cam-solver', label: 'CAM SOLVER', icon: Wrench },
  { id: 'solar-wx', label: 'SOLAR WX', icon: Sun },
  { id: 'ai-copilot', label: 'AI COPILOT', icon: Sparkles },
];

export default function TopNav({ onOpenTrustView, activeTab = '3d-radar', onTabChange }) {
  const [time, setTime] = useState("");
  const [satCount, setSatCount] = useState(0);
  const [threatCount, setThreatCount] = useState(0);
  const [healthData, setHealthData] = useState(null);
  const [countdownStr, setCountdownStr] = useState("");

  const fetchHealthAndStats = () => {
    // Fetch live catalog stats
    fetch('/api/v1/globe-data')
      .then(r => r.json())
      .then(data => setSatCount(data.items?.length || 0))
      .catch(() => {});
    
    // Fetch active conjunction count
    fetch('/api/v1/conjunctions?page=1&size=1')
      .then(r => r.json())
      .then(data => setThreatCount(data.total || 0))
      .catch(() => {});

    // Fetch system health & refresh schedule
    fetch('/api/v1/health')
      .then(r => r.json())
      .then(data => {
        setHealthData(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchHealthAndStats();
    const statsInterval = setInterval(fetchHealthAndStats, 30000); // re-check every 30s
    return () => clearInterval(statsInterval);
  }, []);

  useEffect(() => {
    const updateTick = () => {
      const now = new Date();
      setTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' ZULU');

      if (healthData?.next_pipeline_run) {
        const nextTime = new Date(healthData.next_pipeline_run).getTime();
        const diffMs = nextTime - now.getTime();
        if (diffMs > 0) {
          const totalSec = Math.floor(diffMs / 1000);
          const hrs = Math.floor(totalSec / 3600);
          const mins = Math.floor((totalSec % 3600) / 60);
          const secs = totalSec % 60;
          setCountdownStr(`${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`);
        } else {
          setCountdownStr('REFRESHING NOW...');
        }
      }
    };

    updateTick();
    const interval = setInterval(updateTick, 1000);
    return () => clearInterval(interval);
  }, [healthData]);

  // Format last sync time string
  const formatLastSync = (isoStr) => {
    if (!isoStr) return 'SYNCING...';
    try {
      const d = new Date(isoStr);
      return d.toISOString().substring(11, 16) + ' UTC';
    } catch {
      return 'RECENT';
    }
  };

  return (
    <div className="w-full bg-[#060a14]/95 backdrop-blur-xl z-50 relative border-b border-white/5">
      {/* Single compact row */}
      <div className="flex items-center justify-between px-4 h-11">
        {/* Logo */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping opacity-30"></div>
          </div>
          <h1 className="text-white font-semibold tracking-wider uppercase text-sm">
            ORBITAL <span className="text-cyan-400 font-light">//</span> <span className="text-slate-400 font-light">DEFENSE OPS</span>
          </h1>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 mx-4">
          {NAV_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange?.(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(34,211,238,0.15)]'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon size={12} className={isActive ? 'text-cyan-400' : ''} />
                <span className="hidden xl:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right side: Clock + Sync + Status */}
        <div className="flex items-center space-x-3 shrink-0">
          {/* LAST DATA SYNC */}
          <div className="hidden md:flex items-center space-x-2 bg-white/[0.03] border border-white/10 px-2.5 py-0.5 rounded text-xs" title={`Full sync timestamp: ${healthData?.last_pipeline_run || 'N/A'}`}>
            <Clock size={11} className="text-slate-400" />
            <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">LAST SYNC</span>
            <span className="text-amber-300 font-mono text-[11px] font-bold">
              {formatLastSync(healthData?.last_pipeline_run)}
            </span>
          </div>

          {/* NEXT REFRESH CYCLE COUNTDOWN */}
          <div className="hidden lg:flex items-center space-x-2 bg-cyan-950/30 border border-cyan-500/20 px-2.5 py-0.5 rounded text-xs" title="Automated CelesTrak ephemeris & space weather screening cycle">
            <RefreshCw size={11} className="text-cyan-400 animate-[spin_8s_linear_infinite]" />
            <span className="text-cyan-400/80 font-mono text-[10px] uppercase tracking-wider">NEXT CYCLE</span>
            <span className="text-cyan-300 font-mono text-[11px] font-bold tracking-tight">
              {countdownStr || 'CALCULATING...'}
            </span>
          </div>

          <div className="text-amber-400/90 font-mono text-[11px] tracking-wider tabular-nums hidden sm:block">
            {time}
          </div>
          <button 
            onClick={onOpenTrustView}
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded-sm border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-emerald-400 group cursor-pointer"
          >
            <ShieldCheck size={12} className="group-hover:scale-110 transition-transform" />
            <span className="text-[10px] uppercase tracking-wider font-semibold">SYSTEM TRUST</span>
          </button>
          <div className="flex items-center space-x-1.5 border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 rounded-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-emerald-400 text-[10px] uppercase tracking-wider font-semibold">LIVE</span>
          </div>
        </div>
      </div>

      {/* Telemetry Stats Bar */}
      <div className="flex items-center px-4 h-7 bg-black/40 border-t border-white/[0.03] space-x-5">
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]"></div>
          <span className="text-slate-400 font-mono text-[10px] uppercase tracking-widest">TRACKING</span>
          <span className="text-cyan-300 font-mono text-sm font-bold tabular-nums">{satCount.toLocaleString()}</span>
        </div>
        <div className="w-px h-3 bg-white/10" />
        <div className="flex items-center space-x-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(255,0,85,0.8)] animate-pulse"></div>
          <span className="text-slate-400 font-mono text-[10px] uppercase tracking-widest">CONJUNCTIONS</span>
          <span className="text-red-400 font-mono text-sm font-bold tabular-nums">{threatCount}</span>
        </div>
        <div className="flex-1" />
        <span className="text-slate-600 font-mono text-[9px] uppercase tracking-widest hidden md:block">LEO · MEO · GEO FULL SPECTRUM</span>
      </div>

      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
    </div>
  );
}
