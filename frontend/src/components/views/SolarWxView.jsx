const API_BASE_URL = import.meta.env.VITE_API_URL || '';
import React, { useState, useEffect } from 'react';
import { Sun, Wind, Activity, Gauge, AlertTriangle, RefreshCw } from 'lucide-react';

export default function SolarWxView() {
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeather();
  }, []);

  const fetchWeather = () => {
    setLoading(true);
    fetch(API_BASE_URL + '/api/v1/weather')
      .then(r => r.json())
      .then(data => {
        setWeatherData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const getF107Level = (f107) => {
    if (f107 >= 200) return { label: 'EXTREME', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30' };
    if (f107 >= 150) return { label: 'HIGH', color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30' };
    if (f107 >= 100) return { label: 'MODERATE', color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-500/30' };
    return { label: 'LOW', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' };
  };

  const getApLevel = (ap) => {
    if (ap >= 50) return { label: 'STORM', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30', desc: 'Severe geomagnetic storm. Significant drag perturbations expected.' };
    if (ap >= 30) return { label: 'ACTIVE', color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30', desc: 'Elevated geomagnetic activity. Moderate drag perturbations.' };
    if (ap >= 15) return { label: 'UNSETTLED', color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-500/30', desc: 'Minor geomagnetic disturbance. Slight drag variations.' };
    return { label: 'QUIET', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30', desc: 'Calm geomagnetic conditions. Nominal drag environment.' };
  };

  const f107 = weatherData?.f107 || 150;
  const ap = weatherData?.ap || 15;
  const f107Level = getF107Level(f107);
  const apLevel = getApLevel(ap);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-void)]">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/10 bg-black/60 shadow-lg flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-widest uppercase text-white flex items-center gap-3">
            <Sun className="text-amber-400" size={26} />
            SOLAR & SPACE WEATHER
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1.5 uppercase tracking-wider font-semibold">
            Real-time solar flux & geomagnetic indices · Atmospheric drag model inputs
          </p>
        </div>
        <button
          onClick={fetchWeather}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg text-xs font-mono uppercase tracking-wider text-slate-200 hover:text-white transition-colors cursor-pointer font-bold"
        >
          <RefreshCw size={14} />
          Refresh Data
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400 font-mono text-base uppercase tracking-widest">
            Fetching space weather data...
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Primary Indices */}
            <div className="grid grid-cols-2 gap-8">
              {/* F10.7 Solar Flux */}
              <div className="bg-black/60 border border-white/10 rounded-2xl p-7 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <Sun size={22} className="text-amber-400" />
                    <span className="text-xs uppercase tracking-widest text-slate-300 font-bold">F10.7 SOLAR FLUX</span>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-md border uppercase tracking-wider ${f107Level.bg} ${f107Level.color}`}>
                    {f107Level.label}
                  </span>
                </div>
                <div className="text-6xl font-bold text-amber-300 font-mono tabular-nums mb-2">
                  {f107.toFixed(1)}
                </div>
                <div className="text-xs text-slate-400 font-mono font-semibold">SFU (Solar Flux Units · 10⁻²² W/m²/Hz)</div>
                
                {/* Gauge Bar */}
                <div className="mt-5 space-y-2">
                  <div className="flex justify-between text-xs font-mono text-slate-400 font-bold uppercase">
                    <span>Low (70)</span>
                    <span>Moderate (120)</span>
                    <span>High (180)</span>
                    <span>Extreme (250+)</span>
                  </div>
                  <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-red-500 transition-all duration-500"
                      style={{ width: `${Math.min((f107 / 300) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 text-xs text-slate-300 font-mono leading-relaxed border-l-3 border-amber-500/60 pl-3.5 bg-amber-500/10 py-2.5 rounded-r-lg">
                  F10.7 solar radio flux is the primary driver of thermospheric density. Higher values mean increased atmospheric drag on LEO objects, causing faster orbital decay and larger TLE prediction errors.
                </div>
              </div>

              {/* Ap Geomagnetic Index */}
              <div className="bg-black/60 border border-white/10 rounded-2xl p-7 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <Activity size={22} className="text-purple-400" />
                    <span className="text-xs uppercase tracking-widest text-slate-300 font-bold">Ap GEOMAGNETIC INDEX</span>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-md border uppercase tracking-wider ${apLevel.bg} ${apLevel.color}`}>
                    {apLevel.label}
                  </span>
                </div>
                <div className="text-6xl font-bold text-purple-300 font-mono tabular-nums mb-2">
                  {ap.toFixed(0)}
                </div>
                <div className="text-xs text-slate-400 font-mono font-semibold">nT (nanotesla equivalent)</div>

                {/* Gauge Bar */}
                <div className="mt-5 space-y-2">
                  <div className="flex justify-between text-xs font-mono text-slate-400 font-bold uppercase">
                    <span>Quiet (0)</span>
                    <span>Unsettled (15)</span>
                    <span>Active (30)</span>
                    <span>Storm (50+)</span>
                  </div>
                  <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-red-500 transition-all duration-500"
                      style={{ width: `${Math.min((ap / 80) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 text-xs text-slate-300 font-mono leading-relaxed border-l-3 border-purple-500/60 pl-3.5 bg-purple-500/10 py-2.5 rounded-r-lg">
                  {apLevel.desc} The Ap index measures planetary geomagnetic disturbance levels. During storms, Joule heating dramatically increases thermospheric density at LEO altitudes.
                </div>
              </div>
            </div>

            {/* Impact on Pipeline */}
            <div className="bg-black/60 border border-white/10 rounded-2xl p-7 shadow-2xl space-y-5">
              <div className="flex items-center gap-2.5 mb-2">
                <Gauge size={22} className="text-cyan-400" />
                <span className="text-xs uppercase tracking-widest text-slate-300 font-bold">PIPELINE IMPACT ASSESSMENT</span>
              </div>

              <div className="grid grid-cols-3 gap-5 text-xs font-mono">
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 text-center space-y-2">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Drag Perturbation</div>
                  <div className={`text-xl font-bold ${f107 > 150 || ap > 30 ? 'text-orange-400' : 'text-emerald-400'}`}>
                    {f107 > 150 || ap > 30 ? 'ELEVATED' : 'NOMINAL'}
                  </div>
                  <div className="text-xs text-slate-400">Atmospheric drag force coefficient</div>
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 text-center space-y-2">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">TLE Propagation Accuracy</div>
                  <div className={`text-xl font-bold ${f107 > 180 ? 'text-red-400' : f107 > 120 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {f107 > 180 ? 'DEGRADED' : f107 > 120 ? 'MODERATE' : 'HIGH'}
                  </div>
                  <div className="text-xs text-slate-400">SGP4 analytical model fidelity</div>
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 text-center space-y-2">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Conjunction Screening</div>
                  <div className={`text-xl font-bold ${ap > 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {ap > 50 ? 'CAUTION' : 'OPERATIONAL'}
                  </div>
                  <div className="text-xs text-slate-400">DOP853 numerical confidence</div>
                </div>
              </div>

              {(f107 > 180 || ap > 50) && (
                <div className="mt-5 bg-red-950/40 border border-red-500/50 rounded-xl p-4 flex items-start gap-3 text-xs text-red-200">
                  <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
                  <span className="leading-relaxed">
                    <strong>Advisory:</strong> Current space weather conditions may degrade conjunction prediction accuracy. 
                    Consider increasing screening thresholds and requesting fresh TLE updates from 18 SDS.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
