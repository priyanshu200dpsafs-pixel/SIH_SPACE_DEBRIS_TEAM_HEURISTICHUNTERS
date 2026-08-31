import React, { useState, useEffect } from 'react';
import { AlertTriangle, ArrowUpDown, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';

export default function ThreatMatrixView({ conjunctions, onSelectPair }) {
  const [allConjunctions, setAllConjunctions] = useState([]);
  const [sortField, setSortField] = useState('pc');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/conjunctions?page=1&size=100')
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
      CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/40',
      HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
      ELEVATED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
      NOMINAL: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${colors[cat] || colors.ELEVATED}`}>
        {cat}
      </span>
    );
  };

  const SortHeader = ({ label, field }) => (
    <th
      className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-white/50 font-semibold cursor-pointer hover:text-white/80 transition-colors select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        {sortField === field ? (
          sortAsc ? <ChevronUp size={12} className="text-cyan-400" /> : <ChevronDown size={12} className="text-cyan-400" />
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </div>
    </th>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-void)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 bg-black/40">
        <h1 className="text-xl font-bold tracking-widest uppercase text-white flex items-center gap-2">
          <AlertTriangle className="text-red-500" size={22} />
          THREAT MATRIX
        </h1>
        <p className="text-xs text-white/40 font-mono mt-1 uppercase tracking-wider">
          {allConjunctions.length} ACTIVE CONJUNCTIONS · Pc-RANKED · UPDATED EVERY 6h
        </p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/30 font-mono text-sm uppercase tracking-widest">
            Loading conjunction data...
          </div>
        ) : (
          <table className="w-full text-sm font-mono">
            <thead className="sticky top-0 z-10 bg-[#0a0e1a]/95 backdrop-blur-sm border-b border-white/10">
              <tr>
                <SortHeader label="PAIR" field="pair" />
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-white/50 font-semibold">STATUS</th>
                <SortHeader label="TCA (ZULU)" field="tca" />
                <SortHeader label="MISS (KM)" field="miss" />
                <SortHeader label="V_REL (KM/S)" field="vrel" />
                <SortHeader label="Pc (FOSTER)" field="pc" />
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-white/50 font-semibold">RISK</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const obj1Name = c.object_1?.name || `NORAD-${c.norad_id_1}`;
                const obj2Name = c.object_2?.name || `NORAD-${c.norad_id_2}`;
                const isHighPc = c.pc >= 1e-4;

                return (
                  <tr
                    key={c.id || i}
                    onClick={() => onSelectPair?.(c.id)}
                    className={`border-b border-white/[0.03] cursor-pointer transition-colors hover:bg-white/[0.04] ${
                      isHighPc ? 'bg-red-950/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white/90 text-xs font-semibold">{obj1Name}</span>
                        <span className="text-white/20 text-[10px]">×</span>
                        <span className="text-white/90 text-xs font-semibold">{obj2Name}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          c.object_1?.object_type === 'DEBRIS' || c.object_2?.object_type === 'DEBRIS'
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                            : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                        }`}>
                          {c.object_1?.object_type === 'DEBRIS' || c.object_2?.object_type === 'DEBRIS' ? 'DEBRIS' : 'SAT-OP'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                        c.consensus_status === 'HIGH_DIVERGENCE'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {c.consensus_status ? c.consensus_status.replace('_', ' ') : 'NOMINAL'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/70 text-xs">
                      {new Date(c.tca).toISOString().replace('T', ' ').substring(0, 19)}
                    </td>
                    <td className={`px-4 py-3 text-xs font-bold tabular-nums ${
                      c.min_dist_km < 1 ? 'text-red-400' : 'text-white/80'
                    }`}>
                      {c.min_dist_km?.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-white/70 text-xs tabular-nums">
                      {c.relative_speed_km_s?.toFixed(2) || 'N/A'}
                    </td>
                    <td className={`px-4 py-3 text-xs font-bold tabular-nums ${
                      c.pc >= 1e-4 ? 'text-red-400' : 'text-orange-400'
                    }`}>
                      {c.pc?.toExponential(3)}
                    </td>
                    <td className="px-4 py-3">
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
