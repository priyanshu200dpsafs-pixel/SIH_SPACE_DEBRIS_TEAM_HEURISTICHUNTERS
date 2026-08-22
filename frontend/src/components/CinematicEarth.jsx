import React, { useRef, useEffect, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';

const GLOBE_RADIUS = 100;
const MAX_SWARM_SATS = 30000;

export default function CinematicEarth() {
  const globeEl = useRef();
  
  // Data Refs
  const allSatsRef = useRef([]);
  const swarmSatsRef = useRef([]);
  const threatSatsRef = useRef([]);
  const swarmPointsRef = useRef(null);
  const altLineMeshRef = useRef(null);
  const orbitLineMeshRef = useRef(null);

  // Hover & Interaction Refs
  const hoveredThreatRef = useRef(null);
  const hoveredSatRef = useRef(null);
  const tooltipRef = useRef(null);

  // React State
  const [threatPointsData, setThreatPointsData] = useState([]);
  const [ringsData, setRingsData] = useState([]);
  const [htmlElementsData, setHtmlElementsData] = useState([]);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [hoveredSat, setHoveredSat] = useState(null);
  
  // Search & Lock State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [lockedSatellite, setLockedSatellite] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highRiskNames, setHighRiskNames] = useState(new Set());
  const [dataReady, setDataReady] = useState(false);

  // Keep ref in sync for event listeners
  useEffect(() => {
    hoveredSatRef.current = hoveredSat;
  }, [hoveredSat]);

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
        
        allSatsRef.current = parsed;
        setDataReady(true);
      })
      .catch(e => console.error(e));
  }, []);

  // Partition data
  useEffect(() => {
    if (!dataReady || allSatsRef.current.length === 0) return;
    
    allSatsRef.current.forEach(sat => {
      sat.isHighRisk = highRiskNames.has(sat.name);
    });

    threatSatsRef.current = allSatsRef.current.filter(s => s.isHighRisk);
    swarmSatsRef.current = allSatsRef.current.filter(s => !s.isHighRisk);
    setThreatPointsData([...threatSatsRef.current]);
  }, [highRiskNames, dataReady]);

  // Search Logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = allSatsRef.current
      .filter(s => s.name.toLowerCase().includes(q) || s.norad_id.toString().includes(q))
      .slice(0, 8);
    setSearchResults(matches);
  }, [searchQuery]);

  const lockOnSatellite = (sat) => {
    setLockedSatellite(sat);
    setSearchQuery('');
    setIsDropdownOpen(false);
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = false;
      const cameraAlt = Math.max(sat.alt + 1.5, 2.5);
      globeEl.current.pointOfView({ lat: sat.lat, lng: sat.lng, altitude: cameraAlt }, 1200);
    }
  };

  const unlockSatellite = () => {
    setLockedSatellite(null);
    setHtmlElementsData([]);
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = true;
      globeEl.current.pointOfView({ altitude: 2.5 }, 1000);
    }
  };

  useEffect(() => {
    if (!lockedSatellite && altLineMeshRef.current) {
      altLineMeshRef.current.visible = false;
    }
  }, [lockedSatellite]);

  // 3. High-performance propagation loop
  useEffect(() => {
    const updatePositions = () => {
      if (!dataReady) return;
      const date = new Date();
      const gmst = satellite.gstime(date);
      
      let needsThreatUpdate = false;
      let lockedSatUpdated = null;

      threatSatsRef.current.forEach(sat => {
        try {
          const positionAndVelocity = satellite.propagate(sat.satrec, date);
          const positionEci = positionAndVelocity.position;
          if (!positionEci) return;
          
          const positionGd = satellite.eciToGeodetic(positionEci, gmst);
          if (!isNaN(positionGd.longitude) && !isNaN(positionGd.latitude) && !isNaN(positionGd.height)) {
            sat.lat = satellite.degreesLat(positionGd.latitude);
            sat.lng = satellite.degreesLong(positionGd.longitude);
            sat.alt = positionGd.height / 6371.0;
            sat.velocity = Math.sqrt(
              Math.pow(positionAndVelocity.velocity.x, 2) + 
              Math.pow(positionAndVelocity.velocity.y, 2) + 
              Math.pow(positionAndVelocity.velocity.z, 2)
            );
            sat.eci = positionEci;
            needsThreatUpdate = true;
            
            if (lockedSatellite && lockedSatellite.norad_id === sat.norad_id) {
              lockedSatUpdated = sat;
            }
          }
        } catch (e) {}
      });

      if (lockedSatellite && !lockedSatellite.isHighRisk) {
        const sat = swarmSatsRef.current.find(s => s.norad_id === lockedSatellite.norad_id);
        if (sat) {
          try {
            const positionAndVelocity = satellite.propagate(sat.satrec, date);
            if (positionAndVelocity.position) {
              const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
              sat.lat = satellite.degreesLat(positionGd.latitude);
              sat.lng = satellite.degreesLong(positionGd.longitude);
              sat.alt = positionGd.height / 6371.0;
              sat.velocity = Math.sqrt(
                Math.pow(positionAndVelocity.velocity.x, 2) + 
                Math.pow(positionAndVelocity.velocity.y, 2) + 
                Math.pow(positionAndVelocity.velocity.z, 2)
              );
              sat.eci = positionAndVelocity.position;
              lockedSatUpdated = sat;
              needsThreatUpdate = true;
            }
          } catch(e) {}
        }
      }

      if (swarmPointsRef.current && swarmSatsRef.current.length > 0) {
        const positions = swarmPointsRef.current.geometry.attributes.position.array;
        let idx = 0;
        swarmSatsRef.current.forEach(sat => {
          if (idx >= positions.length) return;
          try {
            const pos = satellite.propagate(sat.satrec, date).position;
            if (pos) {
              const gd = satellite.eciToGeodetic(pos, gmst);
              const lat = satellite.degreesLat(gd.latitude);
              const lng = satellite.degreesLong(gd.longitude);
              const alt = gd.height / 6371.0;
              
              const phi = (90 - lat) * (Math.PI / 180);
              const theta = (90 - lng) * (Math.PI / 180);
              const r = GLOBE_RADIUS * (1 + alt);
              
              positions[idx++] = r * Math.sin(phi) * Math.cos(theta);
              positions[idx++] = r * Math.cos(phi);
              positions[idx++] = r * Math.sin(phi) * Math.sin(theta);
              
              // Cache data for tooltip
              sat.lat = lat;
              sat.lng = lng;
              sat.alt = alt;
              sat.velocity = Math.sqrt(Math.pow(pos.x, 2) + Math.pow(pos.y, 2) + Math.pow(pos.z, 2)) || 0;
            } else {
              idx += 3;
            }
          } catch(e) {
            idx += 3;
          }
        });
        
        for (let i = idx; i < positions.length; i++) {
          positions[i] = 0;
        }
        swarmPointsRef.current.geometry.attributes.position.needsUpdate = true;
      }

      if (needsThreatUpdate) {
        const renderThreats = [...threatSatsRef.current];
        if (lockedSatUpdated && !lockedSatUpdated.isHighRisk && !renderThreats.find(s => s.norad_id === lockedSatUpdated.norad_id)) {
           renderThreats.push(lockedSatUpdated);
        }

        setThreatPointsData(renderThreats);
        
        const rings = renderThreats.map(s => ({
          lat: s.lat, lng: s.lng, maxR: s.isHighRisk ? 4 : 2, propagationSpeed: 2, repeatPeriod: 1200
        }));
        setRingsData(rings);

        if (lockedSatUpdated) {
          // Update Custom Altitude Line for Locked Satellite
          if (altLineMeshRef.current) {
            const phi = (90 - lockedSatUpdated.lat) * (Math.PI / 180);
            const theta = (90 - lockedSatUpdated.lng) * (Math.PI / 180);
            
            const r_ground = GLOBE_RADIUS;
            const r_sat = GLOBE_RADIUS * (1 + lockedSatUpdated.alt);
            
            const x1 = r_ground * Math.sin(phi) * Math.cos(theta);
            const y1 = r_ground * Math.cos(phi);
            const z1 = r_ground * Math.sin(phi) * Math.sin(theta);
            
            const x2 = r_sat * Math.sin(phi) * Math.cos(theta);
            const y2 = r_sat * Math.cos(phi);
            const z2 = r_sat * Math.sin(phi) * Math.sin(theta);
            
            altLineMeshRef.current.geometry.setFromPoints([
              new THREE.Vector3(x1, y1, z1),
              new THREE.Vector3(x2, y2, z2)
            ]);
            altLineMeshRef.current.computeLineDistances();
            altLineMeshRef.current.visible = true;
          }

          const distances = threatSatsRef.current
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

          setHtmlElementsData([lockedSatUpdated]);
          setLockedSatellite({ ...lockedSatUpdated, nearest: distances });
        } else {
          setHtmlElementsData([]);
        }
      }
    };

    const interval = setInterval(updatePositions, 500);
    return () => clearInterval(interval);
  }, [highRiskNames, lockedSatellite?.norad_id, dataReady]);

  // 4. Custom Orbit Trace via Three.js (Bypasses all react-globe.gl map-wrapping bugs)
  useEffect(() => {
    if (!orbitLineMeshRef.current) return;
    
    if (!lockedSatellite) {
      orbitLineMeshRef.current.visible = false;
      return;
    }
    
    const baseDate = new Date();
    const fixedGmst = satellite.gstime(baseDate); // Freeze Earth's rotation for a closed loop
    const periodMins = Math.ceil((2 * Math.PI) / lockedSatellite.satrec.no);
    const steps = 180; // High resolution
    const stepSize = periodMins / steps;
    
    const positions = orbitLineMeshRef.current.geometry.attributes.position.array;
    let idx = 0;

    for (let i = 0; i <= steps; i++) {
      const d = new Date(baseDate.getTime() + i * stepSize * 60000);
      try {
        const pv = satellite.propagate(lockedSatellite.satrec, d);
        if (pv.position) {
          // Use fixedGmst so the orbit forms a perfect closed hoop in ECEF space
          const gd = satellite.eciToGeodetic(pv.position, fixedGmst);
          const lat = satellite.degreesLat(gd.latitude);
          const lng = satellite.degreesLong(gd.longitude);
          const alt = gd.height / 6371.0;
          
          // Pure Cartesian conversion (matches react-globe.gl spherical coordinate space)
          const phi = (90 - lat) * (Math.PI / 180);
          const theta = (90 - lng) * (Math.PI / 180);
          const r = GLOBE_RADIUS * (1 + alt);
          
          positions[idx++] = r * Math.sin(phi) * Math.cos(theta); // x
          positions[idx++] = r * Math.cos(phi);                   // y
          positions[idx++] = r * Math.sin(phi) * Math.sin(theta); // z
        }
      } catch (e) {}
    }
    
    orbitLineMeshRef.current.geometry.setDrawRange(0, idx / 3);
    orbitLineMeshRef.current.geometry.attributes.position.needsUpdate = true;
    orbitLineMeshRef.current.geometry.computeBoundingSphere();
    orbitLineMeshRef.current.visible = true;

  }, [lockedSatellite?.norad_id]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track mouse coordinates efficiently for the tooltip DOM
  useEffect(() => {
    const trackMouse = (e) => {
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${e.clientX + 15}px, ${e.clientY + 15}px)`;
      }
    };
    window.addEventListener('mousemove', trackMouse);
    return () => window.removeEventListener('mousemove', trackMouse);
  }, []);

  // 5. Interaction & Custom Raycasting (Bulletproof)
  useEffect(() => {
    let downPos = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 4.0; // Large threshold to make hovering easy

    const onPointerDown = (e) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e) => {
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dist < 5 && hoveredSatRef.current) {
        lockOnSatellite(hoveredSatRef.current);
      }
    };

    const raycastSwarm = (e) => {
      if (hoveredThreatRef.current) {
        setHoveredSat(hoveredThreatRef.current);
        document.body.style.cursor = 'pointer';
        return;
      }

      if (!globeEl.current) return;
      const renderer = globeEl.current.renderer();
      const camera = globeEl.current.camera();
      if (!renderer || !camera || !swarmPointsRef.current) return;

      const canvas = renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera({ x, y }, camera);
      const intersects = raycaster.intersectObject(swarmPointsRef.current);
      
      if (intersects.length > 0) {
        const index = intersects[0].index;
        const sat = swarmSatsRef.current[index];
        if (sat) {
          setHoveredSat(sat);
          document.body.style.cursor = 'pointer';
          return;
        }
      }
      
      setHoveredSat(null);
      document.body.style.cursor = 'default';
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mousemove', raycastSwarm);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mousemove', raycastSwarm);
      document.body.style.cursor = 'default';
    };
  }, []);

  // Set up Scene & Ghost Swarm Particle System
  useEffect(() => {
    let frame;
    let pointsMesh = null;
    let ambientLight = null;

    const initThreeJS = () => {
      if (!globeEl.current || !globeEl.current.scene()) {
        frame = requestAnimationFrame(initThreeJS);
        return;
      }

      const scene = globeEl.current.scene();
      ambientLight = new THREE.AmbientLight(0x1a2a4a, 0.3);
      scene.add(ambientLight);

      // Create Altitude Line for Locked Satellite
      const altMat = new THREE.LineDashedMaterial({
        color: 0x4ade80, // Bright green for altitude tracking
        linewidth: 1,
        dashSize: 2,
        gapSize: 2,
        transparent: true,
        opacity: 0.9
      });
      const altGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const altLine = new THREE.Line(altGeo, altMat);
      altLine.visible = false;
      altLineMeshRef.current = altLine;
      scene.add(altLine);

      // Create Orbit Line (Pure Cartesian)
      const orbitMat = new THREE.LineBasicMaterial({
        color: 0x4ade80, // Bright green
        linewidth: 1,
        transparent: true,
        opacity: 0.9,
      });
      const orbitGeo = new THREE.BufferGeometry();
      // Preallocate space for 250 points max
      orbitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(250 * 3), 3));
      orbitGeo.setDrawRange(0, 0);
      const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
      orbitLine.visible = false;
      orbitLineMeshRef.current = orbitLine;
      scene.add(orbitLine);

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_SWARM_SATS * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      // CRITICAL FIX: The raycaster needs a valid bounding sphere to process intersections!
      // Since our points are dynamically moving around the Earth (radius 100), a fixed radius of 200 covers all LEO/MEO objects.
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);
      
      // Made swarm bright solid cyan and larger
      const material = new THREE.PointsMaterial({
        color: 0x00d4ff, 
        size: 2.0,
        transparent: false,
        sizeAttenuation: true,
      });
      
      pointsMesh = new THREE.Points(geometry, material);
      swarmPointsRef.current = pointsMesh;
      scene.add(pointsMesh);

      const controls = globeEl.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;
        controls.enableZoom = true;
        controls.zoomSpeed = 0.8;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
      }
      globeEl.current.pointOfView({ altitude: 2.5 });
    };

    initThreeJS();

    return () => {
      cancelAnimationFrame(frame);
      if (globeEl.current && globeEl.current.scene()) {
        const scene = globeEl.current.scene();
        if (ambientLight) scene.remove(ambientLight);
        if (pointsMesh) {
          scene.remove(pointsMesh);
          pointsMesh.geometry.dispose();
          pointsMesh.material.dispose();
        }
        if (altLineMeshRef.current) {
          scene.remove(altLineMeshRef.current);
          altLineMeshRef.current.geometry.dispose();
          altLineMeshRef.current.material.dispose();
        }
        if (orbitLineMeshRef.current) {
          scene.remove(orbitLineMeshRef.current);
          orbitLineMeshRef.current.geometry.dispose();
          orbitLineMeshRef.current.material.dispose();
        }
      }
    };
  }, []);

  const satGeometry = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);
  const threatMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff0055' }), []);
  const lockedMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#00d4ff' }), []);
  const issMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fbbf24' }), []);

  return (
    <div className="relative w-full h-full bg-[var(--color-void)] overflow-hidden">
      
      {/* TOOLTIP OVERLAY */}
      <div 
        ref={tooltipRef}
        className="fixed top-0 left-0 z-[100] pointer-events-none transition-opacity duration-150"
        style={{ opacity: hoveredSat ? 1 : 0 }}
      >
        {hoveredSat && (
          <div className="glass-panel-bright p-3 min-w-[220px]">
            <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-white/[0.1]">
              <div className={`w-1.5 h-1.5 rounded-full ${hoveredSat.isHighRisk ? 'bg-red-500 animate-pulse' : 'bg-cyan-400'}`}></div>
              <div className="text-white font-bold text-[11px] uppercase tracking-wider truncate">{hoveredSat.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono">
              <div className="text-slate-500">NORAD</div>
              <div className="text-cyan-300 text-right">{hoveredSat.norad_id}</div>
              
              <div className="text-slate-500">ALTITUDE</div>
              <div className="text-slate-300 text-right">{(hoveredSat.alt * 6371).toFixed(1)} km</div>
              
              <div className="text-slate-500">LATITUDE</div>
              <div className="text-slate-300 text-right">{hoveredSat.lat?.toFixed(2)}°</div>
              
              <div className="text-slate-500">LONGITUDE</div>
              <div className="text-slate-300 text-right">{hoveredSat.lng?.toFixed(2)}°</div>
            </div>
            {hoveredSat.isHighRisk && (
              <div className="mt-2.5 text-[9px] text-red-400 border border-red-500/30 bg-red-500/10 text-center py-0.5 uppercase tracking-widest font-bold">
                ACTIVE THREAT
              </div>
            )}
          </div>
        )}
      </div>

      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        atmosphereColor="#00d4ff"
        atmosphereAltitude={0.25}
        
        objectsData={threatPointsData}
        objectLat="lat"
        objectLng="lng"
        objectAltitude="alt"
        objectThreeObject={d => {
          const scale = Math.max(1, d.alt * 0.3);
          const isISS = d.name === 'ISS (ZARYA)';
          
          const size = isISS ? 0.06 : (d.isHighRisk ? 0.035 : 0.02) * scale;
          const mat = isISS ? issMat : (d.isHighRisk ? threatMat : lockedMat);
          
          const mesh = new THREE.Mesh(satGeometry, mat);
          mesh.scale.set(size, size, size);
          return mesh;
        }}
        onObjectHover={(obj) => {
          hoveredThreatRef.current = obj || null;
          if (obj) {
            setHoveredSat(obj);
            document.body.style.cursor = 'pointer';
          }
        }}
        
        ringsData={ringsData}
        ringLat="lat"
        ringLng="lng"
        ringColor={(d) => d.maxR > 2 ? t => `rgba(255, 0, 85, ${1 - t})` : t => `rgba(34, 211, 238, ${1 - t})`}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"

        arcsData={[]}
        
        htmlElementsData={htmlElementsData}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude="alt"
        htmlTransitionDuration={0}
        htmlElement={() => {
          const el = document.createElement('div');
          el.style.pointerEvents = 'none';
          el.innerHTML = `
            <div style="transform: translate(-50%, -50%); position: relative; width: 70px; height: 70px;">
              <svg width="70" height="70" viewBox="0 0 40 40" style="position: absolute; top: 0; left: 0; animation: reticleSpin 8s linear infinite; transform-origin: center;">
                <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(34,211,238,0.6)" stroke-width="0.8" stroke-dasharray="3 3"/>
                <circle cx="20" cy="20" r="12" fill="none" stroke="rgba(34,211,238,0.3)" stroke-width="0.5"/>
              </svg>
              <svg width="70" height="70" viewBox="0 0 40 40" style="position: absolute; top: 0; left: 0;">
                <line x1="20" y1="2" x2="20" y2="10" stroke="#22d3ee" stroke-width="1.5"/>
                <line x1="20" y1="30" x2="20" y2="38" stroke="#22d3ee" stroke-width="1.5"/>
                <line x1="2" y1="20" x2="10" y2="20" stroke="#22d3ee" stroke-width="1.5"/>
                <line x1="30" y1="20" x2="38" y2="20" stroke="#22d3ee" stroke-width="1.5"/>
                <circle cx="20" cy="20" r="2" fill="#ff0055">
                  <animate attributeName="r" values="2;3;2" dur="1.5s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>
                </circle>
              </svg>
            </div>
          `;
          return el;
        }}
      />

      {/* SEARCH BAR */}
      <div className="absolute top-6 left-6 z-[100] w-80">
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search satellite or NORAD ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            className="w-full glass-panel text-cyan-300 font-mono text-xs px-4 py-2.5 rounded-md focus:outline-none focus:border-cyan-400/60 transition-all duration-300 placeholder:text-slate-600"
            style={{ borderColor: searchQuery ? 'rgba(34,211,238,0.5)' : undefined }}
          />
          <div className="absolute right-3 top-2.5 pointer-events-none text-cyan-500/50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
        </div>

        {isDropdownOpen && searchResults.length > 0 && (
          <div className="mt-1.5 glass-panel-bright overflow-hidden animate-slideDown">
            {searchResults.map((sat, i) => (
              <div 
                key={sat.norad_id}
                onClick={() => lockOnSatellite(sat)}
                className="px-4 py-2.5 font-mono text-xs cursor-pointer hover:bg-cyan-500/10 border-b border-white/[0.03] transition-all duration-200 flex justify-between items-center"
                style={{ animation: `staggerFadeIn 0.3s ease-out ${i * 0.05}s backwards` }}
              >
                <div className="flex items-center space-x-2">
                  {sat.isHighRisk && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  <span className="text-white font-medium">{sat.name}</span>
                </div>
                <span className="text-slate-600 text-[10px] tabular-nums">ID: {sat.norad_id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TACTICAL TELEMETRY HUD */}
      {lockedSatellite && (
        <div className="absolute top-6 right-6 z-[100] w-[340px] animate-slideUp pointer-events-none">
          <div className="glass-panel-bright p-5 pointer-events-auto">
            {/* Header */}
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-white/[0.06]">
              <div>
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(255,0,85,0.8)]">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></div>
                  </div>
                  <span className="text-red-400 font-mono text-[9px] uppercase font-bold tracking-[0.2em]">TARGET LOCKED</span>
                </div>
                <h2 className="text-white font-bold tracking-wider uppercase text-lg leading-tight">{lockedSatellite.name}</h2>
                <div className="text-cyan-400/70 font-mono text-[10px] mt-1 tracking-wider">NORAD {lockedSatellite.norad_id}</div>
              </div>
              <button 
                onClick={unlockSatellite} 
                className="text-slate-600 hover:text-white transition-colors text-lg font-light px-1 hover:bg-white/5 rounded"
              >
                ✕
              </button>
            </div>
            
            {/* Telemetry Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-white/[0.04]">
              <div>
                <div className="text-slate-500 text-[9px] uppercase tracking-[0.15em] mb-1">ALTITUDE</div>
                <div className="text-cyan-100 text-lg font-bold tabular-nums">
                  {(lockedSatellite.alt * 6371).toFixed(1)} 
                  <span className="text-slate-500 text-xs font-normal ml-1">km</span>
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[9px] uppercase tracking-[0.15em] mb-1">VELOCITY</div>
                <div className="text-cyan-100 text-lg font-bold tabular-nums">
                  {lockedSatellite.velocity?.toFixed(2)} 
                  <span className="text-slate-500 text-xs font-normal ml-1">km/s</span>
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[9px] uppercase tracking-[0.15em] mb-1">LATITUDE</div>
                <div className="text-slate-300 text-sm tabular-nums">{lockedSatellite.lat?.toFixed(4)}°</div>
              </div>
              <div>
                <div className="text-slate-500 text-[9px] uppercase tracking-[0.15em] mb-1">LONGITUDE</div>
                <div className="text-slate-300 text-sm tabular-nums">{lockedSatellite.lng?.toFixed(4)}°</div>
              </div>
            </div>

            {/* Nearest Neighbors */}
            <div>
              <div className="text-slate-500 text-[9px] uppercase tracking-[0.15em] mb-2">PROXIMITY THREATS</div>
              {lockedSatellite.nearest && lockedSatellite.nearest.length > 0 ? (
                <div className="flex flex-col space-y-1.5">
                  {lockedSatellite.nearest.map((n, i) => {
                    let barColor = 'bg-cyan-500/30';
                    let textColor = 'text-cyan-400';
                    if (n.dist <= 200) { barColor = 'bg-red-500/30'; textColor = 'text-red-400 font-bold'; }
                    else if (n.dist <= 1000) { barColor = 'bg-amber-500/30'; textColor = 'text-amber-400'; }
                    
                    return (
                      <div 
                        key={i} 
                        className="flex items-center text-[11px] font-mono bg-white/[0.02] rounded overflow-hidden"
                        style={{ animation: `staggerFadeIn 0.3s ease-out ${i * 0.08}s backwards` }}
                      >
                        <div className={`w-1 self-stretch ${barColor}`} />
                        <div className="flex justify-between items-center w-full px-2.5 py-1.5">
                          <span className="text-slate-400 truncate max-w-[160px]">{n.target.name}</span>
                          <span className={textColor}>{n.dist.toFixed(1)} km</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-slate-600 text-[10px] font-mono animate-pulse">NO IMMINENT THREATS...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
