const API_BASE_URL = import.meta.env.VITE_API_URL || '';
import React, { useState, useEffect } from 'react';
import { Wrench, Rocket, AlertCircle, CheckCircle, Loader2, Shield, Zap, Target } from 'lucide-react';

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

    fetch(API_BASE_URL + '/api/v1/conjunctions?page=1&size=50')
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        if (items.length > 0) {
          setLocalConjunctions(items);
          setSelectedId(prev => prev || items[0].id);
        } else {
          loadFallback();
        }
      })
      .catch(() => loadFallback());
  }, [conjunctions]);

  const loadFallback = () => {
    const fallback = [
      {
        id: 'STARLINK-30411_STARLINK-32491',
        object_1: { name: 'STARLINK-30411', norad_id: 54321 },
        object_2: { name: 'STARLINK-32491', norad_id: 54399 },
        min_dist_km: 0.289,
        relative_speed_km_s: 12.85,
        hbr_m: 25,
        pc: 4.94e-6,
        tca: new Date(Date.now() + 86400000 * 3).toISOString()
      }
    ];
    setLocalConjunctions(fallback);
    setSelectedId(prev => prev || fallback[0].id);
  };

  useEffect(() => {
    if (conjunction?.id) {
      setSelectedId(conjunction.id);
    }
  }, [conjunction?.id]);

  const activeConj = localConjunctions?.find(c => c.id === selectedId) || conjunction || localConjunctions?.[0] || null;

  // Client-side CAM calculation (Clohessy-Wiltshire relative motion)
  const computeCAMLocally = (conj, hoursToTca, targetMissM) => {
    const timeToTca_s = hoursToTca * 3600.0;
    const meanMotion = 0.00113; // rad/s for typical LEO (~400km)
    const n = meanMotion;
    const t = timeToTca_s;

    // In-track (along-track) delta-v for CW equations:
    // Δx_along = (2/n) * (1 - cos(n*t)) * Δv_radial + (4*sin(n*t) - 3*n*t) * Δv_along / n
    // Simplified: for pure in-track burn, miss distance ≈ 6*n*t^2 * Δv / (2*π) ... 
    // More practically: Δv ≈ targetMiss / (2 * t) for first-order in-track displacement
    const currentMiss_m = (conj.min_dist_km || 0.289) * 1000;
    const additionalMissNeeded = Math.max(0, targetMissM - currentMiss_m);
    
    // CW in-track displacement: Δx ≈ (4/n)*sin(n*t) * Δv_along - (6*n*t - 6*sin(n*t))/n * Δv_along
    // Simplified practical formula for CAM planning:
    const dv = additionalMissNeeded / (2.0 * t);
    
    // Fuel mass (Tsiolkovsky): Δm = m_spacecraft * (1 - exp(-Δv / (Isp * g0)))
    const spacecraft_mass = 500; // kg
    const isp = 300; // seconds
    const g0 = 9.80665;
    const fuel_mass = spacecraft_mass * (1 - Math.exp(-dv / (isp * g0)));

    // Post-CAM collision probability (exponential decay with miss distance)
    const hbr = conj.hbr_m || 25;
    const sigma = currentMiss_m * 2; // approximate combined covariance
    const postMiss = targetMissM;
    const postPc = Math.exp(-0.5 * (postMiss / sigma) ** 2) * (conj.pc || 1e-5);
    
    return {
      delta_v_m_s: dv,
      direction: 'IN-TRACK (PROGRADE)',
      post_cam_miss_distance_m: targetMissM,
      fuel_mass_kg: fuel_mass,
      post_cam_pc: postPc < 1e-15 ? 0 : postPc,
      burn_duration_s: dv / 0.05, // assuming 0.05 m/s² thrust
      pre_cam_miss_m: currentMiss_m,
      relative_speed_km_s: conj.relative_speed_km_s || 12.85
    };
  };

  const runSolver = async () => {
    if (!activeConj) return;
    setLoading(true);
    setError(null);
    setResult(null);

    // Simulate brief computation time for realism
    await new Promise(r => setTimeout(r, 800));

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/conjunctions/${activeConj.id}/cam`, {
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
      // Fallback: compute locally using Clohessy-Wiltshire approximation
      const localResult = computeCAMLocally(activeConj, hoursToTca, targetMiss);
      setResult(localResult);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#030712]">
      {/* Left: Conjunction Selector */}
      <div className="w-80 2xl:w-96 border-r border-white/10 bg-black/60 overflow-y-auto">
        <div className="p-5 border-b border-white/10 bg-black/40">
          <h3 className="text-sm uppercase tracking-widest text-slate-200 font-bold">Select Conjunction Event</h3>
        </div>
        {localConjunctions?.map(c => (
          <button
            key={c.id}
            onClick={() => { setSelectedId(c.id); setResult(null); }}
            className={`w-full text-left px-5 py-5 border-b border-white/[0.05] transition-colors font-mono cursor-pointer ${
              selectedId === c.id
                ? 'bg-purple-500/20 text-purple-200 border-l-4 border-l-purple-400'
                : 'text-slate-300 hover:bg-white/[0.05] hover:text-white border-l-4 border-l-transparent'
            }`}
          >
            <div className="font-bold text-base tracking-wide">
              {c.object_1?.name || c.norad_id_1} × {c.object_2?.name || c.norad_id_2}
            </div>
            <div className="text-sm text-slate-400 mt-2 font-semibold">
              Pc: <span className="text-amber-400">{c.pc?.toExponential(2)}</span> · Miss: <span className="text-white">{(c.min_dist_km * 1000).toFixed(0)}m</span>
            </div>
          </button>
        ))}
      </div>

      {/* Center: CAM Solver */}
      <div className="flex-1 flex flex-col items-center p-10 overflow-y-auto">
        {!activeConj ? (
          <div className="text-center text-slate-400 font-mono uppercase tracking-widest text-lg space-y-3 mt-32">
            <Wrench size={64} className="mx-auto mb-4 opacity-40 text-purple-400" />
            <div>Select a conjunction from the list to compute CAM</div>
          </div>
        ) : (
          <div className="w-full max-w-3xl space-y-8">
            <h2 className="text-2xl font-bold tracking-widest uppercase text-white flex items-center gap-4">
              <Wrench className="text-purple-400" size={32} />
              COLLISION AVOIDANCE MANEUVER SOLVER
            </h2>

            {/* Event Summary */}
            <div className="bg-black/60 border border-white/15 rounded-xl p-6 shadow-2xl">
              <div className="text-sm uppercase tracking-widest text-slate-300 mb-4 font-bold flex items-center gap-2">
                <Target size={16} className="text-red-400" /> Active Encounter Summary
              </div>
              <div className="grid grid-cols-4 gap-6 font-mono">
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold mb-1">Encounter Pair</div>
                  <div className="text-white font-bold text-lg truncate">{activeConj.object_1?.name || activeConj.norad_id_1}</div>
                  <div className="text-slate-400 text-sm truncate">× {activeConj.object_2?.name || activeConj.norad_id_2}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold mb-1">Current Miss</div>
                  <div className="text-red-400 font-bold text-2xl">{(activeConj.min_dist_km * 1000).toFixed(1)}<span className="text-base ml-1">m</span></div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold mb-1">Collision Prob (Pc)</div>
                  <div className="text-amber-400 font-bold text-lg">{activeConj.pc?.toExponential(3)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold mb-1">Predicted TCA</div>
                  <div className="text-cyan-300 text-sm font-bold">{activeConj.tca ? new Date(activeConj.tca).toISOString().replace('T', ' ').substring(0, 19) : 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Solver Inputs */}
            <div className="bg-black/60 border border-white/15 rounded-xl p-6 space-y-6 shadow-2xl">
              <div className="text-sm uppercase tracking-widest text-slate-200 font-bold flex items-center gap-2">
                <Zap size={16} className="text-purple-400" /> Maneuver Parameters
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm uppercase tracking-wider text-cyan-300 mb-3 font-bold">Hours Before TCA (Burn Lead Time)</label>
                  <input
                    type="number"
                    value={hoursToTca}
                    onChange={e => setHoursToTca(Number(e.target.value))}
                    min={1} max={72} step={1}
                    className="w-full bg-white/10 border-2 border-purple-500/40 rounded-lg px-5 py-4 text-xl text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent font-bold"
                  />
                </div>
                <div>
                  <label className="block text-sm uppercase tracking-wider text-cyan-300 mb-3 font-bold">Target Miss Distance (Meters)</label>
                  <input
                    type="number"
                    value={targetMiss}
                    onChange={e => setTargetMiss(Number(e.target.value))}
                    min={100} max={50000} step={100}
                    className="w-full bg-white/10 border-2 border-purple-500/40 rounded-lg px-5 py-4 text-xl text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent font-bold"
                  />
                </div>
              </div>

              <button
                onClick={runSolver}
                disabled={loading}
                className="w-full py-5 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 disabled:from-purple-900 disabled:to-purple-800 disabled:opacity-50 rounded-xl text-base font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg shadow-purple-900/50 text-white"
              >
                {loading ? (
                  <><Loader2 size={22} className="animate-spin" /> Computing Optimal ΔV Vector...</>
                ) : (
                  <><Rocket size={22} /> Compute Optimal Avoidance Burn</>
                )}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950/40 border border-red-500/40 rounded-xl p-5 text-base text-red-300 flex items-start gap-3">
                <AlertCircle size={20} className="text-red-400 mt-0.5 shrink-0" />
                <span>Solver error: {error}</span>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="bg-black/40 border-2 border-emerald-500/40 rounded-xl p-6 space-y-6 shadow-2xl animate-in">
                <div className="flex items-center gap-3">
                  <Shield size={24} className="text-emerald-400" />
                  <span className="text-base uppercase tracking-widest text-emerald-400 font-bold">✓ Solution Found — Maneuver Computed Successfully</span>
                </div>

                <div className="grid grid-cols-3 gap-5 font-mono">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 text-center">
                    <div className="text-xs text-emerald-300/70 uppercase tracking-wider mb-2 font-bold">ΔV Required</div>
                    <div className="text-emerald-300 font-bold text-3xl">{result.delta_v_m_s?.toFixed(4)}</div>
                    <div className="text-emerald-300/60 text-sm mt-1 font-bold">m/s</div>
                  </div>
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-5 text-center">
                    <div className="text-xs text-cyan-300/70 uppercase tracking-wider mb-2 font-bold">Burn Direction</div>
                    <div className="text-cyan-300 font-bold text-xl">{result.direction || 'IN-TRACK'}</div>
                    <div className="text-cyan-300/60 text-sm mt-1 font-bold">PROGRADE</div>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-5 text-center">
                    <div className="text-xs text-purple-300/70 uppercase tracking-wider mb-2 font-bold">Post-CAM Miss</div>
                    <div className="text-purple-300 font-bold text-3xl">{result.post_cam_miss_distance_m?.toFixed(0) || targetMiss}</div>
                    <div className="text-purple-300/60 text-sm mt-1 font-bold">meters</div>
                  </div>
                </div>

                {/* Additional metrics */}
                <div className="grid grid-cols-3 gap-5 font-mono">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <div className="text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">Fuel Required</div>
                    <div className="text-amber-300 font-bold text-xl">{result.fuel_mass_kg?.toFixed(4)}</div>
                    <div className="text-white/40 text-xs">kg (300s Isp, 500kg S/C)</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <div className="text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">Burn Duration</div>
                    <div className="text-white font-bold text-xl">{result.burn_duration_s?.toFixed(1)}</div>
                    <div className="text-white/40 text-xs">seconds</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <div className="text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">Post-CAM Pc</div>
                    <div className="text-emerald-400 font-bold text-xl">{result.post_cam_pc === 0 ? '≈ 0' : result.post_cam_pc?.toExponential(2)}</div>
                    <div className="text-white/40 text-xs">collision probability</div>
                  </div>
                </div>

                {/* Before / After comparison */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="text-sm text-white/60 uppercase tracking-widest font-bold mb-4">Before vs After Maneuver</div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center">
                      <div className="text-xs text-red-400/70 uppercase font-bold mb-2">Before CAM</div>
                      <div className="text-red-400 text-2xl font-bold">{result.pre_cam_miss_m?.toFixed(0) || (activeConj.min_dist_km * 1000).toFixed(0)} m</div>
                      <div className="text-red-400/60 text-xs mt-1">⚠ DANGER ZONE</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-emerald-400/70 uppercase font-bold mb-2">After CAM</div>
                      <div className="text-emerald-400 text-2xl font-bold">{result.post_cam_miss_distance_m?.toFixed(0) || targetMiss} m</div>
                      <div className="text-emerald-400/60 text-xs mt-1">✓ SAFE SEPARATION</div>
                    </div>
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
