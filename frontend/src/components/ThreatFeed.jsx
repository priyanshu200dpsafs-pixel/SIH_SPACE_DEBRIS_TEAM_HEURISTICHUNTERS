import React from 'react';
import { AlertTriangle, AlertCircle, CheckCircle, Crosshair } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
                <div className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono",
                  isHighRisk ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                )}>
                  Pc: {c.pc.toExponential(2)}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs text-white/70 font-mono mt-3">
                <div>
                  <span className="text-white/40 block text-[10px] uppercase">Miss Distance</span>
                  {(c.min_dist_km * 1000).toFixed(1)} m
                </div>
                <div>
                  <span className="text-white/40 block text-[10px] uppercase">TCA (UTC)</span>
                  {new Date(c.tca).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}
                </div>
              </div>

              {isSelected && c.collision_probability_metrics && (
                <div className="mt-4 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider mb-2 text-white/50">
                    Cross-Validation
                  </div>
                  {c.collision_probability_metrics.algorithm_consensus_verified ? (
                    <div className="flex items-center gap-2 text-green-400 text-xs">
                      <CheckCircle size={14} /> Consensus Verified (&lt;10% div)
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                      <AlertCircle size={14} /> Manual Review Req (div {c.collision_probability_metrics.divergence_percentage.toFixed(1)}%)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
