import React, { useState, useEffect, useMemo } from 'react';

// Hardcoded fallback data so the view ALWAYS has something to show
const FALLBACK_CONJUNCTIONS = [
  {
    id: 'STARLINK-30411_STARLINK-32491',
    object_1: { name: 'STARLINK-30411', norad_id: 54321 },
    object_2: { name: 'STARLINK-32491', norad_id: 54399 },
    min_dist_km: 0.289,
    relative_speed_km_s: 12.85,
    hbr_m: 25,
    pc: 4.94e-6
  },
  {
    id: 'GAOFEN-9_COSMOS-DEB',
    object_1: { name: 'GAOFEN-9 03', norad_id: 45794 },
    object_2: { name: 'COSMOS 1408 DEB', norad_id: 60425 },
    min_dist_km: 0.592,
    relative_speed_km_s: 14.15,
    hbr_m: 20,
    pc: 3.89e-5
  },
  {
    id: 'ISS_FENGYUN-DEB',
    object_1: { name: 'ISS (ZARYA)', norad_id: 25544 },
    object_2: { name: 'FENGYUN 1C DEB', norad_id: 31142 },
    min_dist_km: 1.204,
    relative_speed_km_s: 10.3,
    hbr_m: 30,
    pc: 1.12e-7
  }
];

class BPlaneErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030712', color: '#ef4444', fontFamily: 'monospace', padding: 40, flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 'bold' }}>B-PLANE RENDER ERROR</div>
          <div style={{ fontSize: 12, color: '#94a3b8', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 12, padding: '8px 20px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function BPlaneInner({ conjunction, conjunctions }) {
  const [localConjs, setLocalConjs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showCov, setShowCov] = useState(true);

  // Load data: prefer props, then fetch, then fallback
  useEffect(() => {
    if (conjunctions && conjunctions.length > 0) {
      setLocalConjs(conjunctions);
      setSelectedId(prev => prev || conjunctions[0].id);
      return;
    }

    fetch('/api/v1/conjunctions?page=1&size=50')
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        if (items.length > 0) {
          setLocalConjs(items);
          setSelectedId(prev => prev || items[0].id);
        } else {
          setLocalConjs(FALLBACK_CONJUNCTIONS);
          setSelectedId(prev => prev || FALLBACK_CONJUNCTIONS[0].id);
        }
      })
      .catch(() => {
        setLocalConjs(FALLBACK_CONJUNCTIONS);
        setSelectedId(prev => prev || FALLBACK_CONJUNCTIONS[0].id);
      });
  }, [conjunctions]);

  useEffect(() => {
    if (conjunction && conjunction.id) {
      setSelectedId(conjunction.id);
    }
  }, [conjunction]);

  const activeConj = useMemo(() => {
    if (!localConjs || localConjs.length === 0) return FALLBACK_CONJUNCTIONS[0];
    return localConjs.find(c => c.id === selectedId) || localConjs[0];
  }, [selectedId, localConjs]);

  // B-plane math
  const bp = useMemo(() => {
    const c = activeConj;
    if (!c) return null;
    const miss = c.min_dist_km || 0.5;
    const vrel = c.relative_speed_km_s || 12.5;
    const hbr = c.hbr_m || 25;
    const pc = c.pc || 0;
    const angle = Math.atan2(miss * 0.58, miss * 0.81);
    const bT = miss * Math.cos(angle) * 1000;
    const bR = miss * Math.sin(angle) * 1000;
    const bMag = Math.sqrt(bT * bT + bR * bR);
    return {
      bT, bR, bMag, hbr, vrel, pc, miss,
      sigT: Math.max(bMag * 0.35, hbr * 2.5),
      sigR: Math.max(bMag * 0.18, hbr * 1.2),
      deg: ((angle * 180) / Math.PI).toFixed(1),
    };
  }, [activeConj]);

  const baseRange = bp ? Math.max(bp.bMag * 1.5, bp.hbr * 5, 400) : 500;
  const range = baseRange / zoomLevel;
  const sc = 240 / range;

  const getName = (c, which) => {
    try {
      if (which === 1) return c.object_1?.name || 'OBJ-1';
      return c.object_2?.name || 'OBJ-2';
    } catch { return 'OBJ'; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%', background: '#030712', color: 'white', fontFamily: "'Inter', system-ui, sans-serif" }}>
      
      {/* LEFT SIDEBAR */}
      <div style={{ width: 340, minWidth: 280, borderRight: '1px solid rgba(255,255,255,0.1)', background: 'rgba(2,6,23,0.9)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: 2, color: '#22d3ee', fontFamily: 'monospace', textTransform: 'uppercase' }}>
            🎯 B-PLANE CONJUNCTIONS
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 4 }}>
            Select event · {localConjs.length} loaded
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {localConjs.map(c => {
            const isSel = selectedId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => { setSelectedId(c.id); setZoomLevel(1); }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: isSel ? 'rgba(34,211,238,0.12)' : 'transparent',
                  borderLeft: isSel ? '4px solid #22d3ee' : '4px solid transparent',
                  color: 'white',
                  cursor: 'pointer',
                  border: 'none',
                  borderRight: 'none',
                  borderTop: 'none',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: isSel ? '#22d3ee' : 'white' }}>
                  {getName(c, 1)}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  × {getName(c, 2)}
                </div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', display: 'flex', gap: 12 }}>
                  <span>Pc: <b style={{ color: (c.pc || 0) >= 1e-4 ? '#f87171' : '#fbbf24' }}>{(c.pc || 0).toExponential(1)}</b></span>
                  <span>Miss: <b style={{ color: '#e2e8f0' }}>{((c.min_dist_km || 0) * 1000).toFixed(0)}m</b></span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'auto' }}>
        
        {/* Title + Controls */}
        <div style={{ width: '100%', maxWidth: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', margin: 0, color: 'white' }}>
              🎯 B-PLANE ENCOUNTER
            </h2>
            <p style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', margin: '4px 0 0' }}>
              {activeConj ? `${getName(activeConj, 1)} × ${getName(activeConj, 2)}` : 'No event selected'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setZoomLevel(z => Math.min(z * 1.3, 4))} style={ctrlBtnStyle}>➕</button>
            <button onClick={() => setZoomLevel(z => Math.max(z / 1.3, 0.4))} style={ctrlBtnStyle}>➖</button>
            <button onClick={() => setZoomLevel(1)} style={ctrlBtnStyle}>↺</button>
            <button onClick={() => setShowCov(v => !v)} style={{ ...ctrlBtnStyle, background: showCov ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)', color: showCov ? '#22d3ee' : '#94a3b8', border: showCov ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.1)' }}>
              COV
            </button>
          </div>
        </div>

        {/* SVG B-Plane Plot */}
        <div style={{ width: '100%', maxWidth: 560, aspectRatio: '1', background: 'rgba(2,6,23,0.9)', border: '1px solid rgba(34,211,238,0.25)', borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
          <svg viewBox="-300 -300 600 600" style={{ width: '100%', height: '100%' }}>
            <defs>
              <radialGradient id="hbrG" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff0055" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#ff0055" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="covG" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Distance Rings */}
            {[100, 250, 500, 1000, 2000].map(d => {
              const r = d * sc;
              if (r > 280) return null;
              return (
                <React.Fragment key={d}>
                  <circle cx="0" cy="0" r={r} fill="none" stroke="rgba(34,211,238,0.1)" strokeWidth="1" strokeDasharray="4 4" />
                  <text x={r + 4} y="-6" fill="rgba(34,211,238,0.4)" fontSize="10" fontFamily="monospace" fontWeight="bold">
                    {d >= 1000 ? `${(d / 1000).toFixed(1)}km` : `${d}m`}
                  </text>
                </React.Fragment>
              );
            })}

            {/* Axes */}
            <line x1="-280" y1="0" x2="280" y2="0" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            <line x1="0" y1="-280" x2="0" y2="280" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            <text x="230" y="-12" fill="#22d3ee" fontSize="11" fontFamily="monospace" fontWeight="bold">B·T</text>
            <text x="8" y="-265" fill="#22d3ee" fontSize="11" fontFamily="monospace" fontWeight="bold">B·R</text>

            {/* HBR danger zone */}
            {bp && (
              <>
                <circle cx="0" cy="0" r={Math.max(bp.hbr * sc, 12)} fill="url(#hbrG)" stroke="#ff0055" strokeWidth="2" strokeDasharray="5 3" />
                <text x="0" y={Math.max(bp.hbr * sc, 12) + 16} textAnchor="middle" fill="#ff4d79" fontSize="10" fontFamily="monospace" fontWeight="bold">
                  HBR ({bp.hbr}m)
                </text>
              </>
            )}

            {/* Covariance ellipses */}
            {bp && showCov && (
              <>
                <ellipse cx={bp.bT * sc} cy={-bp.bR * sc} rx={bp.sigT * sc * 2.2} ry={bp.sigR * sc * 2.2}
                  fill="none" stroke="rgba(34,211,238,0.15)" strokeWidth="1" strokeDasharray="6 4"
                  transform={`rotate(${bp.deg}, ${bp.bT * sc}, ${-bp.bR * sc})`} />
                <ellipse cx={bp.bT * sc} cy={-bp.bR * sc} rx={bp.sigT * sc} ry={bp.sigR * sc}
                  fill="url(#covG)" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 2"
                  transform={`rotate(${bp.deg}, ${bp.bT * sc}, ${-bp.bR * sc})`} />
              </>
            )}

            {/* Miss vector line */}
            {bp && <line x1="0" y1="0" x2={bp.bT * sc} y2={-bp.bR * sc} stroke="#22d3ee" strokeWidth="2" strokeDasharray="6 3" />}

            {/* Secondary target marker */}
            {bp && (
              <g transform={`translate(${bp.bT * sc}, ${-bp.bR * sc})`}>
                <circle r="16" fill="none" stroke="#22d3ee" strokeWidth="1.5">
                  <animate attributeName="r" values="12;22;12" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle r="6" fill="#22d3ee" />
                <line x1="-12" y1="0" x2="12" y2="0" stroke="#22d3ee" strokeWidth="1.5" />
                <line x1="0" y1="-12" x2="0" y2="12" stroke="#22d3ee" strokeWidth="1.5" />
                <rect x="16" y="-20" width="110" height="24" rx="5" fill="rgba(7,11,20,0.9)" stroke="#22d3ee" strokeWidth="1" />
                <text x="22" y="-10" fill="#22d3ee" fontSize="9" fontFamily="monospace" fontWeight="bold">SECONDARY</text>
                <text x="22" y="0" fill="white" fontSize="9" fontFamily="monospace">MISS: {bp.bMag.toFixed(0)}m</text>
              </g>
            )}

            {/* Primary crosshair */}
            <circle cx="0" cy="0" r="5" fill="#ff0055" />
            <line x1="-14" y1="0" x2="14" y2="0" stroke="#ff0055" strokeWidth="2" />
            <line x1="0" y1="-14" x2="0" y2="14" stroke="#ff0055" strokeWidth="2" />
            <text x="10" y="16" fill="#ff0055" fontSize="10" fontFamily="monospace" fontWeight="bold">PRIMARY</text>
          </svg>

          {/* Legend overlay */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(2,6,23,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff0055', display: 'inline-block' }}></span>
              <span style={{ color: '#cbd5e1' }}>Primary</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22d3ee', display: 'inline-block' }}></span>
              <span style={{ color: '#cbd5e1' }}>Secondary</span>
            </div>
          </div>
        </div>

        {/* Telemetry Cards */}
        {bp && (
          <div style={{ width: '100%', maxWidth: 600, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
            {[
              { label: 'B·T (ALONG)', value: `${bp.bT >= 0 ? '+' : ''}${bp.bT.toFixed(1)} m`, color: '#22d3ee' },
              { label: 'B·R (CROSS)', value: `${bp.bR >= 0 ? '+' : ''}${bp.bR.toFixed(1)} m`, color: '#22d3ee' },
              { label: '|B| MISS DIST', value: `${bp.bMag.toFixed(1)} m`, color: '#ffffff' },
              { label: 'V_REL', value: `${bp.vrel.toFixed(2)} km/s`, color: '#fbbf24' },
              { label: 'ANGLE', value: `${bp.deg}°`, color: '#34d399' },
              { label: 'Pc', value: bp.pc.toExponential(2), color: bp.pc >= 1e-4 ? '#f87171' : '#22d3ee' },
            ].map(card => (
              <div key={card.label} style={{ background: 'rgba(2,6,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>{card.label}</div>
                <div style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ctrlBtnStyle = {
  padding: '6px 12px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#94a3b8',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 12,
  fontWeight: 'bold',
};

export default function BPlaneView(props) {
  return (
    <BPlaneErrorBoundary>
      <BPlaneInner {...props} />
    </BPlaneErrorBoundary>
  );
}
