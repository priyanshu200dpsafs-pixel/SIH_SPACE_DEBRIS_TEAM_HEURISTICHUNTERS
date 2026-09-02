const API_BASE_URL = import.meta.env.VITE_API_URL || '';
import React, { useState, useEffect } from 'react';
import { Globe, AlertTriangle, Activity, Play, MessageSquare, Clock, RefreshCw, Radar, Grid3x3, Target, Wrench, Sun, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const NAV_TABS = [
  { id: '3d-radar', label: '3D RADAR', icon: Radar, status: 'LIVE' },
  { id: 'threat-matrix', label: 'THREAT MATRIX', icon: Grid3x3, status: 'LIVE' },
  { id: 'b-plane', label: 'B-PLANE', icon: Target, status: 'READY' },
  { id: 'cam-solver', label: 'CAM SOLVER', icon: Wrench, status: 'READY' },
  { id: 'solar-wx', label: 'SOLAR WX', icon: Sun, status: 'LIVE' },
  { id: 'ai-copilot', label: 'AI COPILOT', icon: Sparkles, status: 'READY' },
  { id: 'validation-lab', label: 'VALIDATION LAB', icon: Target, status: 'TEST' },
];

export default function TopNav({ activeTab = '3d-radar', onTabChange, isEngineerMode, onToggleEngineerMode }) {
  const [time, setTime] = useState("");
  const [healthData, setHealthData] = useState(null);
  const [countdownStr, setCountdownStr] = useState("");

  const fetchHealth = () => {
    fetch(API_BASE_URL + '/api/v1/health')
      .then(r => r.json())
      .then(data => setHealthData(data))
      .catch(() => {});
  };

  useEffect(() => {
    fetchHealth();
    const statsInterval = setInterval(fetchHealth, 30000);
    return () => clearInterval(statsInterval);
  }, []);

  useEffect(() => {
    const updateTick = () => {
      const now = new Date();
      setTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' Z');

      if (healthData?.next_pipeline_run) {
        const nextTime = new Date(healthData.next_pipeline_run).getTime();
        const diffMs = nextTime - now.getTime();
        if (diffMs > 0) {
          const totalSec = Math.floor(diffMs / 1000);
          const hrs = Math.floor(totalSec / 3600);
          const mins = Math.floor((totalSec % 3600) / 60);
          const secs = totalSec % 60;
          setCountdownStr(`T-${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`);
        } else {
          setCountdownStr('REFRESHING...');
        }
      }
    };

    updateTick();
    const interval = setInterval(updateTick, 1000);
    return () => clearInterval(interval);
  }, [healthData]);

  const formatLastSync = (isoStr) => {
    if (!isoStr) return 'AWAITING DATA';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'AWAITING DATA';
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
    <div className="w-full bg-[#030712] border-b border-white/10 flex flex-col shrink-0 shadow-xl z-50">
      
      {/* Top Branding & Status Row */}
      <div className="flex items-center justify-between px-6 h-10 border-b border-white/5 bg-[#080d19]">
        <div className="flex items-center space-x-3 shrink-0">
          <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
          <h1 className="text-white font-bold tracking-widest uppercase text-[11px] flex items-center">
            ARES <span className="text-cyan-500 font-light mx-2">//</span> <span className="text-slate-400 font-normal">OPERATIONAL MISSION CONTROL</span>
          </h1>
        </div>

        <div className="flex items-center space-x-6 shrink-0 text-xs font-mono font-semibold tracking-wider text-slate-400">
          
          <button 
            onClick={onToggleEngineerMode}
            className={cn(
              "flex items-center gap-2 px-3 py-1 rounded border transition-colors cursor-pointer mr-2",
              isEngineerMode 
                ? "bg-purple-500/20 border-purple-500/40 text-purple-300" 
                : "bg-white/5 border-white/10 text-slate-500 hover:text-slate-300"
            )}
            title="Toggle Advanced Engineering Diagnostics"
          >
            <Activity size={14} />
            <span>ENG</span>
          </button>

          <div className="flex items-center gap-2" title={`Last Pipeline: ${healthData?.last_pipeline_run || 'N/A'}`}>
            <Clock size={14} />
            <span>SYNC: {formatLastSync(healthData?.last_pipeline_run)}</span>
          </div>
          <div className="flex items-center gap-2 text-cyan-400/80">
            <RefreshCw size={14} className={countdownStr === 'REFRESHING...' ? 'animate-spin' : ''} />
            <span>{countdownStr || 'CALCULATING...'}</span>
          </div>
          <div className="text-white bg-white/5 px-3 py-1 rounded border border-white/10">
            {time}
          </div>
        </div>
      </div>

      {/* Primary Navigation Row */}
      <div className="flex items-center px-4 h-12">
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
          {NAV_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange?.(tab.id)}
                className={cn(
                  "flex items-center space-x-2 px-5 h-[38px] rounded transition-all duration-300 cursor-pointer border-b-2 relative",
                  isActive
                    ? "bg-cyan-500/10 text-white border-cyan-400 shadow-[inset_0_-2px_10px_rgba(34,211,238,0.2)]"
                    : "border-transparent text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Icon size={16} className={isActive ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'text-slate-500'} />
                <span className="text-[13px] font-bold uppercase tracking-wider">{tab.label}</span>
                
                {/* Status Indicator */}
                <div className="ml-2 flex items-center gap-1">
                  {tab.status === 'LIVE' ? (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                      <span className="text-[9px] text-emerald-400 font-bold uppercase">LIVE</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-500/10 border border-slate-500/20">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">READY</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
