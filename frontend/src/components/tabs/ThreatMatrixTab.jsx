import React, { useState, useEffect } from 'react';

export default function ThreatMatrixTab({ selectedConjunctionId, setSelectedConjunctionId, navigateTo }) {
  const [conjunctions, setConjunctions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchConjunctions = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/conjunctions?page=1&size=50');
      const data = await res.json();
      setConjunctions(data.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConjunctions();
    const int = setInterval(fetchConjunctions, 10000);
    return () => clearInterval(int);
  }, []);

  const handleRowClick = (id) => {
    setSelectedConjunctionId(id);
  };

  return (
    <div className="w-full h-full p-6 bg-[#030712] overflow-auto flex flex-col">
      <div className="flex justify-between items-end mb-4">
        <h2 className="text-white font-bold tracking-wider uppercase font-mono text-2xl">
          THREAT MATRIX
        </h2>
        {selectedConjunctionId && (
          <div className="flex space-x-4">
            <button 
              onClick={() => navigateTo('bplane')}
              className="bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/50 text-cyan-300 px-4 py-2 text-sm font-mono tracking-wider transition-colors rounded"
            >
              ANALYZE B-PLANE
            </button>
            <button 
              onClick={() => navigateTo('cam')}
              className="bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-500/50 text-emerald-300 px-4 py-2 text-sm font-mono tracking-wider transition-colors rounded"
            >
              PLAN CAM BURN
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 rounded shadow-[0_0_15px_rgba(34,211,238,0.15)] overflow-hidden flex flex-col">
        <table className="w-full text-left font-mono text-sm">
          <thead className="bg-slate-950/80 border-b border-cyan-500/30 text-slate-300 text-xs tracking-wider">
            <tr>
              <th className="px-4 py-3 font-semibold uppercase">PAIR ID</th>
              <th className="px-4 py-3 font-semibold uppercase">TCA (ZULU)</th>
              <th className="px-4 py-3 font-semibold uppercase">MISS (km)</th>
              <th className="px-4 py-3 font-semibold uppercase">RELATIVE V (km/s)</th>
              <th className="px-4 py-3 font-semibold uppercase">Pc (Foster)</th>
              <th className="px-4 py-3 font-semibold uppercase text-right">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 overflow-y-auto">
            {loading && conjunctions.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-cyan-500 animate-pulse">Scanning orbital volume...</td>
              </tr>
            ) : (
              conjunctions.map((c) => {
                const isSelected = selectedConjunctionId === c.id;
                let riskColor = "text-emerald-400";
                if (c.pc > 1e-6) riskColor = "text-amber-400";
                if (c.pc > 1e-4) riskColor = "text-red-500 animate-pulse";
                
                return (
                  <tr 
                    key={c.id} 
                    onClick={() => handleRowClick(c.id)}
                    className={`cursor-pointer transition-colors hover:bg-slate-800/60 ${isSelected ? 'bg-cyan-900/30 border-l-4 border-cyan-400' : 'border-l-4 border-transparent'}`}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-200">
                      {c.object_1?.name || c.norad_id_1} x {c.object_2?.name || c.norad_id_2}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{c.tca.replace('T', ' ').substring(0,19)}</td>
                    <td className="px-4 py-3 text-slate-300">{c.min_dist_km.toFixed(3)}</td>
                    <td className="px-4 py-3 text-slate-300">{c.relative_speed_km_s.toFixed(2)}</td>
                    <td className={`px-4 py-3 font-bold ${riskColor}`}>
                      {c.pc < 1e-15 ? "< 1e-15" : c.pc.toExponential(3)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelected ? (
                        <span className="text-cyan-400 text-xs tracking-widest uppercase border border-cyan-400/50 px-2 py-1 rounded bg-cyan-400/10">SELECTED</span>
                      ) : (
                        <span className="text-slate-500 text-xs tracking-widest uppercase">TRACKED</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
