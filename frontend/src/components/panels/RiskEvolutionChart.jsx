const API_BASE_URL = import.meta.env.VITE_API_URL || '';
import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function RiskEvolutionChart({ pairId, id1, id2, currentTca }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true);
        // We use the new history endpoint based on exact pair and approx TCA window
        const res = await fetch(`${API_BASE_URL}/api/v1/conjunctions/${id1}/${id2}/history?tca=${encodeURIComponent(currentTca)}`);
        if (!res.ok) throw new Error('Failed to fetch event history');
        
        const data = await res.json();
        
        // Format data for Recharts
        // Time to TCA = TCA - recorded_at (in hours or days)
        const formatted = data.map(obs => {
          const tca = new Date(obs.tca_prediction);
          const recorded = new Date(obs.recorded_at);
          const diffMs = tca - recorded;
          const diffHours = diffMs / (1000 * 60 * 60);
          
          let timeLabel = '';
          if (diffHours > 48) timeLabel = `T-${(diffHours / 24).toFixed(1)}d`;
          else timeLabel = `T-${diffHours.toFixed(1)}h`;
          
          return {
            ...obs,
            timeLabel,
            diffHours,
            displayPc: obs.pc.toExponential(2),
            logPc: obs.log10_pc,
            missDist: obs.min_dist_km,
            dataQuality: obs.data_quality_score,
            dateObj: recorded
          };
        });
        
        // Ensure chronological order
        formatted.sort((a, b) => b.diffHours - a.diffHours);
        
        setHistory(formatted);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    if (id1 && id2 && currentTca) {
      fetchHistory();
    }
  }, [id1, id2, currentTca]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-white/50 space-y-2">
        <Loader2 className="animate-spin text-cyan-500" size={24} />
        <span className="text-[10px] font-mono tracking-widest uppercase">Loading Timeline</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-rose-400 text-xs p-4 bg-rose-500/10 rounded">
        <AlertCircle size={14} /> Failed to load event history.
      </div>
    );
  }
  
  if (history.length === 0) {
    return (
      <div className="text-center py-6 text-white/40 text-xs font-mono border border-dashed border-white/10 rounded">
        No historical observations recorded for this event.
      </div>
    );
  }

  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-black/90 border border-slate-700 p-2 rounded shadow-xl text-xs font-mono w-48">
          <div className="text-cyan-400 mb-1 border-b border-slate-700 pb-1">{data.timeLabel}</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Recorded:</span>
              <span className="text-slate-200">{data.dateObj.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Pc:</span>
              <span className="text-orange-400 font-bold">{data.displayPc}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Miss (km):</span>
              <span className="text-emerald-400">{data.missDist.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Quality:</span>
              <span className="text-sky-300">{data.dataQuality ? data.dataQuality.toFixed(1) : 'N/A'}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-black/30 rounded border border-white/10 p-2 overflow-hidden">
      <div className="flex justify-between items-center mb-3 px-1">
        <span className="text-[10px] uppercase font-bold text-white/70 tracking-wider">Risk Evolution Timeline</span>
        <span className="text-[9px] text-white/40 font-mono">Observations: {history.length}</span>
      </div>
      
      <div className="h-40 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
            <XAxis 
              dataKey="timeLabel" 
              stroke="#ffffff40" 
              fontSize={9} 
              tickMargin={5}
              minTickGap={15}
            />
            {/* Primary Y-Axis for log10(Pc) */}
            <YAxis 
              yAxisId="left"
              stroke="#f9731680" 
              fontSize={9}
              domain={[-10, 0]}
              tickFormatter={(val) => `1e${val}`}
            />
            {/* Secondary Y-Axis for Miss Distance */}
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              stroke="#10b98180" 
              fontSize={9}
              tickFormatter={(val) => `${val.toFixed(0)}km`}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Actionable Risk Threshold Line */}
            <ReferenceLine yAxisId="left" y={-4} stroke="#ef444450" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Red Threshold', fill: '#ef444450', fontSize: 8 }} />
            
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="logPc" 
              stroke="#f97316" 
              strokeWidth={2}
              dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              name="Probability of Collision"
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="missDist" 
              stroke="#10b981" 
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="Miss Distance"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 justify-center mt-2 text-[9px] font-mono text-white/50">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Pc Trend</div>
        <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-emerald-500 border border-dashed border-emerald-500"></div> Miss Distance</div>
      </div>
    </div>
  );
}
