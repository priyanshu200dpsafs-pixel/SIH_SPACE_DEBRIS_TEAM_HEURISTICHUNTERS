import React, { useRef, useEffect, useState } from 'react';
import Globe from 'react-globe.gl';

export default function GlobeView({ conjunctions, selectedPairId, onSelectPair }) {
  const globeEl = useRef();
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Process conjunctions into arcs and points
  // In a real SGP4 propagation, we would map the lat/lng of TCA. 
  // For the dashboard demo, since we only have min_dist_km, we will visually distribute them.
  const [arcsData, setArcsData] = useState([]);
  
  useEffect(() => {
    if (conjunctions && conjunctions.length > 0) {
      // Create random lat/lng distributions for visual demonstration of conjunctions
      // A full implementation would pipe SGP4 ECI state vectors to Lat/Lng coordinates.
      const mapped = conjunctions.map((c, i) => {
        const lat = (Math.random() - 0.5) * 160;
        const lng = (Math.random() - 0.5) * 360;
        return {
          id: c.id,
          startLat: lat - 5,
          startLng: lng - 5,
          endLat: lat,
          endLng: lng,
          color: c.id === selectedPairId ? '#00f0ff' : (c.pc >= 1e-4 ? '#ff003c' : '#ffaa00'),
          label: `Conjunction ${c.id}`
        };
      });
      setArcsData(mapped);
    }
  }, [conjunctions, selectedPairId]);

  return (
    <div className="absolute inset-0 z-0 bg-black cursor-crosshair">
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        arcsData={arcsData}
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={2000}
        arcsTransitionDuration={1000}
        arcStroke={c => c.id === selectedPairId ? 1.5 : 0.5}
        onArcClick={arc => onSelectPair(arc.id)}
        atmosphereColor="#00f0ff"
        atmosphereAltitude={0.15}
      />
    </div>
  );
}
