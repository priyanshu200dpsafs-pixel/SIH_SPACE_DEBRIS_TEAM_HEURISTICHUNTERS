import React, { useState } from 'react';
import { Crosshair, History, ChevronDown, ChevronUp, ChevronRight, TestTube, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import RiskEvolutionChart from './RiskEvolutionChart';
import WhatIfSandbox from './WhatIfSandbox';
import CopilotPanel from '../CopilotPanel';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function EventIntelligencePanel({ conjunction, onCollapse }) {
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [expandedProvenance, setExpandedProvenance] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);

  if (!conjunction) {
    return (
      <div className="w-[340px] flex flex-col h-full bg-slate-950/85 backdrop-blur-2xl border border-cyan-500/20 rounded-2xl text-white p-5 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold tracking-widest uppercase text-white/60">Event Intelligence</h2>
          {onCollapse && (
            <button onClick={onCollapse} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
              <ChevronRight size={18} />
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-white/40 text-xs font-mono uppercase tracking-widest text-center border border-dashed border-white/10 rounded-xl p-4">
          <Crosshair size={28} className="mb-2 opacity-50 text-cyan-400" />
          Select a conjunction from <br/> the feed to begin analysis
        </div>
      </div>
    );
  }

  const c = conjunction;

  return (
    <div className="w-[380px] 2xl:w-[420px] flex flex-col h-full bg-slate-950/85 backdrop-blur-2xl border border-cyan-500/20 rounded-2xl text-white relative pointer-events-auto shadow-2xl overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-black/40 flex justify-between items-center">
        <div className="flex items-center gap-2">
          {onCollapse && (
            <button 
              onClick={onCollapse}
              className="p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Collapse Event Analysis"
            >
              <ChevronRight size={18} />
            </button>
          )}
          <div>
            <h2 className="text-base font-bold tracking-widest uppercase flex items-center gap-2 text-cyan-300">
              <Crosshair size={18} />
              Event Analysis
            </h2>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider font-mono font-semibold truncate max-w-[200px]">
              {c.object_1?.name || c.id}
            </p>
          </div>
        </div>
        
        {c.threat_score !== undefined && c.threat_score !== null && (
          <div className={cn(
            "text-xs font-bold px-3 py-1.5 rounded-md uppercase tracking-wider font-mono flex flex-col items-end text-right border",
            c.risk_category === 'CRITICAL' ? "bg-red-500/25 text-red-400 border-red-500/50" : 
            c.risk_category === 'HIGH' ? "bg-orange-500/25 text-orange-400 border-orange-500/50" :
            c.risk_category === 'ELEVATED' ? "bg-yellow-500/25 text-yellow-300 border-yellow-500/50" :
            "bg-emerald-500/25 text-emerald-300 border-emerald-500/50"
          )}>
            <span>SCORE: {c.threat_score.toFixed(1)}</span>
            <span className="text-[10px] opacity-90 font-bold">{c.risk_category} RISK</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-5">
        
        {/* Core Metrics Summary */}
        <div className="grid grid-cols-2 gap-3.5 text-xs font-mono bg-white/[0.04] p-4 rounded-xl border border-white/10 shadow-inner">
          <div>
            <span className="text-slate-400 block text-xs uppercase font-semibold mb-0.5">Miss Distance</span>
            <span className="text-white font-bold text-base tabular-nums">{(c.min_dist_km * 1000).toFixed(1)} m</span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs uppercase font-semibold mb-0.5">TCA (UTC)</span>
            <span className="text-white font-bold text-base">{new Date(c.tca).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs uppercase font-semibold mb-0.5">Relative Velocity</span>
            <span className="text-cyan-300 font-bold text-base tabular-nums">{c.rel_velocity_km_s ? c.rel_velocity_km_s.toFixed(2) : (c.relative_speed_km_s ? c.relative_speed_km_s.toFixed(2) : 'N/A')} km/s</span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs uppercase font-semibold mb-0.5">Scientific Pc</span>
            <span className="text-amber-400 font-bold text-base tabular-nums">{c.pc.toExponential(2)}</span>
          </div>
        </div>

        {/* Threat Score Explanation Panel */}
        {c.threat_factors && (
          <div className="p-4 rounded-xl bg-black/50 border border-white/10 text-xs font-mono space-y-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-300 uppercase tracking-wider font-sans font-bold">
                Threat Ranking Factors
              </span>
            </div>
            <div className="text-xs text-white/90 space-y-2.5">
               {Object.entries(c.threat_factors).map(([factor, percentage]) => (
                 <div key={factor} className="flex flex-col">
                   <div className="flex justify-between mb-1.5 font-semibold">
                     <span className="text-slate-300 uppercase text-xs">{factor.replace('_', ' ')}</span>
                     <span className="text-white font-bold">{percentage.toFixed(1)}%</span>
                   </div>
                   <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                     <div 
                       className={cn(
                         "h-full rounded-full transition-all duration-500",
                         factor === 'pc' ? 'bg-orange-500' :
                         factor === 'urgency' ? 'bg-red-500' :
                         factor === 'miss_distance' ? 'bg-purple-500' :
                         'bg-cyan-500'
                       )}
                       style={{ width: `${percentage}%` }}
                     />
                   </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {/* Formal Risk Estimation Layer */}
        <div className="p-4 rounded-xl bg-black/50 border border-white/10 text-xs font-mono space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300 uppercase tracking-wider font-sans font-bold">
              Formal Risk Estimate Bounds
            </span>
            <span className={cn(
              "text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border",
              c.uncertainty_confidence === 'HIGH CONFIDENCE' ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
              c.uncertainty_confidence === 'MODERATE CONFIDENCE' ? "bg-blue-500/20 text-blue-300 border-blue-500/40" :
              c.uncertainty_confidence === 'MODERATE UNCERTAINTY' ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
              "bg-rose-500/20 text-rose-300 border-rose-500/40"
            )}>
              {c.uncertainty_confidence || "UNCERTAINTY UNKNOWN"}
            </span>
          </div>
          
          <div className="text-xs text-white/90 bg-white/[0.04] px-4 py-3 rounded-lg space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-semibold">Risk Bounds:</span>
              <span className="text-white font-bold tabular-nums">[{c.pc_lower ? c.pc_lower.toExponential(2) : "0.00e+00"} – {c.pc_upper ? c.pc_upper.toExponential(2) : "0.00e+00"}]</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-semibold">Sensitivity (Orders Mag):</span>
              <span className="text-cyan-300 font-bold">{c.sensitivity_score ? c.sensitivity_score.toFixed(2) : "N/A"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-semibold">Chan/Foster Divergence:</span>
              <span className="text-white font-bold">{c.foster_chan_agreement !== undefined ? c.foster_chan_agreement.toFixed(2) : "N/A"}</span>
            </div>
          </div>

          <div className="text-xs text-slate-300 font-sans leading-relaxed p-3 border-l-3 border-indigo-500 bg-indigo-500/15 rounded-r-lg">
            <strong className="text-indigo-200">Why is this Pc uncertain?</strong> {c.uncertainty_explanation || "No explanation provided."}
          </div>
        </div>

        {/* Multi-Model Propagation Consensus Panel */}
        <div className="p-4 rounded-xl bg-black/50 border border-white/10 text-xs font-mono space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300 uppercase tracking-wider font-sans font-bold">
              Model Agreement
            </span>
            <span className={cn(
              "text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border",
              (c.consensus_status === 'HIGH_AGREEMENT' || !c.consensus_status) ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
              c.consensus_status === 'MODERATE_AGREEMENT' ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
              "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse"
            )}>
              {c.consensus_status ? c.consensus_status.replace('_', ' ') : 'HIGH AGREEMENT'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/[0.04] p-3 rounded-lg space-y-1.5 border border-white/5">
              <div className="text-cyan-300 font-bold uppercase mb-1.5 border-b border-white/10 pb-1 text-xs">SGP4 (Analytical)</div>
              <div><span className="text-slate-400 font-semibold">TCA:</span> <span className="text-white font-bold">{c.consensus_metrics?.sgp4_summary?.tca?.split(' ')[1] || new Date(c.tca).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}</span></div>
              <div><span className="text-slate-400 font-semibold">Miss:</span> <span className="text-white font-bold">{c.consensus_metrics?.sgp4_summary?.miss_distance_km ? `${(c.consensus_metrics.sgp4_summary.miss_distance_km * 1000).toFixed(0)} m` : `${(c.min_dist_km * 1000).toFixed(0)} m`}</span></div>
            </div>
            <div className="bg-white/[0.04] p-3 rounded-lg space-y-1.5 border border-white/5">
              <div className="text-indigo-300 font-bold uppercase mb-1.5 border-b border-white/10 pb-1 text-xs">DOP853 (Numerical)</div>
              <div><span className="text-slate-400 font-semibold">TCA:</span> <span className="text-white font-bold">{c.consensus_metrics?.numerical_summary?.tca?.split(' ')[1] || new Date(c.tca).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}</span></div>
              <div><span className="text-slate-400 font-semibold">Miss:</span> <span className="text-white font-bold">{(c.min_dist_km * 1000).toFixed(0)} m</span></div>
            </div>
          </div>
          
          {c.consensus_status === 'HIGH_DIVERGENCE' && (
            <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-500/50 text-xs text-rose-200 font-sans leading-relaxed">
              ⚠️ <strong>Scrutiny Required:</strong> Analytical and numerical propagations diverge materially. Do not execute burns without manual verification.
            </div>
          )}
        </div>

        {/* History Toggle */}
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedHistory(!expandedHistory)}
            className="w-full p-4 flex items-center justify-between bg-black/50 hover:bg-white/10 text-xs font-sans font-bold uppercase tracking-wider text-slate-200 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2"><History size={16} className="text-cyan-400"/> Event History Timeline</span>
            {expandedHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {expandedHistory && (
            <div className="p-4 bg-black/70 border-t border-white/10">
              <RiskEvolutionChart 
                pairId={c.id} 
                id1={c.norad_id_1} 
                id2={c.norad_id_2} 
                currentTca={c.tca} 
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Action Footer */}
      <div className="p-4 bg-black/90 border-t border-white/10 space-y-2.5">
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => setShowSandbox(true)}
            className="py-3 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold uppercase tracking-wider text-white transition-all shadow-lg shadow-purple-900/30 cursor-pointer"
          >
            <TestTube size={16} /> What-If Sandbox
          </button>
          <button 
            onClick={() => setShowCopilot(!showCopilot)}
            className="py-3 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold uppercase tracking-wider text-white transition-all shadow-lg shadow-emerald-900/30 cursor-pointer"
          >
            <AlertCircle size={16} /> AI Copilot Analyst
          </button>
        </div>
      </div>

      {/* Modals / Overlays */}
      {showSandbox && (
        <WhatIfSandbox 
          conjunction={c} 
          onClose={() => setShowSandbox(false)} 
        />
      )}

      {showCopilot && (
        <div className="absolute inset-0 z-50 bg-black/95 flex flex-col border-l border-white/20">
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/70">
            <h3 className="font-bold text-emerald-400 uppercase tracking-widest text-sm flex items-center gap-2">
              <AlertCircle size={18} /> AI Analyst Copilot
            </h3>
            <button onClick={() => setShowCopilot(false)} className="text-xs uppercase text-slate-400 hover:text-white transition px-3 py-1 bg-white/10 rounded cursor-pointer">Close</button>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <CopilotPanel sessionId="event-copilot" context={`Analyzing conjunction ${c.id} between ${c.norad_id_1} and ${c.norad_id_2}. Threat Score is ${c.threat_score}. Pc is ${c.pc}.`} />
          </div>
        </div>
      )}
    </div>
  );
}
