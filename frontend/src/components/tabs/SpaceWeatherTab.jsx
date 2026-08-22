import React, { useState, useEffect } from 'react';

function GaugeRing({ value, max, label, unit, color, description, severity }) {
  const pct = Math.min(value / max, 1);
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="glass-panel p-8 flex flex-col items-center text-center relative overflow-hidden group hover:border-white/10 transition-all duration-500">
      {/* Subtle background glow */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
        style={{ background: `radial-gradient(circle at center, ${color}08 0%, transparent 70%)` }}
      />
      
      {/* Gauge SVG */}
      <div className="relative w-36 h-36 mb-5">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          {/* Background ring */}
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
          {/* Value ring */}
          <circle 
            cx="60" cy="60" r="54" fill="none" 
            stroke={color} strokeWidth="6" 
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold tabular-nums" style={{ color }}>{value.toFixed(1)}</div>
          <div className="text-slate-500 text-[10px] uppercase tracking-wider mt-0.5">{unit}</div>
        </div>
      </div>

      {/* Label */}
      <div className="text-slate-400 font-mono text-[10px] uppercase tracking-[0.15em] mb-2">{label}</div>
      
      {/* Severity badge */}
      <div 
        className="text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-sm border mb-4"
        style={{ 
          color, 
          borderColor: `${color}40`,
          backgroundColor: `${color}10`
        }}
      >
        {severity}
      </div>

      {/* Description */}
      <div className="text-slate-600 text-[10px] font-mono leading-relaxed pt-3 border-t border-white/[0.04] w-full">
        {description}
      </div>
    </div>
  );
}

export default function SpaceWeatherTab() {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/weather')
      .then(res => res.json())
      .then(data => setWeather(data))
      .catch(err => console.error(err));
  }, []);

  const getF107Severity = (val) => {
    if (val >= 200) return { text: 'EXTREME', color: '#ef4444' };
    if (val >= 150) return { text: 'ELEVATED', color: '#f59e0b' };
    if (val >= 100) return { text: 'MODERATE', color: '#22d3ee' };
    return { text: 'QUIET', color: '#10b981' };
  };

  const getApSeverity = (val) => {
    if (val >= 50) return { text: 'STORM', color: '#ef4444' };
    if (val >= 20) return { text: 'ACTIVE', color: '#f59e0b' };
    if (val >= 7) return { text: 'UNSETTLED', color: '#22d3ee' };
    return { text: 'QUIET', color: '#10b981' };
  };

  return (
    <div className="w-full h-full p-6 bg-[var(--color-void)] overflow-auto flex flex-col items-center justify-center tab-content">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="flex justify-between items-end mb-6 animate-fadeInUp">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wider">SOLAR WEATHER</h2>
            <div className="text-slate-500 font-mono text-[10px] tracking-widest mt-1">
              SOURCE: NOAA SWPC • REAL-TIME TELEMETRY
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse"></div>
            <span className="text-emerald-400 font-mono text-[10px] uppercase tracking-wider font-bold">LIVE</span>
          </div>
        </div>

        {!weather ? (
          <div className="glass-panel p-16 text-center">
            <div className="text-cyan-500/60 font-mono animate-pulse">Establishing downlink...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeInUp" style={{ animationDelay: '0.2s', animationFillMode: 'backwards' }}>
            {(() => {
              const f107s = getF107Severity(weather.f107);
              return (
                <GaugeRing
                  value={weather.f107}
                  max={300}
                  label="SOLAR RADIO FLUX"
                  unit="F10.7 (SFU)"
                  color={f107s.color}
                  severity={f107s.text}
                  description="Drives upper atmosphere heating & expansion. Higher values increase drag on LEO objects."
                />
              );
            })()}
            {(() => {
              const aps = getApSeverity(weather.ap);
              return (
                <GaugeRing
                  value={weather.ap}
                  max={100}
                  label="GEOMAGNETIC ACTIVITY"
                  unit="Planetary Ap"
                  color={aps.color}
                  severity={aps.text}
                  description="Proxy for geomagnetic storm activity. Storm conditions cause rapid orbital decay in LEO."
                />
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
