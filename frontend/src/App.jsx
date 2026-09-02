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
import ValidationLabView from './components/views/ValidationLabView';

export default function App() {
  const [conjunctions, setConjunctions] = useState([]);
  const [selectedConjunction, setSelectedConjunction] = useState(null);
  const [selectedConjunctionId, setSelectedConjunctionId] = useState(null);
  const [showTrustView, setShowTrustView] = useState(false);
  const [activeTab, setActiveTab] = useState('3d-radar');
  const [showLeftDrawer, setShowLeftDrawer] = useState(true);
  const [showRightDrawer, setShowRightDrawer] = useState(false);
  const [isSatellitePanelOpen, setIsSatellitePanelOpen] = useState(false);
  const [showAskAres, setShowAskAres] = useState(false);
  const [isEngineerMode, setIsEngineerMode] = useState(false);

  useEffect(() => {
    fetch('/api/v1/conjunctions?page=1&size=50')
      .then(res => res.json())
      .then(data => {
        const items = data.items || [];
        setConjunctions(items);
        if (items.length > 0 && !selectedConjunction) {
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
    setShowRightDrawer(true);
  };

  const handleSelectFromMatrix = (conjOrId) => {
    handleSelectConjunction(conjOrId);
    setActiveTab('3d-radar');
  };

  return (
    <div className="w-screen h-screen bg-[#030712] overflow-hidden flex flex-col text-white selection:bg-cyan-500/30">
      <TopNav 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isEngineerMode={isEngineerMode}
        onToggleEngineerMode={() => setIsEngineerMode(prev => !prev)}
      />
      
      <div className="flex-1 relative overflow-hidden flex w-full">
        
        {/* 3D RADAR (Globe + Drawers) */}
        {/* We keep it mounted so Three.js doesn't destroy context */}
        <div className={`absolute inset-0 z-0 flex ${activeTab === '3d-radar' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          
          {/* CENTER GLOBE: Sized to be the Hero (~60% width roughly between panels) */}
          <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
             <div className="w-full h-full pointer-events-auto">
                <CinematicEarth 
                  selectedConjunction={selectedConjunction} 
                  onSelectSatellite={() => setShowRightDrawer(false)}
                  onPanelStateChange={setIsSatellitePanelOpen}
                />
             </div>
             <div className="vignette-overlay pointer-events-none" />
             <div className="scan-line pointer-events-none" />
          </div>

          <div className="absolute inset-0 z-10 pointer-events-none flex justify-between p-4 overflow-hidden">
            {/* LEFT PANEL: Priority Queue */}
            <div className={`pointer-events-auto transition-transform duration-300 ease-out h-full w-[460px] ${showLeftDrawer ? 'translate-x-0' : '-translate-x-[460px]'}`}>
              <ThreatFeed 
                conjunctions={conjunctions} 
                selectedPairId={selectedConjunctionId}
                onSelectPair={handleSelectConjunction}
                onCollapse={() => setShowLeftDrawer(false)}
              />
            </div>

            {!showLeftDrawer && (
              <button 
                onClick={() => setShowLeftDrawer(true)} 
                className="absolute left-4 top-4 z-20 flex items-center gap-2 px-4 py-2 rounded bg-[#0f172a]/90 border border-white/10 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer pointer-events-auto shadow-lg"
              >
                <AlertTriangle size={14} className="text-amber-500" />
                <span>PRIORITY QUEUE</span>
                <ChevronRight size={14} />
              </button>
            )}

            {/* RIGHT PANEL: Event Brief */}
            <div className={`pointer-events-auto transition-transform duration-300 ease-out h-full w-[440px] ${showRightDrawer ? 'translate-x-0' : 'translate-x-[440px]'}`}>
              <EventIntelligencePanel 
                conjunction={selectedConjunction} 
                onCollapse={() => setShowRightDrawer(false)}
              />
            </div>

            {!showRightDrawer && !isSatellitePanelOpen && (
              <button 
                onClick={() => setShowRightDrawer(true)} 
                className="absolute right-4 top-4 z-20 flex items-center gap-2 px-4 py-2 rounded bg-[#0f172a]/90 border border-white/10 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer pointer-events-auto shadow-lg"
              >
                <ChevronLeft size={14} />
                <Crosshair size={14} className="text-cyan-500" />
                <span>EVENT BRIEF</span>
              </button>
            )}
          </div>
        </div>

        {/* THREAT MATRIX */}
        {activeTab === 'threat-matrix' && (
          <div className="absolute inset-0 z-20 flex bg-[#030712]">
            <ThreatMatrixView conjunctions={conjunctions} onSelectPair={handleSelectFromMatrix} />
          </div>
        )}

        {/* B-PLANE */}
        {activeTab === 'b-plane' && (
          <div className="absolute inset-0 z-20 flex bg-[#030712]">
            <BPlaneView conjunction={selectedConjunction} conjunctions={conjunctions} />
          </div>
        )}

        {/* CAM SOLVER */}
        {activeTab === 'cam-solver' && (
          <div className="absolute inset-0 z-20 flex bg-[#030712]">
            <CAMSolverView conjunction={selectedConjunction} conjunctions={conjunctions} />
          </div>
        )}

        {/* SOLAR WX */}
        {activeTab === 'solar-wx' && (
          <div className="absolute inset-0 z-20 flex bg-[#030712]">
            <SolarWxView />
          </div>
        )}

        {/* AI COPILOT */}
        {activeTab === 'ai-copilot' && (
          <div className="absolute inset-0 z-20 flex bg-[#030712]">
            <CopilotPanel sessionId="main" />
          </div>
        )}

        {/* VALIDATION LAB */}
        {activeTab === 'validation-lab' && (
          <div className="absolute inset-0 z-20 flex bg-[#030712]">
            <ValidationLabView />
          </div>
        )}
      </div>
    </div>
  );
}