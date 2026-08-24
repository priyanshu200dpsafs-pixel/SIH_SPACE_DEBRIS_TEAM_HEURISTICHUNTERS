import React, { useState } from 'react';
import { Star, Link2, Copy, Check } from 'lucide-react';

export default function TLETab({ sat }) {
  const [isStarred, setIsStarred] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedTLE, setCopiedTLE] = useState(false);

  if (!sat) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/track?norad-id=${sat.norad_id}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Build full TLE text
  const tleText = `${sat.name}\n${sat.tle_line1 || '1 00000U 00000    00000.00000000  .00000000  00000-0  00000-0 0  9990'}\n${sat.tle_line2 || '2 00000   0.0000   0.0000 0000000   0.0000   0.0000 15.00000000    00'}`;

  const handleCopyTLE = () => {
    navigator.clipboard.writeText(tleText);
    setCopiedTLE(true);
    setTimeout(() => setCopiedTLE(false), 2000);
  };

  // Calculate time since epoch
  let epochText = sat.epoch || 'Recently';
  let timeAgoText = 'Recently';
  try {
    const epochDate = new Date(sat.epoch);
    if (!isNaN(epochDate.getTime())) {
      const diffMs = Date.now() - epochDate.getTime();
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      timeAgoText = `${Math.max(0, diffHrs)} hours, ${Math.max(0, diffMins)} minutes ago`;
      epochText = epochDate.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    }
  } catch (e) {}

  // Orbital parameters from satrec
  const satrec = sat.satrec || {};
  const inclinationDeg = sat.inclination ?? (satrec.inclo ? (satrec.inclo * 180 / Math.PI) : 0);
  const raanDeg = sat.raan ?? (satrec.nodeo ? (satrec.nodeo * 180 / Math.PI) : 0);
  const argPerigeeDeg = sat.arg_perigee ?? (satrec.argpo ? (satrec.argpo * 180 / Math.PI) : 0);
  const meanAnomalyDeg = sat.mean_anomaly ?? (satrec.mo ? (satrec.mo * 180 / Math.PI) : 0);
  const eccentricity = sat.eccentricity ?? satrec.ecco ?? 0;
  
  // Mean motion in rev/day: satrec.no is in rad/min. rev/day = no * (1440 / 2pi) = no * 720 / pi
  const meanMotionRevDay = sat.mean_motion ?? (satrec.no ? (satrec.no * 720 / Math.PI) : 15.0);
  
  // Orbital period in minutes
  const periodMinutes = meanMotionRevDay > 0 ? (1440 / meanMotionRevDay) : 96;
  const periodHours = Math.floor(periodMinutes / 60);
  const periodRemMins = Math.round(periodMinutes % 60);
  const periodText = periodHours > 0 
    ? `${periodHours} hour${periodHours > 1 ? 's' : ''}, ${periodRemMins} minutes` 
    : `${periodRemMins} minutes`;

  // Live telemetry
  const speedKmH = sat.velocity 
    ? `${Math.round(sat.velocity * 3600).toLocaleString()} km/h` 
    : '27,250 km/h';
  const heightKm = sat.alt 
    ? `${Math.round(sat.alt * 6371).toLocaleString()} km` 
    : '550 km';
  const latFormatted = `${(sat.lat || 0).toFixed(2)}°`;
  const lngFormatted = `${(sat.lng || 0).toFixed(2)}°`;

  const orbitRows = [
    { label: 'NORAD ID', value: sat.norad_id || '56477' },
    { label: 'Name', value: sat.name },
    { label: 'Epoch', value: epochText },
    { label: 'Speed', value: speedKmH },
    { label: 'Height', value: heightKm },
    { label: 'Latitude', value: latFormatted },
    { label: 'Longitude', value: lngFormatted },
    { label: 'Inclination', value: `${inclinationDeg.toFixed(2)}°` },
    { label: 'Mean Motion', value: `${meanMotionRevDay.toFixed(2)} rev/day` },
    { label: 'Orbital Period', value: periodText },
    { label: 'Eccentricity', value: eccentricity.toFixed(6) },
    { label: 'Right Ascension of Ascending Node', value: `${raanDeg.toFixed(2)}°` },
    { label: 'Argument of Perigee', value: `${argPerigeeDeg.toFixed(2)}°` },
    { label: 'Mean Anomaly', value: `${meanAnomalyDeg.toFixed(2)}°` },
  ];

  return (
    <div className="flex flex-col text-slate-200">
      {/* Title & Actions */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold tracking-tight text-white font-mono uppercase truncate mr-2">
          {sat.name}
        </h2>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setIsStarred(!isStarred)}
            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 rounded transition-colors"
            title="Bookmark Satellite"
          >
            <Star size={16} className={isStarred ? 'fill-amber-400 text-amber-400' : ''} />
          </button>
          <button 
            onClick={handleCopyLink}
            className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800/80 rounded transition-colors"
            title="Copy Track Link"
          >
            {copiedLink ? <Check size={16} className="text-emerald-400" /> : <Link2 size={16} />}
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-3 font-sans">
        Two line element from {timeAgoText}
      </div>

      {/* Raw TLE Box */}
      <div className="relative mb-4 p-3 bg-black/75 rounded-md border border-slate-800 font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto shadow-inner group">
        <button 
          onClick={handleCopyTLE}
          className="absolute top-2 right-2 p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700/50 transition-all opacity-80 group-hover:opacity-100"
          title="Copy TLE"
        >
          {copiedTLE ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
        </button>
        <pre className="select-all font-mono">
          {tleText}
        </pre>
      </div>

      {/* Orbital Elements Table */}
      <div className="border border-slate-800/80 rounded-md overflow-hidden divide-y divide-slate-800/60 bg-[#0d121f]/70 mb-2">
        {orbitRows.map((row, idx) => (
          <div key={idx} className="flex justify-between items-center px-3 py-2 text-xs hover:bg-slate-800/30 transition-colors">
            <span className="text-sky-400 font-medium font-sans">{row.label}</span>
            <span className="font-mono text-slate-200 text-right max-w-[55%] truncate">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
