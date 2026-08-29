import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle, Crosshair, ChevronDown, ChevronUp, History, TestTube } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import RiskEvolutionChart from './panels/RiskEvolutionChart';
import WhatIfSandbox from './panels/WhatIfSandbox';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function ThreatFeed({ conjunctions, selectedPairId, onSelectPair }) {
  if (!conjunctions) return <div className="text-white p-4">Loading conjunctions...</div>;

  return (
    <div className="w-96 flex flex-col h-full bg-black/60 backdrop-blur-xl border-r border-white/10 text-white z-10 relative pointer-events-auto">
      <div className="p-6 border-b border-white/10 bg-black/40">
        <h2 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
          <AlertTriangle className="text-red-500" size={20} />
          Threat Feed
        </h2>
        <p className="text-xs text-white/50 mt-1 uppercase tracking-wider font-mono">
          High-Risk Conjunctions (Top {conjunctions.length})
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
        {conjunctions.map((c) => {
          const isHighRisk = c.pc >= 1e-4;
          const isSelected = selectedPairId === c.id;
          
          return (
            <div
              key={c.id}
              onClick={() => onSelectPair(c.id)}
              className={cn(
                "p-4 rounded-lg border cursor-pointer transition-all duration-200 group relative overflow-hidden",
                isSelected 
                  ? "border-cyan-500/50 bg-cyan-950/30 shadow-[0_0_15px_rgba(0,255,255,0.1)]" 
                  : "border-white/5 hover:border-white/20 bg-white/5 hover:bg-white/10"
              )}
            >
              {isSelected && (
                <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500 shadow-[0_0_10px_#00ffff]" />
              )}
              
              <div className="flex justify-between items-start mb-2">
                <div className="font-mono text-sm tracking-wider flex items-center gap-1.5">
                  <Crosshair size={14} className={isSelected ? "text-cyan-400" : "text-white/40"} />
                  {c.id}
                </div>
                {c.threat_score !== undefined && c.threat_score !== null ? (
                  <div className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono flex flex-col items-end",
                    c.risk_category === 'CRITICAL' ? "bg-red-500/20 text-red-400 border border-red-500/30" : 
                    c.risk_category === 'HIGH' ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                    c.risk_category === 'ELEVATED' ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
                    "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  )}>
                    <span>THREAT SCORE: {c.threat_score.toFixed(1)}</span>
                    <span className="text-[8px] opacity-80">{c.risk_category} RISK</span>
                  </div>
                ) : (
                  <div className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono",
                    isHighRisk ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                  )}>
                    Pc: {c.pc.toExponential(2)}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-xs text-white/70 font-mono mt-3">
                <div>
                  <span className="text-white/40 block text-[9px] uppercase">Miss Dist</span>
                  {(c.min_dist_km * 1000).toFixed(1)} m
                </div>
                <div>
                  <span className="text-white/40 block text-[9px] uppercase">TCA (UTC)</span>
                  {new Date(c.tca).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}
                </div>
                <div>
                  <span className="text-white/40 block text-[9px] uppercase">Scientific Pc</span>
                  <span className="text-orange-400 font-bold">{c.pc.toExponential(2)}</span>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
