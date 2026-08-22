import React, { useState, useEffect } from 'react';

export default function TopNav({ activeTab, setActiveTab }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' ZULU');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: 'radar', label: '3D RADAR', icon: '◉' },
    { id: 'matrix', label: 'THREAT MATRIX', icon: '⬡' },
    { id: 'bplane', label: 'B-PLANE', icon: '◎' },
    { id: 'cam', label: 'CAM SOLVER', icon: '△' },
    { id: 'weather', label: 'SOLAR WX', icon: '☀' },
    { id: 'copilot', label: 'AI COPILOT', icon: '◈' },
  ];

  return (
    <div className="w-full bg-[#060a14]/95 backdrop-blur-xl z-50 relative">
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

        {/* Tabs */}
        <div className="flex items-center space-x-0.5 mx-4">
          {tabs.map((tab, i) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3.5 py-2 text-[11px] uppercase tracking-widest transition-all duration-300 rounded-sm ${
                  isActive 
                    ? 'text-cyan-300 bg-cyan-500/10' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                }`}
              >
                <span className="mr-1.5 opacity-60">{tab.icon}</span>
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-1 right-1 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent rounded-full shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right side: Clock + Status */}
        <div className="flex items-center space-x-4 shrink-0">
          <div className="text-amber-400/90 font-mono text-[11px] tracking-wider tabular-nums">
            {time}
          </div>
          <div className="flex items-center space-x-1.5 border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 rounded-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-emerald-400 text-[10px] uppercase tracking-wider font-semibold">LIVE</span>
          </div>
        </div>
      </div>

      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
    </div>
  );
}
