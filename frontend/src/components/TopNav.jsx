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
    if (!isoStr) return 'AWAITING DATA';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'AWAITING DATA';
      // Show date + time for clarity
      const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
      const day = d.getUTCDate().toString().padStart(2, '0');
      const hours = d.getUTCHours().toString().padStart(2, '0');
      const mins = d.getUTCMinutes().toString().padStart(2, '0');
      return `${month}-${day} ${hours}:${mins} UTC`;
    } catch {
      return 'AWAITING DATA';
    }
  };

  return (
    <div className="w-full bg-[#060a14]/95 backdrop-blur-xl z-50 relative border-b border-white/10 shadow-lg shadow-black/50">
      {/* Primary Navigation Row */}
      <div className="flex items-center justify-between px-5 h-13">
        {/* Logo */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]"></div>
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-cyan-400 animate-ping opacity-40"></div>
          </div>
          <h1 className="text-white font-bold tracking-wider uppercase text-base">
            ORBITAL <span className="text-cyan-400 font-light">//</span> <span className="text-slate-300 font-light">DEFENSE OPS</span>
          </h1>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1.5 mx-4">
          {NAV_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange?.(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/10 border border-transparent'
                }`}
              >
                <Icon size={15} className={isActive ? 'text-cyan-300' : 'text-slate-400'} />
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right side: Clock + Sync + Status */}
        <div className="flex items-center space-x-3.5 shrink-0">
          {/* LAST DATA SYNC */}
          <div className="hidden md:flex items-center space-x-2 bg-white/[0.05] border border-white/15 px-3 py-1 rounded-md text-xs" title={`Full sync timestamp: ${healthData?.last_pipeline_run || 'N/A'}`}>
            <Clock size={13} className="text-slate-400" />
            <span className="text-slate-400 font-mono text-xs uppercase tracking-wider font-semibold">LAST SYNC</span>
            <span className="text-amber-300 font-mono text-xs font-bold">
              {formatLastSync(healthData?.last_pipeline_run)}
            </span>
          </div>

          {/* NEXT REFRESH CYCLE COUNTDOWN */}
          <div className="hidden lg:flex items-center space-x-2 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1 rounded-md text-xs" title="Automated CelesTrak ephemeris & space weather screening cycle">
            <RefreshCw size={13} className="text-cyan-400 animate-[spin_8s_linear_infinite]" />
            <span className="text-cyan-400/90 font-mono text-xs uppercase tracking-wider font-semibold">NEXT CYCLE</span>
            <span className="text-cyan-300 font-mono text-xs font-bold tracking-tight">
              {countdownStr || 'CALCULATING...'}
            </span>
          </div>

          <div className="text-amber-300 font-mono text-xs tracking-wider tabular-nums font-bold hidden sm:block bg-black/40 px-2.5 py-1 rounded border border-white/10">
            {time}
          </div>

          <button 
            onClick={onOpenTrustView}
            className="flex items-center space-x-1.5 px-3 py-1 rounded border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/30 transition-colors text-emerald-300 group cursor-pointer text-xs font-bold uppercase tracking-wider"
          >
            <ShieldCheck size={14} className="group-hover:scale-110 transition-transform text-emerald-400" />
            <span>SYSTEM TRUST</span>
          </button>

          <div className="flex items-center space-x-1.5 border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider text-emerald-300">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span>LIVE</span>
          </div>
        </div>
      </div>

      {/* Telemetry Stats Bar */}
      <div className="flex items-center px-5 h-8 bg-black/50 border-t border-white/[0.06] space-x-6">
        <div className="flex items-center space-x-2.5">
          <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]"></div>
          <span className="text-slate-300 font-mono text-xs uppercase tracking-widest font-semibold">TRACKING:</span>
          <span className="text-cyan-300 font-mono text-sm font-bold tabular-nums">{satCount.toLocaleString()}</span>
        </div>
        <div className="w-px h-3.5 bg-white/20" />
        <div className="flex items-center space-x-2.5">
          <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(255,0,85,0.9)] animate-pulse"></div>
          <span className="text-slate-300 font-mono text-xs uppercase tracking-widest font-semibold">CONJUNCTIONS:</span>
          <span className="text-red-400 font-mono text-sm font-bold tabular-nums">{threatCount}</span>
        </div>
        <div className="flex-1" />
        <span className="text-slate-400 font-mono text-[11px] uppercase tracking-widest font-semibold hidden md:block">LEO · MEO · GEO FULL SPECTRUM SSA</span>
      </div>

      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
    </div>
  );
}
