import React, { useRef, useEffect, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';

export default function CinematicEarth() {
  const globeEl = useRef();
  const satDataRef = useRef([]);
  const [pointsData, setPointsData] = useState([]);
  const [ringsData, setRingsData] = useState([]);
  const [pathsData, setPathsData] = useState([]);
  const [htmlElementsData, setHtmlElementsData] = useState([]);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  // Search & Lock State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [lockedSatellite, setLockedSatellite] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [highRiskNames, setHighRiskNames] = useState(new Set());

  // 1. Fetch Conjunctions
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/v1/conjunctions?page=1&size=50')
      .then(r => r.json())
      .then(data => {
        const names = new Set();
        (data.items || []).forEach(c => {
          if (c.object_1?.name) names.add(c.object_1.name);
          if (c.object_2?.name) names.add(c.object_2.name);
        });
        names.add("ISS (ZARYA)"); 
        setHighRiskNames(names);
      })
      .catch(e => console.error(e));
  }, []);

  // 2. Fetch TLEs
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/v1/globe-data')
      .then(r => r.json())
      .then(data => {
        const parsed = data.items.map(item => {
          try {
            const satrec = satellite.twoline2satrec(item.tle_line1, item.tle_line2);
            return { 
              name: item.name, 
              norad_id: item.norad_id || "UNKNOWN",
              epoch: item.epoch ? new Date(item.epoch).toUTCString() : "EPOCH UNKNOWN",
              satrec, 
              lat: 0, lng: 0, alt: 0, velocity: 0,
              isHighRisk: false,
              eci: null
            };
          } catch (e) {
            return null;
          }
        }).filter(Boolean);
        satDataRef.current = parsed;
      })
      .catch(e => console.error(e));
  }, []);

  // Search Logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = satDataRef.current
      .filter(s => s.name.toLowerCase().includes(q) || s.norad_id.toString().includes(q))
      .slice(0, 8);
    setSearchResults(matches);
  }, [searchQuery]);

  const lockOnSatellite = (sat) => {
    setLockedSatellite(sat);
    setSearchQuery('');
    setIsDropdownOpen(false);
    if (globeEl.current) {
      // Disable auto-rotate so parallax doesn't confuse the view
      globeEl.current.controls().autoRotate = false;
      
      // Ensure camera is always outside the satellite's orbit (especially for GEO)
      const cameraAlt = Math.max(sat.alt + 1.5, 2.5);
      globeEl.current.pointOfView({ lat: sat.lat, lng: sat.lng, altitude: cameraAlt }, 1200);
    }
  };

  // 3. High-performance propagation loop
  useEffect(() => {
    const updatePositions = () => {
      if (!satDataRef.current || satDataRef.current.length === 0) return;
      const date = new Date();
      const gmst = satellite.gstime(date);
      
      let needsUpdate = false;
      let lockedSatUpdated = null;

      satDataRef.current.forEach(sat => {
        try {
          const positionAndVelocity = satellite.propagate(sat.satrec, date);
          const positionEci = positionAndVelocity.position;
          const velocityEci = positionAndVelocity.velocity;
          if (!positionEci || !velocityEci) return;
          
          const positionGd = satellite.eciToGeodetic(positionEci, gmst);
          
          if (!isNaN(positionGd.longitude) && !isNaN(positionGd.latitude) && !isNaN(positionGd.height)) {
            sat.lat = satellite.degreesLat(positionGd.latitude);
            sat.lng = satellite.degreesLong(positionGd.longitude);
            sat.alt = positionGd.height / 6371.0;
            sat.velocity = Math.sqrt(
              Math.pow(velocityEci.x, 2) + Math.pow(velocityEci.y, 2) + Math.pow(velocityEci.z, 2)
            );
            sat.eci = positionEci; // Cache ECI for Euclidean math
            sat.isHighRisk = highRiskNames.has(sat.name);
            needsUpdate = true;
            
            if (lockedSatellite && lockedSatellite.norad_id === sat.norad_id) {
              lockedSatUpdated = sat;
            }
          }
        } catch (e) {}
      });

      if (needsUpdate) {
        setPointsData([...satDataRef.current]);
        
        // Rings
        const rings = satDataRef.current.filter(s => s.isHighRisk).map(s => ({
          lat: s.lat, lng: s.lng, maxR: 5, propagationSpeed: 2, repeatPeriod: 1000
        }));
        setRingsData(rings);

        // Advanced Vectors & Reticle for Locked Sat
        if (lockedSatUpdated) {
          // 1. Euclidean Proximity calculations (kept for HUD)
          const distances = satDataRef.current
            .filter(s => s.norad_id !== lockedSatUpdated.norad_id && s.eci && lockedSatUpdated.eci)
            .map(s => {
              const dx = s.eci.x - lockedSatUpdated.eci.x;
              const dy = s.eci.y - lockedSatUpdated.eci.y;
              const dz = s.eci.z - lockedSatUpdated.eci.z;
              const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
              return { target: s, dist };
            })
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 5);

          // Proximity vectors (arcs/spokes) have been removed based on user request.

          setHtmlElementsData([lockedSatUpdated]);
          setLockedSatellite({ ...lockedSatUpdated, nearest: distances });
        } else {
          setHtmlElementsData([]);
        }
      }
    };

    const interval = setInterval(updatePositions, 500);
    return () => clearInterval(interval);
  }, [highRiskNames, lockedSatellite?.norad_id]);

  // 4. Orbit Trace
  useEffect(() => {
    if (!lockedSatellite) {
      setPathsData([]);
      return;
    }
    const pathCoords = [];
    const baseDate = new Date();
    // Calculate orbital period in minutes (no = mean motion in rad/min)
    const periodMins = Math.ceil((2 * Math.PI) / lockedSatellite.satrec.no);
    const steps = Math.min(periodMins, 360); // Cap at 360 steps to avoid freezing
    const stepSize = periodMins / steps; // minutes per step

    for (let i = 0; i <= steps; i++) {
      const d = new Date(baseDate.getTime() + i * stepSize * 60000);
      try {
        const pv = satellite.propagate(lockedSatellite.satrec, d);
        if (pv.position) {
          const gd = satellite.eciToGeodetic(pv.position, satellite.gstime(d));
          pathCoords.push([
            satellite.degreesLat(gd.latitude),
            satellite.degreesLong(gd.longitude),
            gd.height / 6371.0
          ]);
        }
      } catch (e) {}
    }
    setPathsData([{ coords: pathCoords }]);
  }, [lockedSatellite?.norad_id]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = true;
      globeEl.current.controls().autoRotateSpeed = 0.5;
      globeEl.current.controls().enableZoom = true;
      globeEl.current.pointOfView({ altitude: 2.5 });
    }
  }, []);

  return (
    <div className="relative w-full h-full bg-[#030712] overflow-hidden">
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        atmosphereColor="#00d4ff"
        atmosphereAltitude={0.18}
        
        objectsData={pointsData}
        objectLat="lat"
        objectLng="lng"
        objectAltitude="alt"
        objectThreeObject={d => {
          // Scale size up for high altitude objects so they remain visible from far away
          const scale = Math.max(1, d.alt * 0.3);
          const size = (d.isHighRisk ? 0.035 : 0.012) * scale;
          const color = d.isHighRisk ? '#ff0055' : '#00ffff';
          return new THREE.Mesh(
            new THREE.SphereGeometry(size, 12, 12),
            new THREE.MeshBasicMaterial({ color })
          );
        }}
        onObjectClick={lockOnSatellite}
        
        ringsData={ringsData}
        ringLat="lat"
        ringLng="lng"
        ringColor={() => '#ff0055'}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"

        arcsData={[]}

        pathsData={pathsData}
        pathPoints="coords"
        pathPointLat={p => p[0]}
        pathPointLng={p => p[1]}
        pathPointAlt={p => p[2]}
        pathColor={() => 'rgba(0, 212, 255, 0.4)'}
        pathResolution={4}

        htmlElementsData={htmlElementsData}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude="alt"
        htmlTransitionDuration={0}
        htmlElement={() => {
          const el = document.createElement('div');
          el.style.pointerEvents = 'none';
          el.innerHTML = `
            <div style="transform: translate(-50%, -50%);">
              <svg width="60" height="60" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="15" fill="none" stroke="#00ffff" stroke-width="1.5" stroke-dasharray="4 2"/>
                <line x1="20" y1="0" x2="20" y2="8" stroke="#00ffff" stroke-width="2"/>
                <line x1="20" y1="32" x2="20" y2="40" stroke="#00ffff" stroke-width="2"/>
                <line x1="0" y1="20" x2="8" y2="20" stroke="#00ffff" stroke-width="2"/>
                <line x1="32" y1="20" x2="40" y2="20" stroke="#00ffff" stroke-width="2"/>
                <circle cx="20" cy="20" r="2" fill="#ff0055"/>
              </svg>
            </div>
          `;
          return el;
        }}
      />

      {/* SEARCH BAR OVERLAY */}
      <div className="absolute top-6 left-6 z-50 w-80">
        <div className="relative">
          <input 
            type="text" 
            placeholder="SEARCH SAT OR NORAD ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            className="w-full bg-slate-950/80 backdrop-blur-md border border-cyan-500/50 text-cyan-300 font-mono text-sm px-4 py-3 rounded focus:outline-none focus:border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
          />
          <div className="absolute right-3 top-3 pointer-events-none text-cyan-500">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
        </div>

        {isDropdownOpen && searchResults.length > 0 && (
          <div className="mt-2 bg-slate-950/90 backdrop-blur-md border border-cyan-500/30 rounded overflow-hidden shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            {searchResults.map(sat => (
              <div 
                key={sat.norad_id}
                onClick={() => lockOnSatellite(sat)}
                className="px-4 py-3 font-mono text-sm cursor-pointer hover:bg-cyan-900/40 border-b border-slate-800 transition-colors"
              >
                <div className="text-white font-bold flex justify-between">
                  <span>{sat.name}</span>
                  <span className="text-slate-500 text-[10px]">ID: {sat.norad_id}</span>
                </div>
                <div className="text-slate-400 text-[10px] mt-1 truncate">TLE EPOCH: {sat.epoch}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TACTICAL TELEMETRY HUD */}
      {lockedSatellite && (
        <div className="absolute top-6 right-6 pointer-events-none z-50">
          <div className="bg-slate-950/85 backdrop-blur-md border border-cyan-500/50 p-6 rounded shadow-[0_0_25px_rgba(34,211,238,0.2)] min-w-[320px]">
            <div className="flex justify-between items-start mb-4 border-b border-cyan-500/30 pb-2">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-red-500 font-mono text-[10px] uppercase font-bold tracking-widest">TARGET LOCKED</span>
                </div>
                <h2 className="text-white font-bold tracking-wider uppercase font-mono text-xl">{lockedSatellite.name}</h2>
                <div className="text-cyan-400 font-mono text-xs mt-1">NORAD ID: {lockedSatellite.norad_id}</div>
                <div className="text-slate-400 font-mono text-[10px] mt-1 tracking-widest">DATA EPOCH: {lockedSatellite.epoch}</div>
              </div>
              <button 
                onClick={() => setLockedSatellite(null)} 
                className="pointer-events-auto text-slate-500 hover:text-white transition-colors text-xl font-bold px-2"
              >
                &times;
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 font-mono mb-4 border-b border-slate-800 pb-4">
              <div>
                <div className="text-slate-400 text-[10px] uppercase tracking-widest">ALTITUDE</div>
                <div className="text-cyan-100 text-lg font-bold">{(lockedSatellite.alt * 6371).toFixed(1)} <span className="text-slate-500 text-sm">km</span></div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px] uppercase tracking-widest">VELOCITY</div>
                <div className="text-cyan-100 text-lg font-bold">{lockedSatellite.velocity?.toFixed(2)} <span className="text-slate-500 text-sm">km/s</span></div>
              </div>
            </div>

            <div>
              <div className="text-slate-400 text-[10px] uppercase tracking-widest mb-2">NEAREST NEIGHBORS (EUCLIDEAN DIST)</div>
              {lockedSatellite.nearest && lockedSatellite.nearest.length > 0 ? (
                <div className="flex flex-col space-y-2">
                  {lockedSatellite.nearest.map((n, i) => {
                    let dColor = "text-cyan-400";
                    if (n.dist <= 200) dColor = "text-red-500 font-bold animate-pulse";
                    else if (n.dist <= 1000) dColor = "text-amber-400";
                    
                    return (
                      <div key={i} className="flex justify-between items-center text-xs font-mono bg-slate-900/50 p-2 rounded border border-white/5">
                        <span className="text-slate-300 truncate w-32">{n.target.name}</span>
                        <span className={`${dColor}`}>{n.dist.toFixed(1)} km</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-slate-500 text-xs font-mono">CALCULATING...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
