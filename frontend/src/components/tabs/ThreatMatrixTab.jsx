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

  const getRiskClass = (pc) => {
    if (pc > 1e-4) return 'risk-bar-critical';
    if (pc > 1e-6) return 'risk-bar-high';
    return 'risk-bar-moderate';
  };

  const getRiskLabel = (pc) => {
    if (pc > 1e-4) return { text: 'CRITICAL', color: 'text-red-500 bg-red-500/10 border-red-500/30' };
    if (pc > 1e-5) return { text: 'HIGH', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    if (pc > 1e-6) return { text: 'ELEVATED', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' };
    return { text: 'NOMINAL', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
  };

  return (
    <div className="w-full h-full p-6 bg-[var(--color-void)] overflow-auto flex flex-col tab-content">
      {/* Header */}
      <div className="flex justify-between items-end mb-4">
        <div className="animate-fadeInUp">
          <h2 className="text-white font-bold tracking-wider uppercase text-2xl">
            THREAT MATRIX
          </h2>
          <div className="text-slate-500 font-mono text-[10px] tracking-widest mt-1">
            {conjunctions.length} ACTIVE CONJUNCTIONS • Pc-RANKED • UPDATED EVERY 6H
          </div>
        </div>
        {selectedConjunctionId && (
          <div className="flex space-x-3 animate-fadeIn">
            <button 
              onClick={() => navigateTo('bplane')}
              className="glass-panel hover:bg-cyan-500/10 text-cyan-300 px-4 py-2 text-[11px] font-mono tracking-wider transition-all duration-300 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]"
            >
              ◎ ANALYZE B-PLANE
            </button>
            <button 
              onClick={() => navigateTo('cam')}
              className="glass-panel hover:bg-emerald-500/10 text-emerald-300 px-4 py-2 text-[11px] font-mono tracking-wider transition-all duration-300 border-emerald-500/20 hover:border-emerald-500/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            >
              △ PLAN CAM BURN
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 glass-panel overflow-hidden flex flex-col animate-fadeInUp" style={{ animationDelay: '0.15s', animationFillMode: 'backwards' }}>
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-black/40 border-b border-white/[0.06] text-slate-500 text-[10px] tracking-widest">
            <tr>
              <th className="px-4 py-3 font-medium uppercase">PAIR</th>
              <th className="px-4 py-3 font-medium uppercase">TCA (ZULU)</th>
              <th className="px-4 py-3 font-medium uppercase">MISS (km)</th>
              <th className="px-4 py-3 font-medium uppercase">V<sub>REL</sub> (km/s)</th>
              <th className="px-4 py-3 font-medium uppercase">Pc (FOSTER)</th>
              <th className="px-4 py-3 font-medium uppercase text-right">RISK</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {loading && conjunctions.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-16 text-cyan-500/60 animate-pulse text-sm">
                  Scanning orbital volume...
                </td>
              </tr>
            ) : (
              conjunctions.map((c, idx) => {
                const isSelected = selectedConjunctionId === c.id;
                const riskClass = getRiskClass(c.pc);
                const risk = getRiskLabel(c.pc);
                
                // Operator parsing
                const op1 = (c.object_1?.name || "").split(/[-\s]/)[0].toUpperCase();
                const op2 = (c.object_2?.name || "").split(/[-\s]/)[0].toUpperCase();
                const isCrossOp = op1 && op2 && op1 !== op2;
                
                return (
                  <tr 
                    key={c.id} 
                    onClick={() => handleRowClick(c.id)}
                    className={`cursor-pointer transition-all duration-200 hover:bg-white/[0.02] ${riskClass} ${
                      isSelected ? 'bg-cyan-500/[0.07] !border-l-cyan-400' : ''
                    }`}
                    style={{ animation: `staggerFadeIn 0.4s ease-out ${idx * 0.03}s backwards` }}
                  >
                    <td className="px-4 py-3 text-slate-200">
                      <div className="flex items-center">
                        <span className="font-medium">{c.object_1?.name || c.norad_id_1}</span>
                        <span className="text-slate-600 mx-1.5">×</span>
                        <span className="font-medium">{c.object_2?.name || c.norad_id_2}</span>
                        {isCrossOp ? (
                          <span className="ml-2 text-[8px] px-1.5 py-0.5 rounded-sm border border-red-500/40 bg-red-500/10 text-red-400 tracking-wider font-bold">CROSS-OP</span>
                        ) : (
                          <span className="ml-2 text-[8px] px-1.5 py-0.5 rounded-sm border border-slate-700/40 bg-slate-800/20 text-slate-600 tracking-wider">SAME-OP</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{c.tca.replace('T', ' ').substring(0,19)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={c.min_dist_km < 1 ? 'text-red-400 font-bold' : 'text-slate-300'}>
                        {c.min_dist_km.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 tabular-nums">{c.relative_speed_km_s.toFixed(2)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={c.pc > 1e-5 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                        {c.pc < 1e-15 ? "< 1e-15" : c.pc.toExponential(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelected ? (
                        <span className="text-[9px] tracking-widest uppercase border border-cyan-400/50 px-2 py-0.5 rounded-sm bg-cyan-400/10 text-cyan-400">SELECTED</span>
                      ) : (
                        <span className={`text-[9px] tracking-widest uppercase border px-2 py-0.5 rounded-sm ${risk.color}`}>{risk.text}</span>
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
