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
  const [selectedConjunctionId, setSelectedConjunctionId] = useState(null);
  const [showTrustView, setShowTrustView] = useState(false);
  const [activeTab, setActiveTab] = useState('3d-radar');

  useEffect(() => {
    // Fetch high-priority conjunctions for the feed
    fetch('/api/v1/conjunctions?page=1&size=50')
      .then(res => res.json())
      .then(data => setConjunctions(data.items || []))
      .catch(console.error);
  }, []);

  const selectedConjunction = conjunctions.find(c => c.id === selectedConjunctionId);

  const renderTabContent = () => {
    switch (activeTab) {
      case '3d-radar':
        return (
          <div className="flex-1 relative flex overflow-hidden">
            {/* Background / Center: 3D Visualization */}
            <div className="absolute inset-0 z-0">
              <CinematicEarth selectedConjunction={selectedConjunction} />
              {/* Vignette overlay for cinematic depth */}
              <div className="vignette-overlay" />
              {/* Scan line effect */}
              <div className="scan-line" />
            </div>

            {/* HUD Layer (Pointer events auto only where needed) */}
            <div className="absolute inset-0 z-10 pointer-events-none flex justify-between">
              
              {/* LEFT PANEL: Threat Feed */}
              <div className="pointer-events-auto shadow-2xl shadow-black/80 h-full">
                <ThreatFeed 
                  conjunctions={conjunctions} 
                  selectedPairId={selectedConjunctionId}
                  onSelectPair={setSelectedConjunctionId}
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
        );

      case 'threat-matrix':
        return <ThreatMatrixView conjunctions={conjunctions} onSelectPair={(id) => { setSelectedConjunctionId(id); setActiveTab('3d-radar'); }} />;

      case 'b-plane':
        return <BPlaneView conjunction={selectedConjunction} conjunctions={conjunctions} />;

      case 'cam-solver':
        return <CAMSolverView conjunction={selectedConjunction} conjunctions={conjunctions} />;

      case 'solar-wx':
        return <SolarWxView />;

      case 'ai-copilot':
        return (
          <div className="flex-1 flex overflow-hidden">
            <CopilotPanel sessionId="main" />
            <div className="flex-1 flex items-center justify-center bg-[var(--color-void)]">
              <div className="text-center text-white/30 font-mono uppercase tracking-widest text-xs space-y-3">
                <div className="text-6xl mb-4">🛰️</div>
                <div>AI COPILOT ACTIVE</div>
                <div className="text-[10px] text-white/20">Ask questions about conjunctions, risk assessment, or CAM planning</div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-screen h-screen bg-[var(--color-void)] overflow-hidden flex flex-col text-white selection:bg-cyan-500/30">
      <TopNav 
        onOpenTrustView={() => setShowTrustView(true)} 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      {renderTabContent()}
      
      {showTrustView && (
        <SystemTrustView onClose={() => setShowTrustView(false)} />
      )}
    </div>
  );
}