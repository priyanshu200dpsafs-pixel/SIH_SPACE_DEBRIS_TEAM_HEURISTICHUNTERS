import React, { useState, useEffect } from 'react';

export default function SpaceWeatherTab() {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/weather')
      .then(res => res.json())
      .then(data => setWeather(data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="w-full h-full p-6 bg-[#030712] overflow-auto flex flex-col items-center justify-center">
      <div className="w-full max-w-4xl bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 p-8 rounded shadow-[0_0_20px_rgba(34,211,238,0.1)]">
        
        <div className="flex justify-between items-end border-b border-cyan-500/30 pb-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wider font-mono">SOLAR WEATHER TELEMETRY</h2>
            <div className="text-sm text-slate-400 font-mono mt-1">
              SOURCE: NOAA SPACE WEATHER PREDICTION CENTER (SWPC)
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
            <span className="text-emerald-400 font-mono text-xs uppercase tracking-wider font-bold">LIVE FEED</span>
          </div>
        </div>

        {!weather ? (
          <div className="text-cyan-500 font-mono animate-pulse text-center py-12">Establishing downlink...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            <div className="bg-slate-950/80 border border-slate-700/50 p-6 rounded flex flex-col items-center text-center shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-20">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="1"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              </div>
              <div className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-2">SOLAR RADIO FLUX</div>
              <div className="text-5xl font-bold text-amber-400 font-mono mb-2">{weather.f107.toFixed(1)}</div>
              <div className="text-amber-500/80 font-mono text-sm">F10.7 (sfu)</div>
              <div className="mt-4 pt-4 border-t border-slate-800 w-full text-xs text-slate-500 font-mono">
                Drives upper atmosphere heating & expansion.
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-700/50 p-6 rounded flex flex-col items-center text-center shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-20">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-2">GEOMAGNETIC ACTIVITY</div>
              <div className="text-5xl font-bold text-cyan-400 font-mono mb-2">{weather.ap.toFixed(1)}</div>
              <div className="text-cyan-500/80 font-mono text-sm">Planetary A-index (Ap)</div>
              <div className="mt-4 pt-4 border-t border-slate-800 w-full text-xs text-slate-500 font-mono">
                Proxy for geomagnetic storm induced drag.
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
