import React, { useState } from 'react';
import { Crosshair, History, ChevronDown, ChevronUp, TestTube, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import RiskEvolutionChart from './RiskEvolutionChart';
import WhatIfSandbox from './WhatIfSandbox';
import CopilotPanel from '../CopilotPanel';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function EventIntelligencePanel({ conjunction }) {
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [expandedProvenance, setExpandedProvenance] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);

  if (!conjunction) {
    return (
      <div className="w-96 flex flex-col h-full bg-black/60 backdrop-blur-xl border-l border-white/10 text-white z-10 p-6">
        <h2 className="text-lg font-bold tracking-widest uppercase text-white/50 mb-4">Event Intelligence</h2>
        <div className="flex-1 flex flex-col items-center justify-center text-white/30 text-xs font-mono uppercase tracking-widest text-center border border-dashed border-white/10 rounded">
          <Crosshair size={32} className="mb-2 opacity-50" />
          Select a conjunction from <br/> the feed to begin analysis
        </div>
      </div>
    );
  }

  const c = conjunction;

  return (
    <div className="w-[420px] flex flex-col h-full bg-black/80 backdrop-blur-xl border-l border-white/10 text-white z-10 relative pointer-events-auto">
      <div className="p-5 border-b border-white/10 bg-black/40 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold tracking-widest uppercase flex items-center gap-2 text-cyan-400">
            <Crosshair size={18} />
            Event Analysis
          </h2>
          <p className="text-xs text-white/50 mt-1 uppercase tracking-wider font-mono">
            Pair ID: {c.id}
          </p>
        </div>
        
        {c.threat_score !== undefined && c.threat_score !== null && (
          <div className={cn(
            "text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider font-mono flex flex-col items-end text-right",
            c.risk_category === 'CRITICAL' ? "bg-red-500/20 text-red-400 border border-red-500/30" : 
            c.risk_category === 'HIGH' ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
            c.risk_category === 'ELEVATED' ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
            "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          )}>
            <span>SCORE: {c.threat_score.toFixed(1)}</span>
            <span className="text-[8px] opacity-80">{c.risk_category} RISK</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-5">
        
        {/* Core Metrics Summary */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-white/5 p-3 rounded border border-white/10">
          <div>
            <span className="text-white/40 block text-[9px] uppercase">Miss Distance</span>
            <span className="text-white/90">{(c.min_dist_km * 1000).toFixed(1)} m</span>
          </div>
          <div>
            <span className="text-white/40 block text-[9px] uppercase">TCA (UTC)</span>
            <span className="text-white/90">{new Date(c.tca).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}</span>
          </div>
          <div>
            <span className="text-white/40 block text-[9px] uppercase">Relative Velocity</span>
            <span className="text-white/90">{c.rel_velocity_km_s ? c.rel_velocity_km_s.toFixed(2) : 'N/A'} km/s</span>
          </div>
          <div>
            <span className="text-white/40 block text-[9px] uppercase">Scientific Pc</span>
            <span className="text-orange-400 font-bold">{c.pc.toExponential(2)}</span>
          </div>
        </div>

        {/* Threat Score Explanation Panel */}
        {c.threat_factors && (
          <div className="p-3 rounded bg-black/40 border border-white/10 text-xs font-mono space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/60 uppercase tracking-wider font-sans font-semibold">
                Threat Ranking Factors
              </span>
            </div>
            <div className="text-[10px] text-white/80 space-y-2">
               {Object.entries(c.threat_factors).map(([factor, percentage]) => (
                 <div key={factor} className="flex flex-col">
                   <div className="flex justify-between mb-1">
                     <span className="text-white/60 uppercase text-[9px]">{factor.replace('_', ' ')}</span>
                     <span>{percentage.toFixed(1)}%</span>
                   </div>
                   <div className="w-full bg-white/10 rounded h-1.5">
                     <div 
                       className={cn(
                         "h-full rounded",
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
        <div className="p-3 rounded bg-black/40 border border-white/10 text-xs font-mono space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/60 uppercase tracking-wider font-sans font-semibold">
              Formal Risk Estimate Bounds
            </span>
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
              c.uncertainty_confidence === 'HIGH CONFIDENCE' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
              c.uncertainty_confidence === 'MODERATE CONFIDENCE' ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
              c.uncertainty_confidence === 'MODERATE UNCERTAINTY' ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
              "bg-rose-500/20 text-rose-400 border border-rose-500/30"
            )}>
              {c.uncertainty_confidence || "UNCERTAINTY UNKNOWN"}
            </span>
          </div>
          
          <div className="text-[11px] text-white/80 bg-white/5 px-3 py-2 rounded space-y-2">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-white/40">Risk Bounds:</span>
              <span className="text-white/90">[{c.pc_lower ? c.pc_lower.toExponential(2) : "0.00e+00"} – {c.pc_upper ? c.pc_upper.toExponential(2) : "0.00e+00"}]</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-white/40">Sensitivity (Orders Mag):</span>
              <span className="text-white/90">{c.sensitivity_score ? c.sensitivity_score.toFixed(2) : "N/A"}</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-white/40">Chan/Foster Divergence:</span>
              <span className="text-white/90">{c.foster_chan_agreement !== undefined ? c.foster_chan_agreement.toFixed(2) : "N/A"}</span>
            </div>
          </div>

          <div className="text-[10px] text-white/60 font-sans leading-tight p-2 border-l-2 border-indigo-500/50 bg-indigo-500/10">
            <strong>Why is this Pc uncertain?</strong> {c.uncertainty_explanation || "No explanation provided."}
          </div>
        </div>

        {/* Multi-Model Propagation Consensus Panel */}
        <div className="p-3 rounded bg-black/40 border border-white/10 text-xs font-mono space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/60 uppercase tracking-wider font-sans font-semibold">
              Model Agreement
            </span>
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
              (c.consensus_status === 'HIGH_AGREEMENT' || !c.consensus_status) ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
              c.consensus_status === 'MODERATE_AGREEMENT' ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
              "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse"
            )}>
              {c.consensus_status ? c.consensus_status.replace('_', ' ') : 'HIGH AGREEMENT'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-white/5 p-2 rounded space-y-1">
              <div className="text-cyan-400 font-bold uppercase mb-1 border-b border-white/10 pb-1">SGP4 (Analytical)</div>
              <div><span className="text-white/40">TCA:</span> {c.consensus_metrics?.sgp4_summary?.tca?.split(' ')[1] || new Date(c.tca).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}</div>
              <div><span className="text-white/40">Miss:</span> {c.consensus_metrics?.sgp4_summary?.miss_distance_km ? `${(c.consensus_metrics.sgp4_summary.miss_distance_km * 1000).toFixed(0)} m` : `${(c.min_dist_km * 1000).toFixed(0)} m`}</div>
            </div>
            <div className="bg-white/5 p-2 rounded space-y-1">
              <div className="text-indigo-400 font-bold uppercase mb-1 border-b border-white/10 pb-1">DOP853 (Numerical)</div>
              <div><span className="text-white/40">TCA:</span> {c.consensus_metrics?.numerical_summary?.tca?.split(' ')[1] || new Date(c.tca).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}</div>
              <div><span className="text-white/40">Miss:</span> {(c.min_dist_km * 1000).toFixed(0)} m</div>
            </div>
          </div>
          
          {c.consensus_status === 'HIGH_DIVERGENCE' && (
            <div className="p-2 rounded bg-rose-950/60 border border-rose-500/40 text-[10px] text-rose-300 font-sans">
              ⚠️ <strong>Scrutiny Required:</strong> Analytical and numerical propagations diverge materially. Do not execute burns without manual verification.
            </div>
          )}
        </div>

        {/* History Toggle */}
        <div className="border border-white/10 rounded overflow-hidden">
          <button
            onClick={() => setExpandedHistory(!expandedHistory)}
            className="w-full p-3 flex items-center justify-between bg-black/40 hover:bg-white/5 text-[10px] font-sans font-semibold uppercase tracking-wider text-white/70 transition-colors"
          >
            <span className="flex items-center gap-2"><History size={14} className="text-cyan-400"/> Event History Timeline</span>
            {expandedHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          
          {expandedHistory && (
            <div className="p-3 bg-black/60 border-t border-white/10">
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
      <div className="p-4 bg-black border-t border-white/10 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => setShowSandbox(true)}
            className="py-2.5 flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 rounded text-xs font-bold text-white transition-colors"
          >
            <TestTube size={14} /> What-If Sandbox
          </button>
          <button 
            onClick={() => setShowCopilot(!showCopilot)}
            className="py-2.5 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold text-white transition-colors"
          >
            <AlertCircle size={14} /> AI Copilot Analyst
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
          <div className="p-4 border-b border-white/10 flex justify-between items-center">
            <h3 className="font-bold text-emerald-400 uppercase tracking-widest text-sm flex items-center gap-2">
              <AlertCircle size={16} /> AI Analyst Copilot
            </h3>
            <button onClick={() => setShowCopilot(false)} className="text-xs uppercase hover:text-white transition">Close</button>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <CopilotPanel context={`Analyzing conjunction ${c.id} between ${c.norad_id_1} and ${c.norad_id_2}. Threat Score is ${c.threat_score}. Pc is ${c.pc}.`} />
          </div>
        </div>
      )}
    </div>
  );
}
