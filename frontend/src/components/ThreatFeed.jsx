import React from 'react';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function ThreatFeed({ conjunctions, selectedPairId, onSelectPair, onCollapse }) {
  if (!conjunctions) return <div className="text-white p-6 font-mono text-sm">Loading conjunctions...</div>;

  return (
    <div className="w-full flex flex-col h-full bg-[#030712]/95 backdrop-blur-xl border border-white/10 text-white relative pointer-events-auto shadow-2xl overflow-hidden">
      <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#0f172a]">
        <div>
          <h2 className="text-base font-bold tracking-widest uppercase flex items-center gap-2 text-white">
            <ShieldAlert size={20} className="text-cyan-500" />
            Priority Events
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-mono font-semibold">
            {conjunctions.length} Monitored Encounters
          </p>
        </div>
        {onCollapse && (
          <button 
            onClick={onCollapse}
            className="p-2 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Collapse Panel"
          >
            <ChevronLeft size={20} />
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
        {conjunctions.map((c, index) => {
          const isSelected = selectedPairId === c.id;
          const name1 = c.object_1?.name || `NORAD-${c.norad_id_1}`;
          const name2 = c.object_2?.name || `NORAD-${c.norad_id_2}`;
          const riskColor = c.risk_category === 'CRITICAL' ? 'text-red-500' : 
                            c.risk_category === 'HIGH' ? 'text-amber-500' :
                            c.risk_category === 'ELEVATED' ? 'text-cyan-400' : 'text-slate-400';
          
          return (
            <div
              key={c.id}
              onClick={() => onSelectPair(c)}
              className={cn(
                "rounded-lg px-4 py-3 cursor-pointer transition-colors border",
                isSelected 
                  ? "bg-white/10 border-white/20" 
                  : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className={cn("text-xs font-mono font-bold w-5 text-center", riskColor)}>
                    {index + 1}
                  </span>
                  <div className="flex flex-col truncate">
                    <span className={cn("text-sm font-bold truncate tracking-wide", isSelected ? "text-white" : "text-slate-300")}>
                      {name1}
                    </span>
                    <span className="text-xs text-slate-500 font-mono truncate mt-0.5">
                      × {name2}
                    </span>
                  </div>
                </div>
                {!isSelected && (
                   <div className="flex flex-col items-end justify-center">
                     <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-0.5">SCORE</span>
                     <span className={cn("text-sm font-mono font-bold leading-none", riskColor)}>
                       {(c.threat_score || 0).toFixed(0)}
                     </span>
                   </div>
                )}
              </div>

              {/* EXPANDED DETAILS */}
              {isSelected && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3 text-xs font-mono bg-[#0f172a]/50 p-4 rounded-md">
                  <div>
                    <span className="text-slate-500 block mb-1">MISS DIST</span>
                    <span className="text-white font-bold text-sm">{(c.min_dist_km * 1000).toFixed(0)}m</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Pc</span>
                    <span className="text-amber-400 font-bold text-sm">{c.pc.toExponential(1)}</span>
                  </div>
                  <div className="col-span-2 mt-2">
                    <span className="text-slate-500 block mb-1">TCA (UTC)</span>
                    <span className="text-white text-sm">{new Date(c.tca).toISOString().replace('T', ' ').substring(0, 19)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
