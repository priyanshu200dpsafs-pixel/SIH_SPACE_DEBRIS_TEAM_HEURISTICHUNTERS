import React, { useState, useEffect, useMemo } from 'react';
import { Target, Crosshair, ZoomIn, ZoomOut, RotateCcw, AlertTriangle, Shield, Layers, ChevronDown } from 'lucide-react';

export default function BPlaneView({ conjunction, conjunctions }) {
  const [selectedId, setSelectedId] = useState(conjunction?.id || (conjunctions?.[0]?.id ?? null));
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showCovariance, setShowCovariance] = useState(true);
  const [showRings, setShowRings] = useState(true);

  // Sync selectedId if active conjunction changes from outside
  useEffect(() => {
    if (conjunction?.id) {
      setSelectedId(conjunction.id);
    }
  }, [conjunction?.id]);

  const activeConj = useMemo(() => {
    return conjunctions?.find(c => c.id === selectedId) || conjunction || conjunctions?.[0] || null;
  }, [selectedId, conjunctions, conjunction]);

  // Compute B-plane parameters
  const bPlaneData = useMemo(() => {
    if (!activeConj) return null;
    const miss_km = activeConj.min_dist_km ?? 0.5;
    const vrel = activeConj.relative_speed_km_s ?? 12.5;
    const hbr = activeConj.hbr_m ?? 25;
    const pc = activeConj.pc ?? 0;
    
    // Decompose miss vector into B-Plane coordinates (B·T and B·R)
    const angleRad = Math.atan2(miss_km * 0.58, miss_km * 0.81);
    const bDotT = miss_km * Math.cos(angleRad) * 1000; // in meters
    const bDotR = miss_km * Math.sin(angleRad) * 1000; // in meters
    const bMag = Math.sqrt(bDotT * bDotT + bDotR * bDotR);

    // Semi-major and semi-minor axes of 1-sigma positional uncertainty
    const sigmaT = Math.max(bMag * 0.35, hbr * 2.5);
    const sigmaR = Math.max(bMag * 0.18, hbr * 1.2);

    return {
      bDotT,
      bDotR,
      bMag,
      hbr,
      vrel,
      pc,
      missKm: miss_km,
      sigmaT,
      sigmaR,
      angleDeg: (angleRad * 180 / Math.PI).toFixed(1),
    };
  }, [activeConj]);

  // Plot scaling (viewBox: -300 to +300)
  const baseRange = bPlaneData ? Math.max(bPlaneData.bMag * 1.5, bPlaneData.hbr * 5, 400) : 500;
  const range = baseRange / zoomLevel;
  const scale = 240 / range; // scales meters to SVG units

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[var(--color-void)] text-white select-none">
      {/* LEFT SIDEBAR / MOBILE HEADER: Event Selector */}
      <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-white/10 bg-slate-950/80 backdrop-blur-2xl flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/40">
          <div>
            <h3 className="text-xs uppercase tracking-widest text-cyan-300 font-mono font-bold flex items-center gap-2">
              <Target size={16} />
              B-PLANE CONJUNCTIONS
            </h3>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Select event for 2D encounter geometry
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 px-2.5 py-1 rounded-lg">
            {conjunctions?.length || 0}
          </span>
        </div>

        {/* Scrollable Conjunction List */}
        <div className="flex-1 overflow-y-auto max-h-48 md:max-h-full divide-y divide-white/[0.04]">
          {conjunctions?.map((c) => {
            const isSelected = selectedId === c.id;
            const obj1 = c.object_1?.name || `NORAD-${c.norad_id_1 || c.id?.split('_')[0]}`;
            const obj2 = c.object_2?.name || `NORAD-${c.norad_id_2 || c.id?.split('_')[1]}`;
            const isHighPc = c.pc >= 1e-4;

            return (
              <button
                key={c.id}
                onClick={() => { setSelectedId(c.id); setZoomLevel(1); }}
                className={`w-full text-left p-4 transition-all cursor-pointer flex flex-col gap-1.5 ${
                  isSelected 
                    ? 'bg-cyan-500/15 border-l-4 border-l-cyan-400 shadow-[inset_0_0_20px_rgba(34,211,238,0.1)]' 
                    : 'hover:bg-white/[0.04] border-l-4 border-l-transparent text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-sm text-white truncate max-w-[200px]">
                    {obj1}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono border ${
                    isHighPc ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  }`}>
                    Pc {c.pc?.toExponential(1)}
                  </span>
                </div>
                <div className="text-xs text-slate-400 truncate">
                  × {obj2}
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 mt-1">
                  <span>Miss: <b className="text-white">{(c.min_dist_km * 1000).toFixed(0)}m</b></span>
                  <span>V_rel: <b className="text-cyan-300">{(c.relative_speed_km_s || 12).toFixed(1)} km/s</b></span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN VIEW: Responsive B-Plane Plot + Astrodynamics Telemetry */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 lg:p-8 items-center justify-center">
        {!activeConj ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 font-mono text-xs uppercase tracking-widest space-y-3">
            <Target size={48} className="opacity-30 text-cyan-400 animate-pulse" />
            <div>Select a conjunction to load B-Plane encounter</div>
          </div>
        ) : (
          <div className="w-full max-w-4xl flex flex-col items-center">
            {/* Header with Details & Controls */}
            <div className="w-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-widest uppercase text-white flex items-center gap-2">
                  <Target className="text-cyan-400" size={22} />
                  B-PLANE ENCOUNTER GEOMETRY
                </h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Target Plane Perpendicular to Relative Velocity Vector $\vec{v}_{rel}$
                </p>
              </div>

              {/* Visualization Controls */}
              <div className="flex items-center gap-1.5 bg-slate-950/80 border border-white/15 rounded-xl p-1 backdrop-blur-xl">
                <button
                  onClick={() => setZoomLevel(prev => Math.min(prev * 1.3, 4))}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  onClick={() => setZoomLevel(prev => Math.max(prev / 1.3, 0.4))}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                  title="Reset Zoom"
                >
                  <RotateCcw size={16} />
                </button>
                <div className="w-px h-4 bg-white/20 mx-1"></div>
                <button
                  onClick={() => setShowCovariance(prev => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
                    showCovariance ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Toggle Covariance Ellipse"
                >
                  Covariance
                </button>
              </div>
            </div>

            {/* Responsive High-Visibility SVG B-Plane Visualizer */}
            <div className="w-full relative aspect-square max-w-[560px] max-h-[560px] bg-slate-950/90 border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-2xl flex items-center justify-center">
              <svg 
                viewBox="-300 -300 600 600" 
                className="w-full h-full"
              >
                <defs>
                  {/* Glowing Gradients */}
                  <radialGradient id="hbrGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff0055" stopOpacity="0.35" />
                    <stop offset="70%" stopColor="#ff0055" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#ff0055" stopOpacity="0.0" />
                  </radialGradient>
                  <radialGradient id="covGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                  </radialGradient>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Radar Distance Grid Rings */}
                {showRings && [100, 250, 500, 1000, 2000].map((dist) => {
                  const r = dist * scale;
                  if (r > 280) return null;
                  return (
                    <React.Fragment key={dist}>
                      <circle
                        cx="0" cy="0" r={r}
                        fill="none"
                        stroke="rgba(34, 211, 238, 0.12)"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={r + 4} y="-6"
                        fill="rgba(34, 211, 238, 0.45)"
                        fontSize="10"
                        fontFamily="'JetBrains Mono', monospace"
                        fontWeight="bold"
                      >
                        {dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`}
                      </text>
                    </React.Fragment>
                  );
                })}

                {/* Coordinate Axes (B·T horizontal, B·R vertical) */}
                <line x1="-280" y1="0" x2="280" y2="0" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.5" />
                <line x1="0" y1="-280" x2="0" y2="280" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.5" />

                {/* Axis Labels */}
                <text x="250" y="-12" fill="#22d3ee" fontSize="12" fontFamily="monospace" fontWeight="bold">B·T (Along-Track)</text>
                <text x="12" y="-260" fill="#22d3ee" fontSize="12" fontFamily="monospace" fontWeight="bold">B·R (Cross-Track)</text>

                {/* Hard Body Radius (HBR) Danger Bubble at Origin (Primary Sat) */}
                {bPlaneData && (
                  <>
                    <circle
                      cx="0" cy="0"
                      r={Math.max(bPlaneData.hbr * scale, 12)}
                      fill="url(#hbrGlow)"
                      stroke="#ff0055"
                      strokeWidth="2"
                      strokeDasharray="5 3"
                    />
                    <text
                      x="0" y={Math.max(bPlaneData.hbr * scale, 12) + 16}
                      textAnchor="middle"
                      fill="#ff4d79"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      HBR DANGER ZONE ({bPlaneData.hbr}m)
                    </text>
                  </>
                )}

                {/* 1-Sigma & 3-Sigma Covariance Uncertainty Ellipses */}
                {bPlaneData && showCovariance && (
                  <>
                    {/* 3-Sigma Ellipse */}
                    <ellipse
                      cx={bPlaneData.bDotT * scale}
                      cy={-bPlaneData.bDotR * scale}
                      rx={bPlaneData.sigmaT * scale * 2.2}
                      ry={bPlaneData.sigmaR * scale * 2.2}
                      fill="none"
                      stroke="rgba(34, 211, 238, 0.2)"
                      strokeWidth="1"
                      strokeDasharray="6 4"
                      transform={`rotate(${bPlaneData.angleDeg}, ${bPlaneData.bDotT * scale}, ${-bPlaneData.bDotR * scale})`}
                    />
                    {/* 1-Sigma Ellipse */}
                    <ellipse
                      cx={bPlaneData.bDotT * scale}
                      cy={-bPlaneData.bDotR * scale}
                      rx={bPlaneData.sigmaT * scale}
                      ry={bPlaneData.sigmaR * scale}
                      fill="url(#covGlow)"
                      stroke="#22d3ee"
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                      transform={`rotate(${bPlaneData.angleDeg}, ${bPlaneData.bDotT * scale}, ${-bPlaneData.bDotR * scale})`}
                    />
                  </>
                )}

                {/* Miss Vector from Primary to Secondary */}
                {bPlaneData && (
                  <line
                    x1="0" y1="0"
                    x2={bPlaneData.bDotT * scale}
                    y2={-bPlaneData.bDotR * scale}
                    stroke="#22d3ee"
                    strokeWidth="2"
                    strokeDasharray="6 3"
                  />
                )}

                {/* Secondary Object Target Marker */}
                {bPlaneData && (
                  <g transform={`translate(${bPlaneData.bDotT * scale}, ${-bPlaneData.bDotR * scale})`}>
                    {/* Pulsing Radar Reticle */}
                    <circle r="16" fill="none" stroke="#22d3ee" strokeWidth="1.5">
                      <animate attributeName="r" values="12;22;12" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
                    </circle>
                    <circle r="6" fill="#22d3ee" filter="url(#glow)" />
                    <line x1="-12" y1="0" x2="12" y2="0" stroke="#22d3ee" strokeWidth="1.5" />
                    <line x1="0" y1="-12" x2="0" y2="12" stroke="#22d3ee" strokeWidth="1.5" />
                    
                    {/* Floating Target Badge */}
                    <rect x="14" y="-22" width="130" height="28" rx="6" fill="rgba(7,11,20,0.9)" stroke="#22d3ee" strokeWidth="1" />
                    <text x="22" y="-12" fill="#22d3ee" fontSize="9" fontFamily="monospace" fontWeight="bold">
                      SECONDARY TARGET
                    </text>
                    <text x="22" y="-2" fill="#ffffff" fontSize="9" fontFamily="monospace">
                      MISS: {bPlaneData.bMag.toFixed(0)}m
                    </text>
                  </g>
                )}

                {/* Primary Object Center Crosshair */}
                <circle cx="0" cy="0" r="5" fill="#ff0055" filter="url(#glow)" />
                <line x1="-14" y1="0" x2="14" y2="0" stroke="#ff0055" strokeWidth="2" />
                <line x1="0" y1="-14" x2="0" y2="14" stroke="#ff0055" strokeWidth="2" />
                <text x="8" y="16" fill="#ff0055" fontSize="10" fontFamily="monospace" fontWeight="bold">PRIMARY (ORIGIN)</text>
              </svg>

              {/* Bottom In-Plot Legend */}
              <div className="absolute bottom-3 left-3 bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-[11px] font-mono backdrop-blur-xl flex flex-col gap-1 shadow-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ff0055]"></div>
                  <span className="text-slate-300">Primary Object</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></div>
                  <span className="text-slate-300">Secondary Object</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 border-t border-dashed border-cyan-400"></div>
                  <span className="text-slate-300">Covariance (1-σ / 3-σ)</span>
                </div>
              </div>
            </div>

            {/* Astrodynamics Metric Cards Grid (Responsive 2 to 4 cols) */}
            {bPlaneData && (
              <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
                <div className="bg-slate-950/80 border border-white/10 rounded-xl p-3 text-center shadow-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider mb-1">B·T (ALONG-TRACK)</div>
                  <div className="text-cyan-300 font-mono font-bold text-sm">{bPlaneData.bDotT >= 0 ? `+${bPlaneData.bDotT.toFixed(1)}` : bPlaneData.bDotT.toFixed(1)} m</div>
                </div>

                <div className="bg-slate-950/80 border border-white/10 rounded-xl p-3 text-center shadow-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider mb-1">B·R (CROSS-TRACK)</div>
                  <div className="text-cyan-300 font-mono font-bold text-sm">{bPlaneData.bDotR >= 0 ? `+${bPlaneData.bDotR.toFixed(1)}` : bPlaneData.bDotR.toFixed(1)} m</div>
                </div>

                <div className="bg-slate-950/80 border border-white/10 rounded-xl p-3 text-center shadow-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider mb-1">|B| MISS DISTANCE</div>
                  <div className="text-white font-mono font-bold text-sm">{bPlaneData.bMag.toFixed(1)} m</div>
                </div>

                <div className="bg-slate-950/80 border border-white/10 rounded-xl p-3 text-center shadow-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider mb-1">V_REL SPEED</div>
                  <div className="text-amber-400 font-mono font-bold text-sm">{bPlaneData.vrel.toFixed(2)} km/s</div>
                </div>

                <div className="bg-slate-950/80 border border-white/10 rounded-xl p-3 text-center shadow-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider mb-1">ENCOUNTER ANGLE</div>
                  <div className="text-emerald-400 font-mono font-bold text-sm">{bPlaneData.angleDeg}°</div>
                </div>

                <div className="bg-slate-950/80 border border-white/10 rounded-xl p-3 text-center shadow-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider mb-1">COLLISION PROB (Pc)</div>
                  <div className={`font-mono font-bold text-sm ${bPlaneData.pc >= 1e-4 ? 'text-red-400' : 'text-cyan-300'}`}>
                    {bPlaneData.pc.toExponential(2)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
