import React, { useState } from 'react';
import { Wrench, Rocket, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function CAMSolverView({ conjunction, conjunctions }) {
  const [selectedId, setSelectedId] = useState(conjunction?.id || null);
  const [hoursToTca, setHoursToTca] = useState(6);
  const [targetMiss, setTargetMiss] = useState(1000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const activeConj = conjunctions?.find(c => c.id === selectedId) || conjunction;

  const runSolver = async () => {
    if (!activeConj) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/v1/conjunctions/${activeConj.id}/cam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hours_to_tca: hoursToTca,
          target_miss_distance_m: targetMiss,
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[var(--color-void)]">
      {/* Left: Conjunction Selector */}
      <div className="w-72 border-r border-white/5 bg-black/40 overflow-y-auto">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">SELECT EVENT</h3>
        </div>
        {conjunctions?.map(c => (
          <button
            key={c.id}
            onClick={() => { setSelectedId(c.id); setResult(null); }}
            className={`w-full text-left px-4 py-3 border-b border-white/[0.03] transition-colors text-xs font-mono ${
              selectedId === c.id
                ? 'bg-cyan-500/10 text-cyan-300 border-l-2 border-l-cyan-400'
                : 'text-white/60 hover:bg-white/[0.03] border-l-2 border-l-transparent'
            }`}
          >
            <div className="font-semibold text-[11px]">
              {c.object_1?.name || c.norad_id_1} × {c.object_2?.name || c.norad_id_2}
            </div>
            <div className="text-[9px] text-white/40 mt-0.5">
              Pc: {c.pc?.toExponential(2)} · Miss: {(c.min_dist_km * 1000).toFixed(0)}m
            </div>
          </button>
        ))}
      </div>

      {/* Center: CAM Solver */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {!activeConj ? (
          <div className="text-center text-white/30 font-mono uppercase tracking-widest text-xs space-y-3">
            <Wrench size={48} className="mx-auto mb-4 opacity-30" />
            <div>Select a conjunction to compute CAM</div>
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-6">
            <h2 className="text-lg font-bold tracking-widest uppercase text-white flex items-center gap-2">
              <Wrench className="text-purple-400" size={20} />
              COLLISION AVOIDANCE MANEUVER SOLVER
            </h2>

            {/* Event Summary */}
            <div className="bg-black/40 border border-white/10 rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3 font-semibold">Active Event</div>
              <div className="grid grid-cols-4 gap-4 text-xs font-mono">
                <div>
                  <div className="text-[9px] text-white/40 uppercase">Pair</div>
                  <div className="text-white/90 font-bold">{activeConj.object_1?.name || activeConj.norad_id_1}</div>
                  <div className="text-white/50">× {activeConj.object_2?.name || activeConj.norad_id_2}</div>
                </div>
                <div>
                  <div className="text-[9px] text-white/40 uppercase">Current Miss</div>
                  <div className="text-red-400 font-bold">{(activeConj.min_dist_km * 1000).toFixed(1)} m</div>
                </div>
                <div>
                  <div className="text-[9px] text-white/40 uppercase">Pc</div>
                  <div className="text-orange-400 font-bold">{activeConj.pc?.toExponential(3)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-white/40 uppercase">TCA</div>
                  <div className="text-white/70">{new Date(activeConj.tca).toISOString().replace('T', ' ').substring(0, 19)}</div>
                </div>
              </div>
            </div>

            {/* Solver Inputs */}
            <div className="bg-black/40 border border-white/10 rounded-lg p-4 space-y-4">
              <div className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">Maneuver Parameters</div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/50 mb-1.5 font-semibold">Hours Before TCA</label>
                  <input
                    type="number"
                    value={hoursToTca}
                    onChange={e => setHoursToTca(Number(e.target.value))}
                    min={1} max={72} step={1}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/50 mb-1.5 font-semibold">Target Miss Distance (m)</label>
                  <input
                    type="number"
                    value={targetMiss}
                    onChange={e => setTargetMiss(Number(e.target.value))}
                    min={100} max={50000} step={100}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent"
                  />
                </div>
              </div>

              <button
                onClick={runSolver}
                disabled={loading}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 rounded-lg text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Computing Optimal ΔV...</>
                ) : (
                  <><Rocket size={16} /> Compute CAM Solution</>
                )}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-4 text-sm text-red-300 flex items-start gap-2">
                <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                <span>Solver error: {error}</span>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="bg-black/40 border border-emerald-500/30 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400" />
                  <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Solution Found</span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                  <div className="bg-white/5 rounded p-3 text-center">
                    <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">ΔV REQUIRED</div>
                    <div className="text-emerald-300 font-bold text-lg">{result.delta_v_m_s?.toFixed(4)}</div>
                    <div className="text-white/40 text-[10px]">m/s</div>
                  </div>
                  <div className="bg-white/5 rounded p-3 text-center">
                    <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">BURN DIRECTION</div>
                    <div className="text-cyan-300 font-bold">{result.direction || 'IN-TRACK'}</div>
                  </div>
                  <div className="bg-white/5 rounded p-3 text-center">
                    <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">POST-CAM MISS</div>
                    <div className="text-white font-bold">{result.post_cam_miss_distance_m?.toFixed(0) || targetMiss}</div>
                    <div className="text-white/40 text-[10px]">meters</div>
                  </div>
                </div>

                {result.fuel_mass_kg !== undefined && (
                  <div className="text-xs font-mono text-white/50 bg-white/5 rounded p-3">
                    <span className="text-white/40">Estimated fuel mass: </span>
                    <span className="text-amber-300 font-bold">{result.fuel_mass_kg?.toFixed(4)} kg</span>
                    <span className="text-white/30"> (assuming 300s Isp, 500kg spacecraft)</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
