import React, { useState } from 'react';
import { Crosshair, ChevronRight, Activity, ShieldAlert, Layers, Network, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import RiskEvolutionChart from './RiskEvolutionChart';
import WhatIfSandbox from './WhatIfSandbox';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function EventIntelligencePanel({ conjunction, onCollapse }) {
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [showSandbox, setShowSandbox] = useState(false);

  if (!conjunction) {
    return (
      <div className="w-[420px] flex flex-col h-full bg-[#030712]/95 backdrop-blur-xl border border-white/10 text-white p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-sm font-bold tracking-widest uppercase text-slate-500">Event Brief</h2>
          {onCollapse && (
            <button onClick={onCollapse} className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/5">
              <ChevronRight size={16} />
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs font-mono uppercase tracking-widest text-center border border-dashed border-white/10 rounded">
          <Crosshair size={24} className="mb-3 opacity-50" />
          Select a priority event<br/>to begin analysis
        </div>
      </div>
    );
  }

  const c = conjunction;
  const riskColor = c.risk_category === 'CRITICAL' ? 'text-red-500 bg-red-500/10 border-red-500/30' : 
                    c.risk_category === 'HIGH' ? 'text-amber-500 bg-amber-500/10 border-amber-500/30' :
                    c.risk_category === 'ELEVATED' ? 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30' :
                    'text-slate-300 bg-slate-300/10 border-slate-300/30';

  return (
    <div className="w-[440px] flex flex-col h-full bg-[#030712]/95 backdrop-blur-xl border border-white/10 text-white relative pointer-events-auto shadow-2xl overflow-hidden">
      
      {/* HEADER */}
      <div className="p-5 border-b border-white/10 bg-[#0f172a]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {onCollapse && (
              <button onClick={onCollapse} className="p-1 -ml-1 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
                <ChevronRight size={18} />
              </button>
            )}
            <div>
              <h2 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2 text-slate-400 mb-1">
                <Crosshair size={14} className="text-cyan-500" />
                Event Brief
              </h2>
              <div className="flex items-center gap-2 text-lg font-bold">
                <span className="text-white">{c.object_1?.name || `NORAD-${c.norad_id_1}`}</span>
                <span className="text-slate-500 text-sm">×</span>
                <span className="text-slate-300">{c.object_2?.name || `NORAD-${c.norad_id_2}`}</span>
              </div>
            </div>
          </div>
          
          <div className={cn("text-[10px] font-bold px-3 py-1.5 rounded uppercase tracking-wider font-mono flex flex-col items-end text-right border", riskColor)}>
            <span className="opacity-90">{c.risk_category} RISK</span>
            <span>SCORE: {(c.threat_score || 0).toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex border-b border-white/10 px-4 bg-[#080d19]">
        {['OVERVIEW', 'EVIDENCE', 'RISK', 'HISTORY'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-3 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer",
              activeTab === tab 
                ? "text-cyan-400 border-cyan-400" 
                : "text-slate-500 border-transparent hover:text-slate-300 hover:border-white/10"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {activeTab === 'OVERVIEW' && (
          <>
            {/* STATUS SUMMARY */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                <Activity size={12} /> Status Summary
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded border border-white/5">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Miss Distance</span>
                  <span className="text-white font-mono text-sm">{(c.min_dist_km * 1000).toFixed(1)} m</span>
                </div>
                <div className="bg-white/5 p-3 rounded border border-white/5">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Time to Close Approach</span>
                  <span className="text-white font-mono text-sm">{new Date(c.tca).toISOString().replace('T', ' ').substring(0, 19)}</span>
                </div>
                <div className="bg-white/5 p-3 rounded border border-white/5">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Relative Velocity</span>
                  <span className="text-white font-mono text-sm">{c.rel_velocity_km_s ? c.rel_velocity_km_s.toFixed(2) : (c.relative_speed_km_s || 0).toFixed(2)} km/s</span>
                </div>
                <div className="bg-white/5 p-3 rounded border border-white/5">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Scientific Pc</span>
                  <span className="text-amber-500 font-mono text-sm">{c.pc.toExponential(2)}</span>
                </div>
              </div>
            </div>

            {/* WHY FLAGGED */}
            {c.threat_factors && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                  <ShieldAlert size={12} /> Why is this priority?
                </h3>
                <div className="space-y-5">
                  {Object.entries(c.threat_factors).map(([factor, percentage], i) => (
                    <div key={factor} className="flex flex-col text-sm font-mono">
                      <div className="flex justify-between mb-2 text-slate-300 font-bold uppercase tracking-wide">
                        <span>{i + 1}. {factor.replace('_', ' ')}</span>
                        <span>{percentage.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div 
                          className="h-full rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'EVIDENCE' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                <Network size={12} /> Model Agreement
              </h3>
              <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                <div className="bg-white/5 p-3 rounded border border-white/5">
                  <div className="text-slate-300 font-bold mb-2">SGP4 (ANALYTICAL)</div>
                  <div className="text-slate-500 mb-1">TCA: <span className="text-white">{c.consensus_metrics?.sgp4_summary?.tca?.split(' ')[1] || 'N/A'}</span></div>
                  <div className="text-slate-500">MISS: <span className="text-white">{c.consensus_metrics?.sgp4_summary?.miss_distance_km ? (c.consensus_metrics.sgp4_summary.miss_distance_km * 1000).toFixed(0) : 'N/A'}m</span></div>
                </div>
                <div className="bg-white/5 p-3 rounded border border-white/5">
                  <div className="text-slate-300 font-bold mb-2">DOP853 (NUMERICAL)</div>
                  <div className="text-slate-500 mb-1">TCA: <span className="text-white">{c.consensus_metrics?.numerical_summary?.tca?.split(' ')[1] || 'N/A'}</span></div>
                  <div className="text-slate-500">MISS: <span className="text-white">{(c.min_dist_km * 1000).toFixed(0)}m</span></div>
                </div>
              </div>
            </div>
            
            <div className="bg-[#0f172a] p-4 rounded border border-white/5">
               <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Consensus Status</h3>
               <span className={cn(
                  "text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider inline-block",
                  c.consensus_status === 'HIGH_DIVERGENCE' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
               )}>
                 {c.consensus_status ? c.consensus_status.replace('_', ' ') : 'HIGH AGREEMENT'}
               </span>
               {c.consensus_status === 'HIGH_DIVERGENCE' && (
                 <p className="mt-3 text-[10px] text-slate-400 leading-relaxed">
                   Warning: Analytical and numerical propagations diverge materially. Do not execute burns without manual verification.
                 </p>
               )}
            </div>
          </div>
        )}

        {activeTab === 'RISK' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                <Layers size={12} /> Formal Risk Bounds
              </h3>
              <div className="bg-white/5 p-4 rounded border border-white/5 text-[10px] font-mono space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 uppercase font-bold">Confidence</span>
                  <span className="text-amber-500">{c.uncertainty_confidence || "UNKNOWN"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 uppercase font-bold">Pc Bounds</span>
                  <span className="text-white">[{c.pc_lower ? c.pc_lower.toExponential(1) : "N/A"} - {c.pc_upper ? c.pc_upper.toExponential(1) : "N/A"}]</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 uppercase font-bold">Foster-Chan Div</span>
                  <span className="text-white">{c.foster_chan_agreement !== undefined ? c.foster_chan_agreement.toFixed(2) : "N/A"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'HISTORY' && (
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Event Evolution</h3>
            <div className="bg-[#0f172a] rounded border border-white/5 p-3">
              <RiskEvolutionChart pairId={c.id} id1={c.norad_id_1} id2={c.norad_id_2} currentTca={c.tca} />
            </div>
          </div>
        )}

      </div>
      
      {/* ACTIONS */}
      <div className="p-5 border-t border-white/10 bg-[#0f172a] grid grid-cols-2 gap-3 shrink-0">
        <button 
          className="py-2.5 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
        >
          ANALYZE CONJUNCTION
        </button>
        <button 
          onClick={() => setShowSandbox(true)}
          className="py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[10px] font-bold uppercase tracking-wider flex justify-center items-center gap-2 transition-colors cursor-pointer"
        >
          <Zap size={12} />
          SIMULATE MANEUVER
        </button>
      </div>

      {showSandbox && (
        <WhatIfSandbox conjunction={c} onClose={() => setShowSandbox(false)} />
      )}
    </div>
  );
}
