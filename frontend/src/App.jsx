import React, { useState } from 'react';
import TopNav from './components/TopNav';
import OrbitalRadarTab from './components/tabs/OrbitalRadarTab';
import ThreatMatrixTab from './components/tabs/ThreatMatrixTab';
import BPlaneLabTab from './components/tabs/BPlaneLabTab';
import CAMSolverTab from './components/tabs/CAMSolverTab';
import SpaceWeatherTab from './components/tabs/SpaceWeatherTab';
import CopilotTab from './components/tabs/CopilotTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('radar');
  const [selectedConjunctionId, setSelectedConjunctionId] = useState(null);
  
  // Function to switch tabs programmatically (e.g. jumping from Threat Matrix to B-Plane)
  const navigateTo = (tabId) => {
    setActiveTab(tabId);
  };

  const renderTab = () => {
    switch(activeTab) {
      case 'radar':
        return <OrbitalRadarTab />;
      case 'matrix':
        return <ThreatMatrixTab 
                  selectedConjunctionId={selectedConjunctionId}
                  setSelectedConjunctionId={setSelectedConjunctionId}
                  navigateTo={navigateTo} 
               />;
      case 'bplane':
        return <BPlaneLabTab 
                  selectedConjunctionId={selectedConjunctionId} 
                  navigateTo={navigateTo} 
               />;
      case 'cam':
        return <CAMSolverTab 
                  selectedConjunctionId={selectedConjunctionId}
                  navigateTo={navigateTo}
               />;
      case 'weather':
        return <SpaceWeatherTab />;
      case 'copilot':
        return <CopilotTab />;
      default:
        return <OrbitalRadarTab />;
    }
  };

  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden flex flex-col font-mono text-white selection:bg-cyan-500/30">
      <TopNav activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex-1 relative">
        {renderTab()}
      </div>
    </div>
  );
}