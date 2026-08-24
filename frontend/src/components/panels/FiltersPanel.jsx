import React from 'react';
import { X, RotateCcw } from 'lucide-react';

export const ALL_TAGS = [
  'BeiDou', 'Cosmos', 'Disaster Monitoring', 'Earth Monitoring',
  'Eutelsat', 'Experimental', 'FLOCK', 'Galaxy', 'Galileo',
  'Gaofen', 'Globalstar', 'GLONASS', 'GOES', 'Gorizont',
  'Hispasat', 'Inmarsat', 'Intelsat', 'Iridium', 'JCSat',
  'Kuiper', 'Lemur', 'Meteor', 'Military', 'Molniya',
  'NAVSTAR', 'Needle', 'NOAA', 'O3b', 'One Web',
  'Orbcomm', 'Qianfan', 'QZS', 'Raduga', 'Search and Rescue',
  'SES', 'Space Station', 'Starlink', 'TBA', 'TDRS',
  'Tracking and Data Relay', 'Turksat', 'TV', 'US Navy navigation',
  'Weather', 'Yaogan'
];

export const ALL_ORBITS = ['GEO', 'MEO', 'LEO', 'HEO', 'Other'];

export default function FiltersPanel({ filters, setFilters, onClose }) {
  const { selectedOrbits, selectedTags, debrisFilter } = filters;

  const toggleOrbit = (orbit) => {
    setFilters(prev => {
      const exists = prev.selectedOrbits.includes(orbit);
      const nextOrbits = exists 
        ? prev.selectedOrbits.filter(o => o !== orbit)
        : [...prev.selectedOrbits, orbit];
      return { ...prev, selectedOrbits: nextOrbits };
    });
  };

  const toggleTag = (tag) => {
    setFilters(prev => {
      const exists = prev.selectedTags.includes(tag);
      const nextTags = exists 
        ? prev.selectedTags.filter(t => t !== tag)
        : [...prev.selectedTags, tag];
      return { ...prev, selectedTags: nextTags };
    });
  };

  const setDebris = (mode) => {
    setFilters(prev => ({ ...prev, debrisFilter: mode }));
  };

  const handleReset = () => {
    setFilters({
      selectedOrbits: [],
      selectedTags: [],
      debrisFilter: 'Show'
    });
  };

  const hasActiveFilters = selectedOrbits.length > 0 || selectedTags.length > 0 || debrisFilter !== 'Show';

  return (
    <div className="flex flex-col text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
        <h2 className="text-xl font-bold tracking-tight text-white font-sans">
          Filters
        </h2>
        {onClose && (
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 1. Orbit Filter */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-slate-400 mb-2 font-sans">
          Orbit filter (multi-select):
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_ORBITS.map(orbit => {
            const isSelected = selectedOrbits.includes(orbit);
            return (
              <button
                key={orbit}
                onClick={() => toggleOrbit(orbit)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-all border ${
                  isSelected 
                    ? 'bg-slate-700/80 border-cyan-500/70 text-white font-bold shadow-[0_0_8px_rgba(6,182,212,0.2)]' 
                    : 'bg-[#0d121f] border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                {orbit}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Tag Filter */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-400 font-sans">
            Tag filter (multi-select):
          </label>
          {selectedTags.length > 0 && (
            <span className="text-[11px] font-mono text-cyan-400">
              {selectedTags.length} active
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto pr-1 py-1 custom-scrollbar">
          {ALL_TAGS.map(tag => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded-full text-xs font-sans transition-all border ${
                  isSelected 
                    ? 'bg-slate-700/90 border-cyan-500 text-cyan-300 font-semibold shadow-[0_0_6px_rgba(6,182,212,0.25)]' 
                    : 'bg-[#0d121f] border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Debris Filter */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-slate-400 mb-2 font-sans">
          Debris filter:
        </label>
        <div className="flex rounded-md overflow-hidden border border-slate-700/60 p-0.5 bg-[#090d16] w-max">
          {['Show', 'Hide', 'Debris only'].map(mode => (
            <button
              key={mode}
              onClick={() => setDebris(mode)}
              className={`px-3 py-1 text-xs font-sans rounded transition-all ${
                debrisFilter === mode 
                  ? 'bg-slate-700 text-white font-semibold' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Note */}
      <p className="text-[11px] text-slate-500 italic mb-5 leading-relaxed font-sans">
        *Note: orbit filter is applied first, then tag filter, and finally debris filter.
      </p>

      {/* Reset Action */}
      <div>
        <button
          onClick={handleReset}
          disabled={!hasActiveFilters}
          className={`flex items-center space-x-1.5 px-3 py-2 rounded text-xs font-mono tracking-wide uppercase transition-all ${
            hasActiveFilters 
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 hover:border-slate-500' 
              : 'bg-slate-900/50 text-slate-600 border border-slate-800/50 cursor-not-allowed'
          }`}
        >
          <X size={13} />
          <span>RESET FILTERS</span>
        </button>
      </div>
    </div>
  );
}
