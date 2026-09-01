import React from 'react';
import { AlertTriangle, Crosshair } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function ThreatFeed({ conjunctions, selectedPairId, onSelectPair }) {
  if (!conjunctions) return <div className="text-white p-6 font-mono text-sm">Loading conjunctions...</div>;

  return (
    <div className="w-[420px] 2xl:w-[460px] flex flex-col h-full bg-black/80 backdrop-blur-2xl border-r border-white/10 text-white z-10 relative pointer-events-auto shadow-2xl">
      <div className="p-5 border-b border-white/10 bg-black/60">
        <h2 className="text-lg font-bold tracking-widest uppercase flex items-center gap-2.5 text-white">
          <AlertTriangle className="text-red-500" size={22} />
          Threat Feed
        </h2>
        <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-mono font-semibold">
          High-Risk Conjunctions · Top {conjunctions.length} Events
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3.5">
        {conjunctions.map((c) => {
          const isHighRisk = c.pc >= 1e-4;
          const isSelected = selectedPairId === c.id;
          const name1 = c.object_1?.name || `NORAD-${c.norad_id_1 || c.id?.split('_')[0]}`;
          const name2 = c.object_2?.name || `NORAD-${c.norad_id_2 || c.id?.split('_')[1]}`;
          
          return (
            <div
              key={c.id}
              onClick={() => onSelectPair(c.id)}
              className={cn(
                "p-4 rounded-xl border cursor-pointer transition-all duration-200 group relative overflow-hidden",
                isSelected 
                  ? "border-cyan-400/80 bg-cyan-950/40 shadow-[0_0_20px_rgba(34,211,238,0.2)]" 
                  : "border-white/10 hover:border-cyan-500/40 bg-white/[0.04] hover:bg-white/[0.08]"
              )}
            >
              {isSelected && (
                <div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]" />
              )}
              
              {/* Header: Names + Risk Badge */}
              <div className="flex justify-between items-start gap-2 mb-3">
                <div className="flex flex-col">
                  <div className="font-sans font-bold text-sm tracking-wide text-white group-hover:text-cyan-200 transition-colors flex items-center gap-1.5">
                    <Crosshair size={15} className={isSelected ? "text-cyan-400" : "text-slate-400"} />
                    <span className="truncate max-w-[200px]">{name1}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono ml-5 mt-0.5">
                    × <span className="text-slate-300 font-semibold truncate">{name2}</span>
                  </div>
                </div>

                {c.threat_score !== undefined && c.threat_score !== null ? (
                  <div className={cn(
                    "text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wider font-mono flex flex-col items-end shrink-0 border",
                    c.risk_category === 'CRITICAL' ? "bg-red-500/20 text-red-400 border-red-500/40" : 
                    c.risk_category === 'HIGH' ? "bg-orange-500/20 text-orange-400 border-orange-500/40" :
                    c.risk_category === 'ELEVATED' ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" :
                    "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  )}>
                    <span>SCORE: {c.threat_score.toFixed(1)}</span>
                    <span className="text-[10px] opacity-90 font-semibold">{c.risk_category} RISK</span>
                  </div>
                ) : (
                  <div className={cn(
                    "text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wider font-mono border shrink-0",
                    isHighRisk ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-orange-500/20 text-orange-400 border-orange-500/40"
                  )}>
                    Pc: {c.pc.toExponential(2)}
                  </div>
                )}
              </div>
              
              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-black/40 p-2.5 rounded-lg border border-white/5">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Miss Distance</span>
                  <span className="text-white font-bold text-xs tabular-nums">
                    {(c.min_dist_km * 1000).toFixed(1)} m
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">TCA (UTC)</span>
                  <span className="text-white font-bold text-xs">
                    {new Date(c.tca).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Scientific Pc</span>
                  <span className="text-amber-400 font-bold text-xs tabular-nums">
                    {c.pc.toExponential(2)}
                  </span>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}

