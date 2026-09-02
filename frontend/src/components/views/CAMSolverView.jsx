import React, { useState, useEffect } from 'react';
import { Wrench, Rocket, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function CAMSolverView({ conjunction, conjunctions }) {
  const [localConjunctions, setLocalConjunctions] = useState(conjunctions || []);
  const [selectedId, setSelectedId] = useState(conjunction?.id || (conjunctions?.[0]?.id ?? null));
  const [hoursToTca, setHoursToTca] = useState(6);
  const [targetMiss, setTargetMiss] = useState(1000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (conjunctions && conjunctions.length > 0) {
      setLocalConjunctions(conjunctions);
      if (!selectedId) setSelectedId(conjunctions[0].id);
      return;
    }

    fetch('/api/v1/conjunctions?page=1&size=50')
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        if (items.length > 0) {
          setLocalConjunctions(items);
          setSelectedId(prev => prev || items[0].id);
        } else {
          const fallback = [
            {
              id: 'STARLINK-30411_STARLINK-32491',
              object_1: { name: 'STARLINK-30411', norad_id: 54321 },
              object_2: { name: 'STARLINK-32491', norad_id: 54399 },
              min_dist_km: 0.289,
              relative_speed_km_s: 12.85,
              hbr_m: 25,
              pc: 4.94e-6
            }
          ];
          setLocalConjunctions(fallback);
          setSelectedId(prev => prev || fallback[0].id);
        }
      })
      .catch(() => {
        const fallback = [
          {
            id: 'STARLINK-30411_STARLINK-32491',
            object_1: { name: 'STARLINK-30411', norad_id: 54321 },
            object_2: { name: 'STARLINK-32491', norad_id: 54399 },
            min_dist_km: 0.289,
            relative_speed_km_s: 12.85,
            hbr_m: 25,
            pc: 4.94e-6
          }
        ];
        setLocalConjunctions(fallback);
        setSelectedId(prev => prev || fallback[0].id);
      });
  }, [conjunctions]);

  useEffect(() => {
    if (conjunction?.id) {
      setSelectedId(conjunction.id);
    }
  }, [conjunction?.id]);

  const activeConj = localConjunctions?.find(c => c.id === selectedId) || conjunction || localConjunctions?.[0] || null;

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
      <div className="w-80 2xl:w-96 border-r border-white/10 bg-black/60 overflow-y-auto">
        <div className="p-4.5 border-b border-white/10 bg-black/40">
          <h3 className="text-xs uppercase tracking-widest text-slate-300 font-bold">SELECT CONJUNCTION EVENT</h3>
        </div>
        {localConjunctions?.map(c => (
          <button
            key={c.id}
            onClick={() => { setSelectedId(c.id); setResult(null); }}
            className={`w-full text-left px-5 py-4 border-b border-white/[0.05] transition-colors text-sm font-mono cursor-pointer ${
              selectedId === c.id
                ? 'bg-purple-500/20 text-purple-200 border-l-3 border-l-purple-400'
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

      {/* Center: CAM Solver */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
        {!activeConj ? (
          <div className="text-center text-slate-400 font-mono uppercase tracking-widest text-sm space-y-3">
            <Wrench size={52} className="mx-auto mb-4 opacity-40 text-purple-400" />
            <div>Select a conjunction from the list to compute CAM</div>
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-6">
            <h2 className="text-xl font-bold tracking-widest uppercase text-white flex items-center gap-3">
              <Wrench className="text-purple-400" size={24} />
              COLLISION AVOIDANCE MANEUVER SOLVER
            </h2>

            {/* Event Summary */}
            <div className="bg-black/60 border border-white/10 rounded-xl p-5 shadow-xl">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-3 font-bold">Active Encounter Summary</div>
              <div className="grid grid-cols-4 gap-4 text-xs font-mono">
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-semibold mb-0.5">Encounter Pair</div>
                  <div className="text-white font-bold text-sm truncate">{activeConj.object_1?.name || activeConj.norad_id_1}</div>
                  <div className="text-slate-400 text-xs truncate">× {activeConj.object_2?.name || activeConj.norad_id_2}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-semibold mb-0.5">Current Miss</div>
                  <div className="text-red-400 font-bold text-sm">{(activeConj.min_dist_km * 1000).toFixed(1)} m</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-semibold mb-0.5">Collision Prob (Pc)</div>
                  <div className="text-amber-400 font-bold text-sm">{activeConj.pc?.toExponential(3)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-semibold mb-0.5">Predicted TCA</div>
                  <div className="text-slate-200 text-xs font-semibold">{new Date(activeConj.tca).toISOString().replace('T', ' ').substring(0, 19)}</div>
                </div>
              </div>
            </div>

            {/* Solver Inputs */}
            <div className="bg-black/60 border border-white/10 rounded-xl p-5 space-y-5 shadow-xl">
              <div className="text-xs uppercase tracking-widest text-slate-300 font-bold">Maneuver Parameters</div>
              
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-300 mb-2 font-bold">Hours Before TCA (Burn Lead Time)</label>
                  <input
                    type="number"
                    value={hoursToTca}
                    onChange={e => setHoursToTca(Number(e.target.value))}
                    min={1} max={72} step={1}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-base text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-300 mb-2 font-bold">Target Miss Distance (Meters)</label>
                  <input
                    type="number"
                    value={targetMiss}
                    onChange={e => setTargetMiss(Number(e.target.value))}
                    min={100} max={50000} step={100}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-base text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent font-bold"
                  />
                </div>
              </div>

              <button
                onClick={runSolver}
                disabled={loading}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 disabled:opacity-50 rounded-lg text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-900/40 text-white"
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> Computing Optimal ΔV Vector...</>
                ) : (
                  <><Rocket size={18} /> Compute Optimal Avoidance Burn</>
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
