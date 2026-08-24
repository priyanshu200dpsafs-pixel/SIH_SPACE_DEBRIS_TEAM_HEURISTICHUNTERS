import React, { useState } from 'react';
import { Info, Gauge, LineChart as ChartIcon, SlidersHorizontal, X } from 'lucide-react';
import InfoTab from './InfoTab';
import TLETab from './TLETab';
import GraphsTab from './GraphsTab';
import FiltersPanel from './FiltersPanel';

export default function SatellitePanel({
  sat,
  filters,
  setFilters,
  activeTab,
  setActiveTab,
  onClose
}) {
  const tabs = [
    { id: 'info', label: 'Info', icon: Info },
    { id: 'tle', label: 'TLE panel', icon: Gauge },
    { id: 'graphs', label: 'Graphs', icon: ChartIcon },
    { id: 'filters', label: 'Filters panel', icon: SlidersHorizontal }
  ];

  return (
    <div className="absolute top-4 right-4 z-40 w-[390px] max-h-[calc(100vh-2rem)] flex flex-col bg-[#080c14]/95 border border-slate-700/60 rounded-lg shadow-2xl backdrop-blur-md overflow-hidden text-slate-200 animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Top Icon Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-[#0c121e]/90">
        <div className="flex items-center space-x-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`p-2 rounded transition-colors group relative ${
                  isActive
                    ? 'bg-slate-700/80 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
                title={tab.label}
              >
                <Icon size={18} />
                {/* Tooltip on hover */}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block px-2 py-0.5 text-[10px] font-sans bg-black/90 text-white rounded whitespace-nowrap border border-slate-700/60 z-50 pointer-events-none">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded transition-colors"
            title="Close Panel"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Main Tab Content */}
      <div className="p-4 overflow-y-auto max-h-[calc(100vh-6rem)] custom-scrollbar">
        {activeTab === 'info' && (
          sat ? <InfoTab sat={sat} /> : (
            <div className="text-center py-10 text-slate-500 font-mono text-xs">
              Click any satellite on the globe to inspect full details.
            </div>
          )
        )}

        {activeTab === 'tle' && (
          sat ? <TLETab sat={sat} /> : (
            <div className="text-center py-10 text-slate-500 font-mono text-xs">
              Click any satellite on the globe to inspect orbital parameters.
            </div>
          )
        )}

        {activeTab === 'graphs' && (
          sat ? <GraphsTab sat={sat} /> : (
            <div className="text-center py-10 text-slate-500 font-mono text-xs">
              Click any satellite on the globe to generate telemetry curves.
            </div>
          )
        )}

        {activeTab === 'filters' && (
          <FiltersPanel
            filters={filters}
            setFilters={setFilters}
            onClose={() => setActiveTab('info')}
          />
        )}
      </div>
    </div>
  );
}
