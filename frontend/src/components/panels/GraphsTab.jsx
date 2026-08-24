import React, { useState, useMemo } from 'react';
import { Star, Link2, Check } from 'lucide-react';
import * as satellite from 'satellite.js';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

export default function GraphsTab({ sat }) {
  const [revolutions, setRevolutions] = useState(1);
  const [isStarred, setIsStarred] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!sat) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/track?norad-id=${sat.norad_id}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Compute revolution telemetry data using satellite.js propagation
  const chartData = useMemo(() => {
    if (!sat.satrec) return [];

    const satrec = sat.satrec;
    const meanMotionRevDay = sat.mean_motion ?? (satrec.no ? (satrec.no * 720 / Math.PI) : 15.0);
    const periodMinutes = meanMotionRevDay > 0 ? (1440 / meanMotionRevDay) : 96;
    const totalDurationMins = periodMinutes * revolutions;
    
    const numPoints = Math.min(80, Math.max(35, revolutions * 35));
    const stepMins = totalDurationMins / numPoints;
    const now = new Date();
    const data = [];

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 0; i <= numPoints; i++) {
      const sampleTime = new Date(now.getTime() + i * stepMins * 60 * 1000);
      try {
        const pv = satellite.propagate(satrec, sampleTime);
        if (pv.position && pv.velocity) {
          const vMagnitudeKmS = Math.sqrt(
            pv.velocity.x * pv.velocity.x + 
            pv.velocity.y * pv.velocity.y + 
            pv.velocity.z * pv.velocity.z
          );
          const speedKmH = Math.round(vMagnitudeKmS * 3600);
          
          const gmst = satellite.gstime(sampleTime);
          const gd = satellite.eciToGeodetic(pv.position, gmst);
          const heightKm = Math.round(gd.height);

          const month = monthNames[sampleTime.getUTCMonth()];
          const day = sampleTime.getUTCDate().toString().padStart(2, '0');
          const hours = sampleTime.getUTCHours().toString().padStart(2, '0');
          const mins = sampleTime.getUTCMinutes().toString().padStart(2, '0');
          const timeLabel = `${month}/${day} ${hours}:${mins}`;

          data.push({
            time: timeLabel,
            speed: speedKmH,
            height: heightKm,
            timestamp: sampleTime.getTime()
          });
        }
      } catch (e) {}
    }

    return data;
  }, [sat, revolutions]);

  // Compute chart domains
  const speedMin = useMemo(() => {
    if (chartData.length === 0) return 27000;
    const min = Math.min(...chartData.map(d => d.speed));
    return Math.floor((min - 20) / 10) * 10;
  }, [chartData]);

  const speedMax = useMemo(() => {
    if (chartData.length === 0) return 28000;
    const max = Math.max(...chartData.map(d => d.speed));
    return Math.ceil((max + 20) / 10) * 10;
  }, [chartData]);

  const heightMin = useMemo(() => {
    if (chartData.length === 0) return 500;
    const min = Math.min(...chartData.map(d => d.height));
    return Math.floor((min - 10) / 10) * 10;
  }, [chartData]);

  const heightMax = useMemo(() => {
    if (chartData.length === 0) return 600;
    const max = Math.max(...chartData.map(d => d.height));
    return Math.ceil((max + 10) / 10) * 10;
  }, [chartData]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0b101b] border border-slate-700/80 p-2.5 rounded shadow-xl text-xs font-mono">
          <p className="text-slate-400 mb-1">{label} UTC</p>
          <p className="text-cyan-400 font-bold">
            {payload[0].name}: {payload[0].value.toLocaleString()} {payload[0].unit}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col text-slate-200">
      {/* Title & Actions */}
      <div className="flex items-center justify-between mb-3">
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

      {/* Revolutions Selection */}
      <div className="mb-4">
        <label className="block text-xs text-slate-400 mb-1.5">
          Choose the number of revolutions to display:
        </label>
        <div className="relative">
          <select
            value={revolutions}
            onChange={(e) => setRevolutions(Number(e.target.value))}
            className="w-full bg-[#0d121f] border border-slate-700/70 rounded px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 appearance-none cursor-pointer"
          >
            <option value={1}>One revolution</option>
            <option value={2}>2 revolutions</option>
            <option value={3}>3 revolutions</option>
            <option value={4}>4 revolutions</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 text-xs">
            ▼
          </div>
        </div>
      </div>

      {/* Chart 1: Speed (km/h) */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-slate-300 mb-2 font-sans">
          Speed (km/h):
        </h3>
        <div className="w-full h-44 bg-[#090d16] border border-slate-800/80 rounded-md p-2 relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 5, bottom: 5 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="1 1" />
              <XAxis 
                dataKey="time" 
                tick={{ fill: '#64748b', fontSize: 9 }}
                stroke="#334155"
                interval="preserveStartEnd"
                minTickGap={25}
              />
              <YAxis 
                domain={[speedMin, speedMax]}
                tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'monospace' }}
                stroke="#334155"
                tickFormatter={(v) => v.toLocaleString()}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="speed" 
                name="Speed"
                unit="km/h"
                stroke="#38bdf8" 
                strokeWidth={2} 
                dot={false}
                isAnimationActive={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Height (km) */}
      <div className="mb-2">
        <h3 className="text-xs font-semibold text-slate-300 mb-2 font-sans">
          Height (km):
        </h3>
        <div className="w-full h-44 bg-[#090d16] border border-slate-800/80 rounded-md p-2 relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 5, bottom: 5 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="1 1" />
              <XAxis 
                dataKey="time" 
                tick={{ fill: '#64748b', fontSize: 9 }}
                stroke="#334155"
                interval="preserveStartEnd"
                minTickGap={25}
              />
              <YAxis 
                domain={[heightMin, heightMax]}
                tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'monospace' }}
                stroke="#334155"
                tickFormatter={(v) => v.toLocaleString()}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="height" 
                name="Height"
                unit="km"
                stroke="#38bdf8" 
                strokeWidth={2} 
                dot={false}
                isAnimationActive={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
