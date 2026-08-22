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
    { id: 'radar', label: '1. 3D RADAR' },
    { id: 'matrix', label: '2. THREAT MATRIX' },
    { id: 'bplane', label: '3. B-PLANE LAB' },
    { id: 'cam', label: '4. CAM SOLVER' },
    { id: 'weather', label: '5. SOLAR WEATHER' },
    { id: 'copilot', label: '6. AI COPILOT' },
  ];

  return (
    <div className="w-full bg-slate-900/90 backdrop-blur-md border-b border-cyan-500/30 flex flex-col z-50">
      {/* Header Row */}
      <div className="flex justify-between items-center px-6 py-3">
        <div className="flex items-center space-x-4">
          <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-pulse"></div>
          <h1 className="text-white font-bold tracking-wider uppercase font-mono text-xl">
            SPACE COMMAND <span className="text-cyan-500 font-normal">//</span> ORBITAL DEFENSE OPS
          </h1>
        </div>
        <div className="flex items-center space-x-6">
          <div className="text-amber-400 font-mono font-semibold tracking-widest text-lg">
            {time}
          </div>
          <div className="flex items-center space-x-2 border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 rounded">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
            <span className="text-emerald-400 font-mono text-xs uppercase tracking-wider font-bold">ONLINE</span>
          </div>
        </div>
      </div>
      
      {/* Tabs Row */}
      <div className="flex px-6 space-x-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-2 font-mono text-sm uppercase tracking-wider transition-all duration-300 border-b-2 ${
                isActive 
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-900/20 shadow-[0_4px_15px_-3px_rgba(34,211,238,0.3)]' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
