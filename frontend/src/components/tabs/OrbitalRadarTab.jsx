import React, { useState, useEffect } from 'react';
import CinematicEarth from '../CinematicEarth';

export default function OrbitalRadarTab() {
  const [satCount, setSatCount] = useState(0);
  const [threatCount, setThreatCount] = useState(0);

  useEffect(() => {
    // Fetch live stats
    fetch('http://localhost:8000/api/v1/globe-data')
      .then(r => r.json())
      .then(data => setSatCount(data.items?.length || 0))
      .catch(() => {});
    
    fetch('http://localhost:8000/api/v1/conjunctions?page=1&size=1')
      .then(r => r.json())
      .then(data => setThreatCount(data.total || 0))
      .catch(() => {});
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full bg-[var(--color-void)]">
      <CinematicEarth />
      
      {/* Vignette overlay for cinematic depth */}
      <div className="vignette-overlay" />
      
      {/* Scan line effect */}
      <div className="scan-line" />

      {/* Bottom-left status badge — minimal, non-intrusive */}
      <div className="absolute bottom-6 left-6 z-10 pointer-events-none animate-fadeInUp" style={{ animationDelay: '0.5s', animationFillMode: 'backwards' }}>
        <div className="glass-panel px-4 py-3 flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]"></div>
            <span className="text-slate-400 font-mono text-[10px] uppercase tracking-widest">TRACKING</span>
            <span className="text-cyan-300 font-mono text-sm font-bold tabular-nums">{satCount.toLocaleString()}</span>
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex items-center space-x-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(255,0,85,0.8)] animate-pulse"></div>
            <span className="text-slate-400 font-mono text-[10px] uppercase tracking-widest">CONJUNCTIONS</span>
            <span className="text-red-400 font-mono text-sm font-bold tabular-nums">{threatCount}</span>
          </div>
        </div>
      </div>

      {/* Bottom-right classification tag */}
      <div className="absolute bottom-6 right-6 z-10 pointer-events-none animate-fadeInUp" style={{ animationDelay: '0.8s', animationFillMode: 'backwards' }}>
        <div className="text-slate-600 font-mono text-[9px] uppercase tracking-[0.3em]">
          LEO • MEO • GEO FULL SPECTRUM
        </div>
      </div>
    </div>
  );
}
