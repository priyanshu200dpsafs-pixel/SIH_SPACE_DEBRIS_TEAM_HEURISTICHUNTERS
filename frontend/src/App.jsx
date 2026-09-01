import React, { useState, useEffect } from 'react';
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

          {/* HUD Panels Layer */}
          <div className="absolute inset-0 z-10 pointer-events-none flex justify-between">
            {/* LEFT PANEL: Threat Feed */}
            <div className="pointer-events-auto shadow-2xl shadow-black/80 h-full">
              <ThreatFeed 
                conjunctions={conjunctions} 
                selectedPairId={selectedConjunctionId}
                onSelectPair={handleSelectConjunction}
              />
            </div>

            {/* RIGHT PANEL: Event Intelligence */}
            <div className="pointer-events-auto shadow-2xl shadow-black/80 h-full">
              <EventIntelligencePanel 
                conjunction={selectedConjunction} 
              />
            </div>
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