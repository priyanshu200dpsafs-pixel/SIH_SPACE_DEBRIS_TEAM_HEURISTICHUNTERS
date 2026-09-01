import React, { useState, useEffect } from 'react';
import { AlertTriangle, Crosshair, ChevronRight, ChevronLeft } from 'lucide-react';
import TopNav from './components/TopNav';
import CinematicEarth from './components/CinematicEarth';
import ThreatFeed from './components/ThreatFeed';
import EventIntelligencePanel from './components/panels/EventIntelligencePanel';
import SystemTrustView from './components/panels/SystemTrustView';
import CopilotPanel from './components/CopilotPanel';
import ThreatMatrixView from './components/views/ThreatMatrixView';
import BPlaneView from './components/views/BPlaneView';
import CAMSolverView from './components/views/CAMSolverView';
import SolarWxView from './components/views/SolarWxView';

export default function App() {
  const [conjunctions, setConjunctions] = useState([]);
  const [selectedConjunction, setSelectedConjunction] = useState(null);
  const [selectedConjunctionId, setSelectedConjunctionId] = useState(null);
  const [showTrustView, setShowTrustView] = useState(false);
  const [activeTab, setActiveTab] = useState('3d-radar');
  const [showLeftDrawer, setShowLeftDrawer] = useState(true);
  const [showRightDrawer, setShowRightDrawer] = useState(true);

  useEffect(() => {
    // Fetch high-priority conjunctions for the feed
    fetch('/api/v1/conjunctions?page=1&size=50')
      .then(res => res.json())
      .then(data => {
        const items = data.items || [];
        setConjunctions(items);
        if (items.length > 0 && !selectedConjunction) {
          // Default to first conjunction if none selected
          setSelectedConjunction(items[0]);
          setSelectedConjunctionId(items[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const handleSelectConjunction = (conjOrId) => {
    if (typeof conjOrId === 'object' && conjOrId !== null) {
      setSelectedConjunction(conjOrId);
      setSelectedConjunctionId(conjOrId.id);
    } else {
      setSelectedConjunctionId(conjOrId);
      const found = conjunctions.find(c => c.id === conjOrId);
      if (found) setSelectedConjunction(found);
    }
    // Auto-open right drawer when a conjunction is selected to show analytics
    setShowRightDrawer(true);
  };

  const handleSelectFromMatrix = (conjOrId) => {
    handleSelectConjunction(conjOrId);
    setActiveTab('3d-radar');
  };

  return (
    <div className="w-screen h-screen bg-[var(--color-void)] overflow-hidden flex flex-col text-white selection:bg-cyan-500/30">
      <TopNav 
        onOpenTrustView={() => setShowTrustView(true)} 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      <div className="flex-1 relative overflow-hidden flex">
        {/* 3D RADAR VIEW: Keep persistently mounted so Three.js scene stays in memory and responds instantly */}
        <div className={`absolute inset-0 z-0 flex ${activeTab === '3d-radar' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="absolute inset-0 z-0">
            <CinematicEarth selectedConjunction={selectedConjunction} />
            <div className="vignette-overlay" />
            <div className="scan-line" />
          </div>

          {/* HUD Panels Layer (Floating Drawers) */}
          <div className="absolute inset-0 z-10 pointer-events-none flex justify-between p-3.5 overflow-hidden">
            {/* LEFT PANEL: Threat Feed */}
            <div className={`pointer-events-auto transition-transform duration-300 ease-out h-full ${showLeftDrawer ? 'translate-x-0' : '-translate-x-[420px]'}`}>
              <ThreatFeed 
                conjunctions={conjunctions} 
                selectedPairId={selectedConjunctionId}
                onSelectPair={handleSelectConjunction}
                onCollapse={() => setShowLeftDrawer(false)}
              />
            </div>

            {/* Left Edge Expand Tab (When Threat Feed is Collapsed) */}
            {!showLeftDrawer && (
              <button 
                onClick={() => setShowLeftDrawer(true)} 
                className="absolute left-3.5 top-5 z-20 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950/90 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold uppercase tracking-wider backdrop-blur-2xl shadow-[0_0_20px_rgba(0,0,0,0.9)] hover:bg-cyan-950/70 hover:border-cyan-400 transition-all cursor-pointer pointer-events-auto"
                title="Expand Threat Feed"
              >
                <AlertTriangle size={15} className="text-red-400" />
                <span>THREAT FEED ({conjunctions.length})</span>
                <ChevronRight size={15} />
              </button>
            )}

            {/* RIGHT PANEL: Event Intelligence */}
            <div className={`pointer-events-auto transition-transform duration-300 ease-out h-full ${showRightDrawer ? 'translate-x-0' : 'translate-x-[480px]'}`}>
              <EventIntelligencePanel 
                conjunction={selectedConjunction} 
                onCollapse={() => setShowRightDrawer(false)}
              />
            </div>

            {/* Right Edge Expand Tab (When Event Intel is Collapsed) */}
            {!showRightDrawer && (
              <button 
                onClick={() => setShowRightDrawer(true)} 
                className="absolute right-3.5 top-5 z-20 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950/90 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold uppercase tracking-wider backdrop-blur-2xl shadow-[0_0_20px_rgba(0,0,0,0.9)] hover:bg-cyan-950/70 hover:border-cyan-400 transition-all cursor-pointer pointer-events-auto"
                title="Expand Event Analysis"
              >
                <ChevronLeft size={15} />
                <Crosshair size={15} className="text-cyan-400" />
                <span>EVENT INTEL</span>
              </button>
            )}
          </div>
        </div>

        {/* OTHER FULL-PAGE TAB VIEWS */}
        {activeTab === 'threat-matrix' && (
          <div className="absolute inset-0 z-20 flex bg-[var(--color-void)]">
            <ThreatMatrixView conjunctions={conjunctions} onSelectPair={handleSelectFromMatrix} />
          </div>
        )}

        {activeTab === 'b-plane' && (
          <div className="absolute inset-0 z-20 flex bg-[var(--color-void)]">
            <BPlaneView conjunction={selectedConjunction} conjunctions={conjunctions} />
          </div>
        )}

        {activeTab === 'cam-solver' && (
          <div className="absolute inset-0 z-20 flex bg-[var(--color-void)]">
            <CAMSolverView conjunction={selectedConjunction} conjunctions={conjunctions} />
          </div>
        )}

        {activeTab === 'solar-wx' && (
          <div className="absolute inset-0 z-20 flex bg-[var(--color-void)]">
            <SolarWxView />
          </div>
        )}

        {activeTab === 'ai-copilot' && (
          <div className="absolute inset-0 z-20 flex overflow-hidden bg-[var(--color-void)]">
            <CopilotPanel sessionId="main" />
            <div className="flex-1 flex items-center justify-center bg-[var(--color-void)]">
              <div className="text-center text-white/30 font-mono uppercase tracking-widest text-xs space-y-3">
                <div className="text-6xl mb-4">🛰️</div>
                <div>AI COPILOT ACTIVE</div>
                <div className="text-[10px] text-white/20">Ask questions about conjunctions, risk assessment, or CAM planning</div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {showTrustView && (
        <SystemTrustView onClose={() => setShowTrustView(false)} />
      )}
    </div>
  );
}