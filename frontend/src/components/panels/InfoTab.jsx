import React, { useState } from 'react';
import { Star, Link2, Check } from 'lucide-react';

export default function InfoTab({ sat }) {
  const [isStarred, setIsStarred] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!sat) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/track?norad-id=${sat.norad_id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nameUpper = (sat.name || '').toUpperCase();
  
  // Image determination
  let imageUrl = 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=800&q=80';
  let imageLabel = 'Satellite';

  if (nameUpper.includes('STARLINK')) {
    imageUrl = 'https://images.unsplash.com/photo-1517976487541-1317d7b1a293?auto=format&fit=crop&w=800&q=80';
    imageLabel = 'Starlink';
  } else if (nameUpper.includes('ISS') || nameUpper.includes('ZARYA')) {
    imageUrl = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80';
    imageLabel = 'ISS (Space Station)';
  } else if (sat.satellite_type === 'Debris' || nameUpper.includes('DEB')) {
    imageUrl = 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=800&q=80';
    imageLabel = 'Debris Object';
  }

  // Operator determination
  let ownerOperator = sat.country || 'Unavailable';
  let launchVehicle = 'Sign in to view this information';
  let mass = 'Sign in to view this information';
  let dimensions = 'Sign in to view this information';

  if (nameUpper.includes('STARLINK')) {
    ownerOperator = 'SpaceX';
    launchVehicle = 'Falcon 9';
    mass = '~260 - 800 kg';
    dimensions = '300 x 150 cm';
  } else if (nameUpper.includes('ONEWEB')) {
    ownerOperator = 'Eutelsat OneWeb';
    launchVehicle = 'Soyuz / Falcon 9 / LVM3';
    mass = '~150 kg';
  } else if (nameUpper.includes('ISS')) {
    ownerOperator = 'NASA / Roscosmos / ESA / JAXA / CSA';
    mass = '450,000 kg';
    dimensions = '109 x 73 x 20 m';
  }

  const rows = [
    { label: "Intl' Designator", value: sat.intl_designator || 'Unavailable' },
    { label: 'Orbit Type', value: sat.orbit_type || 'LEO' },
    { label: 'Status', value: sat.status || 'Operational' },
    { label: 'Satellite Type', value: sat.satellite_type || 'Payload' },
    { label: 'Country of Origin', value: sat.country || 'United States of America' },
    { label: 'Owner/Operator', value: ownerOperator, isSpecial: ownerOperator.includes('Sign in') },
    { label: 'Launch Site', value: sat.launch_site || 'Cape Canaveral SFS / Vandenberg' },
    { label: 'Launch Vehicle', value: launchVehicle, isSpecial: launchVehicle.includes('Sign in') },
    { label: 'Launch Date', value: sat.launch_date || 'Unavailable' },
    { label: 'Mass (kg)', value: mass, isSpecial: mass.includes('Sign in') },
    { label: 'Dimensions (cm)', value: dimensions, isSpecial: dimensions.includes('Sign in') },
  ];

  return (
    <div className="flex flex-col text-slate-200">
      {/* Satellite Photo Header */}
      <div className="relative w-full h-44 rounded-md overflow-hidden mb-4 border border-slate-800 bg-slate-950">
        <img 
          src={imageUrl} 
          alt={sat.name}
          className="w-full h-full object-cover opacity-85 hover:opacity-100 transition-opacity"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent pointer-events-none" />
        <span className="absolute bottom-2 right-2 px-2 py-0.5 text-[11px] font-mono bg-black/70 text-slate-300 rounded border border-slate-700/50 backdrop-blur-sm">
          Image: {imageLabel}
        </span>
      </div>

      {/* Satellite Title & Actions */}
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
            {copied ? <Check size={16} className="text-emerald-400" /> : <Link2 size={16} />}
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-4 font-sans">
        Sign in to view extended telemetry & proprietary operators
      </div>

      {/* Key-Value Details Table */}
      <div className="border border-slate-800/80 rounded-md overflow-hidden divide-y divide-slate-800/60 bg-[#0d121f]/70">
        {rows.map((row, idx) => (
          <div key={idx} className="flex justify-between items-center px-3 py-2 text-xs hover:bg-slate-800/30 transition-colors">
            <span className="text-sky-400 font-medium font-sans">{row.label}</span>
            <span className={`font-mono text-right max-w-[55%] truncate ${row.isSpecial ? 'text-slate-500 italic' : 'text-slate-200'}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
