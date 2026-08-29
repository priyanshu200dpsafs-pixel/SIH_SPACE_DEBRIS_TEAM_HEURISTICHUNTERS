import React, { useState } from 'react';
import { TestTube, Crosshair, AlertTriangle, ArrowRight, Play, Loader2, CheckCircle, Save, ShieldAlert, Minimize, Grid } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function WhatIfSandbox({ conjunction, onClose }) {
  const [mode, setMode] = useState('single'); // 'single' or 'landscape'

  const [targetId, setTargetId] = useState(conjunction.norad_id_1);
  const [hoursBeforeTca, setHoursBeforeTca] = useState(2.0);
  const [dvRadial, setDvRadial] = useState(0.0);
  const [dvTransverse, setDvTransverse] = useState(0.0);
  const [dvNormal, setDvNormal] = useState(0.0);
  
  // Landscape params
  const [spanTransverse, setSpanTransverse] = useState(2.0);
  const [spanHours, setSpanHours] = useState(1.0);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const handleSimulateSingle = async () => {
    try {
      setLoading(true);
      setError(null);
      setResults(null);
      
      const payload = {
        target_norad_id: parseInt(targetId),
        dv_radial_m_s: parseFloat(dvRadial),
        dv_transverse_m_s: parseFloat(dvTransverse),
        dv_normal_m_s: parseFloat(dvNormal),
        hours_before_tca: parseFloat(hoursBeforeTca)
      };

      const res = await fetch(`/api/v1/what-if/conjunctions/${conjunction.id}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error((await res.json()).detail || 'Simulation failed');
      const data = await res.json();
      setResults({ type: 'single', data });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateLandscape = async () => {
    try {
      setLoading(true);
      setError(null);
      setResults(null);
      
      const payload = {
        target_norad_id: parseInt(targetId),
        dv_radial_m_s: parseFloat(dvRadial),
        dv_normal_m_s: parseFloat(dvNormal),
        center_dv_transverse_m_s: parseFloat(dvTransverse),
        span_dv_transverse_m_s: parseFloat(spanTransverse),
        center_hours: parseFloat(hoursBeforeTca),
        span_hours: parseFloat(spanHours),
        resolution: 5
      };

      const res = await fetch(`/api/v1/what-if/conjunctions/${conjunction.id}/robustness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error((await res.json()).detail || 'Simulation failed');
      const data = await res.json();
      setResults({ type: 'landscape', data });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderGridCell = (cell) => {
    if (!cell.success) return <div className="bg-slate-800 border border-slate-700 m-0.5 rounded" title="No Solution"></div>;
    
    let colorClass = "bg-emerald-500 hover:bg-emerald-400"; // ROBUST_SAFE
    if (cell.status === "UNSTABLE_SECONDARY") colorClass = "bg-red-500 hover:bg-red-400";
    else if (cell.status === "UNSTABLE_PRIMARY_INCREASE") colorClass = "bg-yellow-500 hover:bg-yellow-400";
    
    return (
      <div 
        key={`${cell.dv_transverse}-${cell.hours_before_tca}`}
        className={cn("border border-black/20 m-0.5 rounded cursor-pointer transition-colors relative group", colorClass)}
        title={`ΔV: ${cell.dv_transverse.toFixed(2)} m/s, Time: ${cell.hours_before_tca.toFixed(1)}h\nPc: ${cell.primary_pc.toExponential(2)}\nStatus: ${cell.status}`}
      >
        {/* Tooltip on hover */}
        <div className="absolute opacity-0 group-hover:opacity-100 bg-slate-900 border border-slate-600 text-white text-[10px] rounded p-2 z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 pointer-events-none shadow-xl">
          <p className="font-bold border-b border-slate-700 pb-1 mb-1">{cell.status}</p>
          <div className="flex justify-between"><span className="text-slate-400">ΔV_T:</span> <span>{cell.dv_transverse.toFixed(2)} m/s</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Time:</span> <span>T-{cell.hours_before_tca.toFixed(1)}h</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Pc:</span> <span>{cell.primary_pc.toExponential(2)}</span></div>
        </div>
      </div>
    );
  };

  const renderLandscapeGrid = () => {
    if (!results || results.type !== 'landscape') return null;
    const { grid, resolution } = results.data;
    
    // Group by time (Y axis) and sort descending (so highest time is at top)
    const timeGroups = {};
    grid.forEach(cell => {
      const t = cell.hours_before_tca.toFixed(2);
      if (!timeGroups[t]) timeGroups[t] = [];
      timeGroups[t].push(cell);
    });
    
    const sortedTimes = Object.keys(timeGroups).map(Number).sort((a,b) => b-a);
    
    // Sort each row by dv (X axis) ascending
    sortedTimes.forEach(t => {
      timeGroups[t].sort((a,b) => a.dv_transverse - b.dv_transverse);
    });

    return (
      <div className="flex flex-col items-center p-4 bg-slate-900/50 rounded border border-slate-700 mt-4">
        <h4 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-widest text-center">Safety Landscape Grid</h4>
        
        <div className="flex">
          {/* Y Axis Label */}
          <div className="flex flex-col justify-between items-end pr-3 py-2 text-[10px] font-mono text-slate-400">
            {sortedTimes.map(t => <span key={t}>T-{t.toFixed(1)}h</span>)}
          </div>
          
          {/* Grid Area */}
          <div className="flex flex-col">
            {sortedTimes.map(t => (
              <div key={t} className="flex" style={{ height: '40px' }}>
                {timeGroups[t].map(cell => (
                  <div key={`${cell.dv_transverse}-${cell.hours_before_tca}`} style={{ width: '40px', height: '100%' }}>
                    {renderGridCell(cell)}
                  </div>
                ))}
              </div>
            ))}
            
            {/* X Axis Label */}
            <div className="flex justify-between mt-2 text-[10px] font-mono text-slate-400 px-2" style={{ width: `${resolution * 40}px` }}>
               {timeGroups[sortedTimes[0]].map((c, i) => {
                 if (i === 0 || i === resolution - 1 || i === Math.floor(resolution/2)) {
                   return <span key={i} className="text-center" style={{ width: '40px' }}>{c.dv_transverse.toFixed(1)}</span>;
                 }
                 return <span key={i} style={{ width: '40px' }}></span>;
               })}
            </div>
            <div className="text-center text-[10px] text-slate-500 uppercase mt-1">Transverse ΔV (m/s)</div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex gap-4 mt-6 text-[10px] uppercase font-bold tracking-wider">
           <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div> Robust Safe</div>
           <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-500 rounded-sm"></div> Primary Risk ↑</div>
           <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> Secondary Risk</div>
        </div>
        
        {/* Best Candidate Summary */}
        {results.data.best_candidate && (
          <div className="mt-6 p-3 bg-emerald-900/20 border border-emerald-500/30 rounded w-full">
            <h5 className="text-emerald-400 font-bold text-xs uppercase tracking-widest mb-2">Recommended Candidate</h5>
            <div className="grid grid-cols-3 gap-2 text-sm font-mono">
              <div><span className="text-slate-500 block text-xs">ΔV_T</span> <span className="text-white">{results.data.best_candidate.dv_transverse.toFixed(2)} m/s</span></div>
              <div><span className="text-slate-500 block text-xs">Time</span> <span className="text-white">T-{results.data.best_candidate.hours_before_tca.toFixed(1)}h</span></div>
              <div><span className="text-slate-500 block text-xs">Final Pc</span> <span className="text-emerald-400">{results.data.best_candidate.primary_pc.toExponential(2)}</span></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSingleResults = () => {
    if (!results || results.type !== 'single') return null;
    const res = results.data;
    return (
      <div className="space-y-6">
        {/* Decision Badge */}
        <div className={cn(
          "p-4 rounded-lg flex items-center gap-4 border",
          res.decision === 'IMPROVED' ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" :
          res.decision === 'NEUTRAL' ? "bg-yellow-500/10 border-yellow-500/50 text-yellow-400" :
          "bg-red-500/10 border-red-500/50 text-red-400"
        )}>
          {res.decision === 'IMPROVED' ? <CheckCircle size={32} /> :
           res.decision === 'NEUTRAL' ? <AlertTriangle size={32} /> :
           <ShieldAlert size={32} />}
          <div>
            <h3 className="font-bold text-lg">{res.decision}</h3>
            <p className="text-sm opacity-80">{res.decision_reason}</p>
          </div>
        </div>
        
        {/* Comparison Table */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-slate-900/50 rounded border border-slate-700">
            <h4 className="text-xs uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-700 pb-1">Current State</h4>
            <div className="space-y-1 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Pc</span>
                <span className="text-orange-400">{res.current.pc.toExponential(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Miss Dist</span>
                <span className="text-white">{res.current.miss_dist_km.toFixed(3)} km</span>
              </div>
            </div>
          </div>
          
          <div className="p-3 bg-slate-900/50 rounded border border-slate-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-1 bg-cyan-500/20 text-cyan-400 text-[9px] uppercase font-bold rounded-bl">Scenario</div>
            <h4 className="text-xs uppercase tracking-widest text-cyan-400 mb-2 border-b border-slate-700 pb-1">Modified State</h4>
            <div className="space-y-1 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Pc</span>
                <span className={cn(
                  "font-bold",
                  res.scenario.pc < res.current.pc ? "text-emerald-400" : "text-red-400"
                )}>{res.scenario.pc.toExponential(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Miss Dist</span>
                <span className={cn(
                  "font-bold",
                  res.scenario.miss_dist_km > res.current.miss_dist_km ? "text-emerald-400" : "text-red-400"
                )}>{res.scenario.miss_dist_km.toFixed(3)} km</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Secondary Risks */}
        <div className="p-3 bg-slate-900/50 rounded border border-slate-700">
           <h4 className="text-xs uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-700 pb-1 flex justify-between">
             <span>Secondary Collision Risks (+12 Hours)</span>
             <span className="text-slate-500">KD-Tree Catalog Sweep</span>
           </h4>
           {res.secondary_risks.length === 0 ? (
             <div className="text-emerald-400 text-sm font-mono flex items-center gap-2">
               <CheckCircle size={16} /> No secondary risks &lt; 5km detected.
             </div>
           ) : (
             <div className="space-y-2">
               {res.secondary_risks.map(sr => (
                 <div key={sr.norad_id} className="flex items-center justify-between p-2 bg-red-900/20 border border-red-500/30 rounded text-sm font-mono">
                   <div className="flex items-center gap-2">
                     <AlertTriangle size={14} className="text-red-400" />
                     <span className="text-red-200">[{sr.norad_id}] {sr.name}</span>
                   </div>
                   <div className="flex items-center gap-4">
                     <span className="text-slate-400 text-xs">{sr.tca}</span>
                     <span className="text-red-400 font-bold">{sr.miss_dist_km.toFixed(2)} km</span>
                   </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-lg w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header Banner */}
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-yellow-500" size={24} />
            <div>
              <h2 className="text-yellow-500 font-bold uppercase tracking-wider text-sm">What-If Maneuver Sandbox & Robustness Analyzer</h2>
              <p className="text-yellow-500/70 text-xs font-mono">SIMULATION ESTIMATE ONLY. NOT FOR DIRECT SPACECRAFT CONTROL.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white px-3 py-1 bg-white/5 rounded text-xs font-bold">CLOSE</button>
        </div>

        {/* Mode Toggle */}
        <div className="bg-slate-800 border-b border-slate-700 flex p-1">
          <button 
            onClick={() => setMode('single')} 
            className={cn("flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2", mode === 'single' ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200")}
          >
            <Minimize size={14} /> Single Simulation
          </button>
          <button 
            onClick={() => setMode('landscape')} 
            className={cn("flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2", mode === 'landscape' ? "bg-cyan-900/50 text-cyan-400" : "text-slate-400 hover:text-slate-200")}
          >
            <Grid size={14} /> Robustness Landscape
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col md:flex-row gap-6">
          
          {/* Controls Panel */}
          <div className="w-full md:w-1/3 space-y-4">
            <div className="p-3 bg-black/40 rounded border border-white/5">
              <label className="block text-xs font-mono text-slate-400 mb-1">Target Object for Maneuver</label>
              <select 
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-slate-800 text-white border border-slate-600 rounded p-1.5 text-xs font-mono outline-none"
              >
                <option value={conjunction.norad_id_1}>{conjunction.object_1?.name || conjunction.norad_id_1}</option>
                <option value={conjunction.norad_id_2}>{conjunction.object_2?.name || conjunction.norad_id_2}</option>
              </select>
            </div>

            <div className="p-3 bg-black/40 rounded border border-white/5 space-y-3">
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest border-b border-white/10 pb-1">Maneuver Center</label>
              <div>
                <label className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Execution (Hours before TCA)</span>
                  <span className="text-cyan-400 font-mono">{hoursBeforeTca}h</span>
                </label>
                <input 
                  type="range" min="0.1" max="24" step="0.1" 
                  value={hoursBeforeTca} onChange={(e) => setHoursBeforeTca(e.target.value)}
                  className="w-full accent-cyan-500"
                />
              </div>
              
              <div>
                <label className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Transverse ΔV (m/s)</span>
                  <span className="text-emerald-400 font-mono">{dvTransverse}</span>
                </label>
                <input 
                  type="range" min="-5" max="5" step="0.1" 
                  value={dvTransverse} onChange={(e) => setDvTransverse(e.target.value)}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            {mode === 'landscape' && (
              <div className="p-3 bg-cyan-900/10 rounded border border-cyan-500/30 space-y-3">
                <label className="block text-xs font-mono text-cyan-400 uppercase tracking-widest border-b border-cyan-500/20 pb-1">Landscape Sweep Spans</label>
                <div>
                  <label className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Execution Span (± hours)</span>
                    <span className="text-cyan-400 font-mono">±{spanHours}h</span>
                  </label>
                  <input 
                    type="range" min="0.5" max="12" step="0.5" 
                    value={spanHours} onChange={(e) => setSpanHours(e.target.value)}
                    className="w-full accent-cyan-500"
                  />
                </div>
                <div>
                  <label className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Transverse ΔV Span (± m/s)</span>
                    <span className="text-emerald-400 font-mono">±{spanTransverse}</span>
                  </label>
                  <input 
                    type="range" min="0.5" max="5" step="0.5" 
                    value={spanTransverse} onChange={(e) => setSpanTransverse(e.target.value)}
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div className="text-[10px] text-slate-500 italic mt-2">
                  Computes a 5x5 grid (25 parallel scenarios) across these spans.
                </div>
              </div>
            )}

            <button 
              onClick={mode === 'single' ? handleSimulateSingle : handleSimulateLandscape}
              disabled={loading}
              className={cn(
                "w-full py-3 text-white rounded font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50",
                mode === 'single' ? "bg-cyan-600 hover:bg-cyan-500" : "bg-emerald-600 hover:bg-emerald-500"
              )}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {loading ? 'Simulating...' : (mode === 'single' ? 'Run Single Scenario' : 'Generate Robustness Landscape')}
            </button>
            
            {error && (
              <div className="p-2 bg-red-500/20 border border-red-500 text-red-300 text-xs rounded break-words">
                {error}
              </div>
            )}
          </div>
          
          {/* Results Panel */}
          <div className="w-full md:w-2/3 bg-black/20 rounded border border-white/5 p-4 flex flex-col overflow-y-auto">
            {!results && !loading && (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <Crosshair size={48} className="mb-4 opacity-50" />
                <p className="font-mono text-sm text-center">
                  {mode === 'single' ? 'Configure parameters and run a single simulation.' : 'Configure center point and spans to generate a safety landscape map.'}
                </p>
              </div>
            )}
            
            {loading && (
              <div className="flex-1 flex flex-col items-center justify-center text-cyan-500 space-y-4">
                <Loader2 size={48} className="animate-spin" />
                <p className="font-mono text-sm animate-pulse text-center">
                  {mode === 'single' ? 'Integrating Modified Orbit (DOP853) & Sweeping Catalog...' : 'Farming 25 High-Fidelity Integrations to Parallel Processors...'}
                </p>
              </div>
            )}
            
            {!loading && mode === 'single' && renderSingleResults()}
            {!loading && mode === 'landscape' && renderLandscapeGrid()}
          </div>

        </div>
      </div>
    </div>
  );
}
