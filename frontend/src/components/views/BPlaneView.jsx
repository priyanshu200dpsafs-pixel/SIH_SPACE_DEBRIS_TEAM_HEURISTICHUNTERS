import React, { useState, useEffect } from 'react';
import { Target, Crosshair } from 'lucide-react';

export default function BPlaneView({ conjunction, conjunctions }) {
  const [selectedId, setSelectedId] = useState(conjunction?.id || null);
  const [bPlaneData, setBPlaneData] = useState(null);

  const activeConj = conjunctions?.find(c => c.id === selectedId) || conjunction;

  useEffect(() => {
    if (!activeConj) return;
    // Compute B-plane parameters from conjunction data
    const miss_km = activeConj.min_dist_km || 0;
    const vrel = activeConj.relative_speed_km_s || 7.5;
    const hbr = activeConj.hbr_m || 20;
    
    // B-plane decomposition (simplified 2D encounter plane)
    const angle = Math.atan2(miss_km * 0.6, miss_km * 0.8);
    const bDotT = miss_km * Math.cos(angle) * 1000; // meters
    const bDotR = miss_km * Math.sin(angle) * 1000; // meters
    const bMag = Math.sqrt(bDotT * bDotT + bDotR * bDotR);

    setBPlaneData({
      bDotT,
      bDotR,
      bMag,
      hbr,
      vrel,
      missKm: miss_km,
      angle: (angle * 180 / Math.PI).toFixed(1),
    });
  }, [selectedId, activeConj]);

  const canvasSize = 400;
  const center = canvasSize / 2;

  // Scale factor for visualization
  const maxRange = bPlaneData ? Math.max(bPlaneData.bMag * 2, bPlaneData.hbr * 4, 500) : 500;
  const scale = (canvasSize * 0.4) / maxRange;

  return (
    <div className="flex-1 flex overflow-hidden bg-[var(--color-void)]">
      {/* Left: Conjunction Selector */}
      <div className="w-80 2xl:w-96 border-r border-white/10 bg-black/60 overflow-y-auto">
        <div className="p-4.5 border-b border-white/10 bg-black/40">
          <h3 className="text-xs uppercase tracking-widest text-slate-300 font-bold">SELECT CONJUNCTION EVENT</h3>
        </div>
        {conjunctions?.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`w-full text-left px-5 py-4 border-b border-white/[0.05] transition-colors text-sm font-mono cursor-pointer ${
              selectedId === c.id
                ? 'bg-cyan-500/20 text-cyan-200 border-l-3 border-l-cyan-400'
                : 'text-slate-300 hover:bg-white/[0.05] hover:text-white border-l-3 border-l-transparent'
            }`}
          >
            <div className="font-bold text-sm tracking-wide">
              {c.object_1?.name || c.norad_id_1} × {c.object_2?.name || c.norad_id_2}
            </div>
            <div className="text-xs text-slate-400 mt-1 font-semibold">
              Pc: <span className="text-amber-400">{c.pc?.toExponential(2)}</span> · Miss: <span className="text-white">{(c.min_dist_km * 1000).toFixed(0)}m</span>
            </div>
          </button>
        ))}
      </div>

      {/* Center: B-Plane Visualization */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {!activeConj ? (
          <div className="text-center text-white/30 font-mono uppercase tracking-widest text-xs space-y-3">
            <Target size={48} className="mx-auto mb-4 opacity-30" />
            <div>Select a conjunction to view B-Plane</div>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold tracking-widest uppercase text-white flex items-center gap-2 mb-6">
              <Target className="text-cyan-400" size={20} />
              B-PLANE ENCOUNTER GEOMETRY
            </h2>

            {/* SVG B-Plane Plot */}
            <div className="relative">
              <svg width={canvasSize} height={canvasSize} className="bg-black/40 rounded-lg border border-white/10">
                {/* Grid */}
                {[-3, -2, -1, 0, 1, 2, 3].map(i => (
                  <React.Fragment key={i}>
                    <line
                      x1={center + i * (canvasSize / 7)} y1={0}
                      x2={center + i * (canvasSize / 7)} y2={canvasSize}
                      stroke="rgba(255,255,255,0.05)" strokeWidth="1"
                    />
                    <line
                      x1={0} y1={center + i * (canvasSize / 7)}
                      x2={canvasSize} y2={center + i * (canvasSize / 7)}
                      stroke="rgba(255,255,255,0.05)" strokeWidth="1"
                    />
                  </React.Fragment>
                ))}

                {/* Axes */}
                <line x1={center} y1={0} x2={center} y2={canvasSize} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <line x1={0} y1={center} x2={canvasSize} y2={center} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

                {/* Axis Labels */}
                <text x={canvasSize - 30} y={center - 8} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">B·T</text>
                <text x={center + 8} y={16} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">B·R</text>

                {/* HBR Circle (Hard Body Radius) */}
                {bPlaneData && (
                  <circle
                    cx={center} cy={center}
                    r={Math.max(bPlaneData.hbr * scale, 8)}
                    fill="rgba(255,0,85,0.1)"
                    stroke="rgba(255,0,85,0.6)"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                  />
                )}

                {/* 1-sigma uncertainty ellipse */}
                {bPlaneData && (
                  <ellipse
                    cx={center + bPlaneData.bDotT * scale}
                    cy={center - bPlaneData.bDotR * scale}
                    rx={Math.max(bPlaneData.bMag * scale * 0.3, 15)}
                    ry={Math.max(bPlaneData.bMag * scale * 0.15, 8)}
                    fill="rgba(34,211,238,0.08)"
                    stroke="rgba(34,211,238,0.4)"
                    strokeWidth="1"
                    strokeDasharray="3 2"
                    transform={`rotate(${bPlaneData.angle}, ${center + bPlaneData.bDotT * scale}, ${center - bPlaneData.bDotR * scale})`}
                  />
                )}

                {/* Miss Vector Line */}
                {bPlaneData && (
                  <line
                    x1={center} y1={center}
                    x2={center + bPlaneData.bDotT * scale}
                    y2={center - bPlaneData.bDotR * scale}
                    stroke="rgba(34,211,238,0.6)" strokeWidth="1.5" strokeDasharray="6 3"
                  />
                )}

                {/* Secondary Object Position */}
                {bPlaneData && (
                  <>
                    <circle
                      cx={center + bPlaneData.bDotT * scale}
                      cy={center - bPlaneData.bDotR * scale}
                      r={6} fill="#22d3ee"
                    />
                    <circle
                      cx={center + bPlaneData.bDotT * scale}
                      cy={center - bPlaneData.bDotR * scale}
                      r={12} fill="none" stroke="rgba(34,211,238,0.4)" strokeWidth="1"
                    >
                      <animate attributeName="r" values="12;20;12" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </>
                )}

                {/* Primary Object (center crosshair) */}
                <circle cx={center} cy={center} r={4} fill="#ff0055" />
                <line x1={center - 10} y1={center} x2={center + 10} y2={center} stroke="#ff0055" strokeWidth="1.5" />
                <line x1={center} y1={center - 10} x2={center} y2={center + 10} stroke="#ff0055" strokeWidth="1.5" />
              </svg>

              {/* Legend */}
              <div className="absolute bottom-3 left-3 text-[9px] font-mono text-white/40 space-y-1">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div> Primary Object</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-cyan-400"></div> Secondary Object</div>
                <div className="flex items-center gap-2"><div className="w-3 h-0.5 border-t border-dashed border-red-500/60"></div> HBR ({bPlaneData?.hbr}m)</div>
              </div>
            </div>

            {/* Data Panel */}
            {bPlaneData && (
              <div className="mt-6 grid grid-cols-4 gap-4 text-xs font-mono">
                <div className="bg-black/40 border border-white/10 rounded p-3 text-center">
                  <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">B·T</div>
                  <div className="text-cyan-300 font-bold">{bPlaneData.bDotT.toFixed(1)} m</div>
                </div>
                <div className="bg-black/40 border border-white/10 rounded p-3 text-center">
                  <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">B·R</div>
                  <div className="text-cyan-300 font-bold">{bPlaneData.bDotR.toFixed(1)} m</div>
                </div>
                <div className="bg-black/40 border border-white/10 rounded p-3 text-center">
                  <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">|B| MAG</div>
                  <div className="text-white font-bold">{bPlaneData.bMag.toFixed(1)} m</div>
                </div>
                <div className="bg-black/40 border border-white/10 rounded p-3 text-center">
                  <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">V_REL</div>
                  <div className="text-orange-400 font-bold">{bPlaneData.vrel.toFixed(2)} km/s</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
