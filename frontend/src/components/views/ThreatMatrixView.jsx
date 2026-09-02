const API_BASE_URL = import.meta.env.VITE_API_URL || '';
import React, { useState, useEffect } from 'react';
import { AlertTriangle, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

export default function ThreatMatrixView({ conjunctions, onSelectPair }) {
  const [allConjunctions, setAllConjunctions] = useState([]);
  const [sortField, setSortField] = useState('pc');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API_BASE_URL + '/api/v1/conjunctions?page=1&size=100')
      .then(r => r.json())
      .then(data => {
        setAllConjunctions(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sorted = [...allConjunctions].sort((a, b) => {
    let valA, valB;
    switch (sortField) {
      case 'tca': valA = new Date(a.tca).getTime(); valB = new Date(b.tca).getTime(); break;
      case 'miss': valA = a.min_dist_km; valB = b.min_dist_km; break;
      case 'vrel': valA = a.relative_speed_km_s || 0; valB = b.relative_speed_km_s || 0; break;
      case 'pc': valA = a.pc; valB = b.pc; break;
      case 'threat': valA = a.threat_score || 0; valB = b.threat_score || 0; break;
      default: valA = a.pc; valB = b.pc;
    }
    return sortAsc ? valA - valB : valB - valA;
  });

  const getRiskBadge = (c) => {
    const cat = c.risk_category || (c.pc >= 1e-4 ? 'CRITICAL' : c.pc >= 1e-5 ? 'HIGH' : 'ELEVATED');
    const colors = {
      CRITICAL: 'bg-red-500/25 text-red-400 border-red-500/50 shadow-[0_0_10px_rgba(255,0,85,0.2)]',
      HIGH: 'bg-orange-500/25 text-orange-400 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.2)]',
      ELEVATED: 'bg-yellow-500/25 text-yellow-300 border-yellow-500/50',
      NOMINAL: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50',
    };
    return (
      <span className={`text-xs font-bold px-3 py-1 rounded-md border uppercase tracking-wider ${colors[cat] || colors.ELEVATED}`}>
        {cat}
      </span>
    );
  };

  const SortHeader = ({ label, field }) => (
    <th
      className="text-left px-5 py-4 text-xs uppercase tracking-wider text-slate-300 font-bold cursor-pointer hover:text-cyan-300 transition-colors select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        {sortField === field ? (
          sortAsc ? <ChevronUp size={14} className="text-cyan-400" /> : <ChevronDown size={14} className="text-cyan-400" />
        ) : (
          <ArrowUpDown size={12} className="opacity-40" />
        )}
      </div>
    </th>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-void)]">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/10 bg-black/60 shadow-lg">
        <h1 className="text-2xl font-bold tracking-widest uppercase text-white flex items-center gap-3">
          <AlertTriangle className="text-red-500" size={26} />
          THREAT MATRIX
        </h1>
        <p className="text-xs text-slate-400 font-mono mt-1.5 uppercase tracking-wider font-semibold">
          {allConjunctions.length} ACTIVE CONJUNCTIONS · Pc-RANKED · UPDATED EVERY 6 HOURS
        </p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400 font-mono text-base uppercase tracking-widest">
            Loading conjunction data...
          </div>
        ) : (
          <table className="w-full text-sm font-mono">
            <thead className="sticky top-0 z-10 bg-[#070b14]/95 backdrop-blur-md border-b border-white/15 shadow-md">
              <tr>
                <SortHeader label="CONJUNCTION PAIR" field="pair" />
                <th className="text-left px-5 py-4 text-xs uppercase tracking-wider text-slate-300 font-bold">STATUS</th>
                <SortHeader label="TCA (ZULU)" field="tca" />
                <SortHeader label="MISS DIST (KM)" field="miss" />
                <SortHeader label="V_REL (KM/S)" field="vrel" />
                <SortHeader label="Pc (FOSTER)" field="pc" />
                <th className="text-left px-5 py-4 text-xs uppercase tracking-wider text-slate-300 font-bold">RISK LEVEL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sorted.map((c, i) => {
                const obj1Name = c.object_1?.name || `NORAD-${c.norad_id_1}`;
                const obj2Name = c.object_2?.name || `NORAD-${c.norad_id_2}`;
                const isHighPc = c.pc >= 1e-4;

                return (
                  <tr
                    key={c.id || i}
                    onClick={() => onSelectPair?.(c)}
                    className={`cursor-pointer transition-colors hover:bg-cyan-500/10 ${
                      isHighPc ? 'bg-red-950/20' : ''
                    }`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-white text-sm font-bold tracking-wide">{obj1Name}</span>
                        <span className="text-slate-500 text-xs font-mono">×</span>
                        <span className="text-white text-sm font-bold tracking-wide">{obj2Name}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border ${
                          c.object_1?.object_type === 'DEBRIS' || c.object_2?.object_type === 'DEBRIS'
                            ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        }`}>
                          {c.object_1?.object_type === 'DEBRIS' || c.object_2?.object_type === 'DEBRIS' ? 'DEBRIS' : 'SAT-OP'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border ${
                        c.consensus_status === 'HIGH_DIVERGENCE'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}>
                        {c.consensus_status ? c.consensus_status.replace('_', ' ') : 'NOMINAL'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-200 text-sm font-semibold">
                      {new Date(c.tca).toISOString().replace('T', ' ').substring(0, 19)}
                    </td>
                    <td className={`px-5 py-4 text-sm font-bold tabular-nums ${
                      c.min_dist_km < 1 ? 'text-red-400' : 'text-slate-100'
                    }`}>
                      {c.min_dist_km?.toFixed(3)}
                    </td>
                    <td className="px-5 py-4 text-slate-200 text-sm font-bold tabular-nums">
                      {c.relative_speed_km_s?.toFixed(2) || 'N/A'}
                    </td>
                    <td className={`px-5 py-4 text-sm font-bold tabular-nums ${
                      c.pc >= 1e-4 ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {c.pc?.toExponential(3)}
                    </td>
                    <td className="px-5 py-4">
                      {getRiskBadge(c)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

