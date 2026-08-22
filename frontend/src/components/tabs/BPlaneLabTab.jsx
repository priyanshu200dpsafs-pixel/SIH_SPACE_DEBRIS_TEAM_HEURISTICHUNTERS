import React, { useState, useEffect } from 'react';

export default function BPlaneLabTab({ selectedConjunctionId, navigateTo }) {
  const [conjunction, setConjunction] = useState(null);

  useEffect(() => {
    if (selectedConjunctionId) {
      fetch(`http://localhost:8000/api/v1/conjunctions/${selectedConjunctionId}`)
        .then(res => res.json())
        .then(data => setConjunction(data))
        .catch(err => console.error(err));
    }
  }, [selectedConjunctionId]);

  if (!selectedConjunctionId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-void)] tab-content">
        <div className="glass-panel border-amber-500/20 p-8 text-center animate-fadeInUp">
          <h2 className="text-amber-400 font-mono text-xl font-bold tracking-widest mb-4">NO TARGET SELECTED</h2>
          <p className="text-slate-400 font-mono mb-6">Select a conjunction from the Threat Matrix to analyze its B-Plane geometry.</p>
          <button 
            onClick={() => navigateTo('matrix')}
            className="glass-panel hover:bg-cyan-500/10 text-cyan-300 px-6 py-2 font-mono text-[11px] tracking-wider transition-all duration-300"
          >
            GO TO THREAT MATRIX
          </button>
        </div>
      </div>
    );
  }

  if (!conjunction) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-void)]">
        <div className="text-cyan-500 font-mono animate-pulse">Loading geometric data...</div>
      </div>
    );
  }

  const missDistanceKm = conjunction.min_dist_km || 0;
  const hbrKm = (conjunction.hbr_m || 20) / 1000;
  const sigmaKm = 5.0; // Simulated combined covariance
  
  const maxScale = Math.max(missDistanceKm + sigmaKm * 3, 20);
  const svgSize = 500;
  const center = svgSize / 2;
  const pixelsPerKm = (svgSize / 2 - 20) / maxScale;

  const secX = center + missDistanceKm * pixelsPerKm;
  const secY = center;

  return (
    <div className="w-full h-full p-6 bg-[var(--color-void)] overflow-auto flex flex-col items-center tab-content">
      <div className="w-full max-w-4xl glass-panel-bright p-6 animate-fadeInUp">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-cyan-500/30 pb-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wider font-mono">B-PLANE LAB</h2>
            <div className="text-sm text-cyan-400 font-mono mt-1">
              TARGET: {conjunction.object_1?.name || conjunction.norad_id_1} ⚡ {conjunction.object_2?.name || conjunction.norad_id_2}
            </div>
          </div>
          <button 
            onClick={() => navigateTo('cam')}
            className="bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-500/50 text-emerald-300 px-4 py-2 font-mono tracking-wider transition-colors rounded"
          >
            PROCEED TO CAM SOLVER &rarr;
          </button>
        </div>

        {/* SVG Plot */}
        <div className="flex justify-center bg-black/50 rounded-lg border border-slate-700/50 relative overflow-hidden p-8 mb-6">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: 'linear-gradient(rgba(34,211,238,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.2) 1px, transparent 1px)', backgroundSize: '25px 25px' }}></div>
          
          <svg width={svgSize} height={svgSize} className="relative z-10 font-mono">
            {/* Axes */}
            <line x1={0} y1={center} x2={svgSize} y2={center} stroke="rgba(34,211,238,0.3)" strokeWidth="1" strokeDasharray="4 4" />
            <line x1={center} y1={0} x2={center} y2={svgSize} stroke="rgba(34,211,238,0.3)" strokeWidth="1" strokeDasharray="4 4" />
            
            {/* 3-Sigma Region */}
            <circle cx={center} cy={center} r={sigmaKm * 3 * pixelsPerKm} fill="rgba(34,211,238,0.05)" stroke="rgba(34,211,238,0.2)" strokeWidth="1" strokeDasharray="2 2" />
            <text x={center} y={center - sigmaKm * 3 * pixelsPerKm - 5} fill="rgba(34,211,238,0.5)" fontSize="10" textAnchor="middle">3σ Boundary</text>

            {/* 1-Sigma Region */}
            <circle cx={center} cy={center} r={sigmaKm * pixelsPerKm} fill="rgba(34,211,238,0.1)" stroke="rgba(34,211,238,0.4)" strokeWidth="1" />
            <text x={center} y={center - sigmaKm * pixelsPerKm - 5} fill="rgba(34,211,238,0.8)" fontSize="10" textAnchor="middle">1σ Covariance</text>

            {/* Primary Object */}
            <circle cx={center} cy={center} r={4} fill="#fff" />
            <text x={center + 10} y={center - 10} fill="#fff" fontSize="12" fontWeight="bold">Primary</text>
            
            {/* Secondary Object */}
            <circle cx={secX} cy={secY} r={4} fill="#ef4444" />
            <text x={secX + 10} y={secY - 10} fill="#ef4444" fontSize="12" fontWeight="bold">Secondary</text>

            {/* Miss Distance Line */}
            <line x1={center} y1={center} x2={secX} y2={secY} stroke="#f59e0b" strokeWidth="2" />
            <text x={center + (secX - center) / 2} y={center - 15} fill="#f59e0b" fontSize="12" textAnchor="middle" fontWeight="bold">
              {missDistanceKm.toFixed(2)} km
            </text>
          </svg>
        </div>

        {/* Telemetry Data Footer */}
        <div className="grid grid-cols-4 gap-6 bg-slate-950/80 p-6 rounded border border-cyan-500/20 font-mono">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">PROBABILITY (Pc)</div>
            <div className={`text-xl font-bold ${conjunction.pc > 1e-4 ? 'text-red-400' : 'text-amber-400'}`}>
              {conjunction.pc < 1e-15 ? '< 1e-15' : conjunction.pc.toExponential(3)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">MISS DISTANCE</div>
            <div className="text-xl font-bold text-cyan-400">{missDistanceKm.toFixed(3)} km</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">REL VELOCITY</div>
            <div className="text-xl font-bold text-cyan-400">{conjunction.relative_speed_km_s.toFixed(2)} km/s</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">T.C.A. (ZULU)</div>
            <div className="text-lg font-bold text-cyan-400">{conjunction.tca.replace('T', ' ').substring(0, 19)}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
