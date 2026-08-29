import React, { useState, useEffect } from 'react';
import TopNav from './components/TopNav';
import CinematicEarth from './components/CinematicEarth';
import ThreatFeed from './components/ThreatFeed';
import EventIntelligencePanel from './components/panels/EventIntelligencePanel';
import SystemTrustView from './components/panels/SystemTrustView';

export default function App() {
  const [conjunctions, setConjunctions] = useState([]);
  const [selectedConjunctionId, setSelectedConjunctionId] = useState(null);
  const [showTrustView, setShowTrustView] = useState(false);

  useEffect(() => {
    // Fetch high-priority conjunctions for the feed
    fetch('/api/v1/conjunctions?page=1&size=50')
      .then(res => res.json())
      .then(data => setConjunctions(data.items || []))
      .catch(console.error);
  }, []);

  const selectedConjunction = conjunctions.find(c => c.id === selectedConjunctionId);

  return (
    <div className="w-screen h-screen bg-[var(--color-void)] overflow-hidden flex flex-col text-white selection:bg-cyan-500/30">
      <TopNav onOpenTrustView={() => setShowTrustView(true)} />
      
      <div className="flex-1 relative flex overflow-hidden">
        
        {/* Background / Center: 3D Visualization */}
        <div className="absolute inset-0 z-0">
          <CinematicEarth />
          {/* Vignette overlay for cinematic depth */}
          <div className="vignette-overlay" />
          {/* Scan line effect */}
          <div className="scan-line" />
        </div>

        {/* HUD Layer (Pointer events auto only where needed) */}
        <div className="absolute inset-0 z-10 pointer-events-none flex justify-between">
          
          {/* LEFT PANEL: Threat Feed */}
          <div className="pointer-events-auto shadow-2xl shadow-black/80">
            <ThreatFeed 
              conjunctions={conjunctions} 
              selectedPairId={selectedConjunctionId}
              onSelectPair={setSelectedConjunctionId}
            />
          </div>

          {/* RIGHT PANEL: Event Intelligence */}
          <div className="pointer-events-auto shadow-2xl shadow-black/80">
            <EventIntelligencePanel 
              conjunction={selectedConjunction} 
            />
          </div>

        </div>

      </div>
      
      {showTrustView && (
        <SystemTrustView onClose={() => setShowTrustView(false)} />
      )}
    </div>
  );
}