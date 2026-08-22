import React from 'react';
import CinematicEarth from '../CinematicEarth';

export default function OrbitalRadarTab() {
  return (
    <div className="absolute inset-0 w-full h-full bg-[#050505]">
      <CinematicEarth />
      
      {/* Minimal Overlay */}
      <div className="absolute top-6 left-6 pointer-events-none z-10">
        <div className="bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 p-4 rounded shadow-[0_0_15px_rgba(34,211,238,0.15)]">
          <h2 className="text-white font-bold tracking-wider uppercase font-mono mb-2">SYSTEM STATUS</h2>
          <div className="flex flex-col space-y-1">
            <div className="flex justify-between items-center space-x-6">
              <span className="text-slate-300 font-mono text-xs uppercase tracking-wider">RADAR SENSOR</span>
              <span className="text-emerald-400 font-mono font-semibold">ACTIVE</span>
            </div>
            <div className="flex justify-between items-center space-x-6">
              <span className="text-slate-300 font-mono text-xs uppercase tracking-wider">TRACKING MODE</span>
              <span className="text-cyan-400 font-mono font-semibold">L.E.O.</span>
            </div>
            <div className="flex justify-between items-center space-x-6 pt-2 border-t border-slate-700/50 mt-2">
              <span className="text-slate-300 font-mono text-xs uppercase tracking-wider">OBJECTS</span>
              <span className="text-amber-400 font-mono font-semibold">500+</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
