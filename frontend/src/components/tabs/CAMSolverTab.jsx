import React, { useState, useEffect } from 'react';

export default function CAMSolverTab({ selectedConjunctionId, navigateTo }) {
  const [conjunction, setConjunction] = useState(null);
  const [targetMiss, setTargetMiss] = useState(15000); // meters
  const [hoursToTCA, setHoursToTCA] = useState(12.0); // hours
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedConjunctionId) {
      fetch(`http://localhost:8000/api/v1/conjunctions/${selectedConjunctionId}`)
        .then(res => res.json())
        .then(data => setConjunction(data))
        .catch(err => console.error(err));
    }
  }, [selectedConjunctionId]);

  const handleCalculate = async () => {
    if (!selectedConjunctionId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/v1/conjunctions/${selectedConjunctionId}/cam`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_miss_distance_m: parseFloat(targetMiss),
          hours_to_tca: parseFloat(hoursToTCA)
        })
      });
      const data = await res.json();
      setResults(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedConjunctionId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#030712]">
        <div className="bg-slate-900/90 border border-amber-500/30 p-8 rounded text-center">
          <h2 className="text-amber-400 font-mono text-xl font-bold tracking-widest mb-4">NO TARGET SELECTED</h2>
          <p className="text-slate-400 font-mono mb-6">Select a conjunction from the Threat Matrix to plan an avoidance maneuver.</p>
          <button 
            onClick={() => navigateTo('matrix')}
            className="bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/50 text-cyan-300 px-6 py-2 font-mono tracking-wider transition-colors rounded"
          >
            GO TO THREAT MATRIX
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-6 bg-[#030712] overflow-auto flex flex-col items-center">
      <div className="w-full max-w-5xl">
        
        {/* Header */}
        <div className="flex justify-between items-end border-b border-cyan-500/30 pb-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wider font-mono">C.A.M. BURN PLANNER</h2>
            <div className="text-sm text-cyan-400 font-mono mt-1">
              TARGETING: {conjunction?.object_1?.name || conjunction?.norad_id_1}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 font-mono tracking-wider uppercase mb-1">ALGORITHM</div>
            <div className="text-sm text-emerald-400 font-mono font-bold tracking-wider">CLOHESSY-WILTSHIRE RELATIVE MOTION</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Input Panel */}
          <div className="bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 p-6 rounded shadow-[0_0_15px_rgba(34,211,238,0.1)] flex flex-col justify-between">
            <div>
              <h3 className="text-white font-bold tracking-wider uppercase font-mono mb-6 border-b border-slate-700/50 pb-2">MANEUVER PARAMETERS</h3>
              
              <div className="mb-6">
                <label className="block text-slate-300 font-mono text-xs uppercase tracking-wider mb-2">
                  TARGET ALONG-TRACK DEVIATION (METERS)
                </label>
                <input 
                  type="number"
                  value={targetMiss}
                  onChange={e => setTargetMiss(e.target.value)}
                  className="w-full bg-slate-950 border border-cyan-500/50 text-cyan-400 font-mono text-lg p-3 rounded focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <div className="mb-8">
                <label className="block text-slate-300 font-mono text-xs uppercase tracking-wider mb-2">
                  BURN EXECUTION (HOURS BEFORE T.C.A.)
                </label>
                <input 
                  type="number"
                  step="0.5"
                  value={hoursToTCA}
                  onChange={e => setHoursToTCA(e.target.value)}
                  className="w-full bg-slate-950 border border-cyan-500/50 text-cyan-400 font-mono text-lg p-3 rounded focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                />
              </div>
            </div>

            <button 
              onClick={handleCalculate}
              disabled={loading}
              className="w-full bg-emerald-900/50 hover:bg-emerald-800/80 border border-emerald-500/80 text-emerald-300 font-bold font-mono tracking-widest uppercase py-4 rounded transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]"
            >
              {loading ? 'COMPUTING TRAJECTORY...' : 'CALCULATE ΔV BURN'}
            </button>
          </div>

          {/* Results Panel */}
          <div className="bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 p-6 rounded shadow-[0_0_15px_rgba(34,211,238,0.1)] flex flex-col">
            <h3 className="text-white font-bold tracking-wider uppercase font-mono mb-6 border-b border-slate-700/50 pb-2">BURN REQUIREMENTS</h3>
            
            {!results ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 font-mono">
                Awaiting parameters...
              </div>
            ) : (
              <div className="flex flex-col space-y-6">
                
                <div className="bg-slate-950/80 border border-slate-700/50 p-4 rounded">
                  <div className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-1">REQUIRED DELTA-V (IN-TRACK)</div>
                  <div className="text-4xl font-bold text-amber-400 font-mono">
                    {results.required_delta_v_m_s > 0 ? '+' : ''}{results.required_delta_v_m_s.toFixed(5)} <span className="text-lg text-slate-500">m/s</span>
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-2">
                    {results.required_delta_v_m_s > 0 ? "POSIGRADE BURN (PROGRADE)" : "RETROGRADE BURN (BRAKING)"}
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-700/50 p-4 rounded grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-1">ACHIEVED ALONG-TRACK</div>
                    <div className="text-2xl font-bold text-emerald-400 font-mono">
                      {results.along_track_deviation_m.toFixed(1)} <span className="text-sm text-slate-500">m</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-mono text-xs uppercase tracking-wider mb-1">RADIAL DEVIATION PENALTY</div>
                    <div className="text-2xl font-bold text-cyan-400 font-mono">
                      {results.radial_deviation_m.toFixed(2)} <span className="text-sm text-slate-500">m</span>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
