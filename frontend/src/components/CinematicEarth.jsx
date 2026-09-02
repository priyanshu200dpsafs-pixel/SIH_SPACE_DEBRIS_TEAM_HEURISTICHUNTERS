import React, { useRef, useEffect, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { Satellite, Globe as GlobeIcon, RotateCw, SlidersHorizontal, Play, Pause, Compass, Orbit, Search, X } from 'lucide-react';
import SatellitePanel from './panels/SatellitePanel';

const GLOBE_RADIUS = 100;
const MAX_SWARM_SATS = 30000;

export default function CinematicEarth({ selectedConjunction }) {
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
  
  // Toolbar & Panel State
  const [earthTheme, setEarthTheme] = useState('blue-marble'); // 'blue-marble' | 'night'
  const [showSwarm, setShowSwarm] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false); // Default to manual free rotation so it doesn't fight the user
  const [activePanelTab, setActivePanelTab] = useState('info');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [filters, setFilters] = useState({
    selectedOrbits: [],
    selectedTags: [],
    debrisFilter: 'Show'
  });
  
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
    fetch('/api/v1/conjunctions?page=1&size=50')
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
    fetch('/api/v1/globe-data')
      .then(r => r.json())
      .then(data => {
        const parsed = data.items.map(item => {
          try {
            const satrec = satellite.twoline2satrec(item.tle_line1, item.tle_line2);
            return { 
              name: item.name, 
              norad_id: item.norad_id || "UNKNOWN",
              intl_designator: item.intl_designator || "UNKNOWN",
              epoch: item.epoch ? new Date(item.epoch).toUTCString() : "EPOCH UNKNOWN",
              tle_line1: item.tle_line1,
              tle_line2: item.tle_line2,
              inclination: item.inclination,
              raan: item.raan,
              eccentricity: item.eccentricity,
              arg_perigee: item.arg_perigee,
              mean_anomaly: item.mean_anomaly,
              mean_motion: item.mean_motion,
              country: item.country,
              launch_site: item.launch_site,
              launch_date: item.launch_date,
              orbit_type: item.orbit_type || 'LEO',
              satellite_type: item.satellite_type || 'Payload',
              status: item.status || 'Operational',
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

  // Handle external selection from Threat Matrix or Threat Feed
  useEffect(() => {
    if (!selectedConjunction) return;

    const id1 = selectedConjunction.norad_id_1?.toString();
    const id2 = selectedConjunction.norad_id_2?.toString();
    const name1 = selectedConjunction.object_1?.name;
    const name2 = selectedConjunction.object_2?.name;

    // Search in allSatsRef.current
    let targetSat = allSatsRef.current.find(s => 
      (id1 && s.norad_id?.toString() === id1) ||
      (id2 && s.norad_id?.toString() === id2) ||
      (name1 && s.name?.toUpperCase() === name1?.toUpperCase()) ||
      (name2 && s.name?.toUpperCase() === name2?.toUpperCase())
    );

    // If not found in allSatsRef, construct it from conjunction TLE data if available
    if (!targetSat && selectedConjunction.object_1?.tle_line1 && selectedConjunction.object_1?.tle_line2) {
      try {
        const satrec = satellite.twoline2satrec(selectedConjunction.object_1.tle_line1, selectedConjunction.object_1.tle_line2);
        targetSat = {
          name: name1 || `NORAD-${id1}`,
          norad_id: id1 || 'UNKNOWN',
          satrec,
          lat: 0, lng: 0, alt: 0.1,
          isHighRisk: true
        };
      } catch (e) {}
    }

    if (targetSat) {
      const now = new Date();
      const gmst = satellite.gstime(now);
      try {
        const pv = satellite.propagate(targetSat.satrec, now);
        if (pv.position) {
          const gd = satellite.eciToGeodetic(pv.position, gmst);
          targetSat.lat = satellite.degreesLat(gd.latitude);
          targetSat.lng = satellite.degreesLong(gd.longitude);
          targetSat.alt = Math.max(0.04, gd.height / 6371.0);
          targetSat.eci = pv.position;
        }
      } catch (e) {}

      lockOnSatellite(targetSat);
    }
  }, [selectedConjunction?.id, selectedConjunction?.norad_id_1, selectedConjunction?.norad_id_2, dataReady]);

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
    if (!sat) return;
    setLockedSatellite(sat);
    setIsPanelOpen(true);
    if (activePanelTab === 'filters') {
      setActivePanelTab('info');
    }
    setSearchQuery('');
    setIsDropdownOpen(false);
    
    // Instantly set the HTML reticle data on this satellite
    setHtmlElementsData([sat]);

    if (globeEl.current) {
      globeEl.current.controls().autoRotate = false;
      // Close-up cinematic zoom on the satellite
      const cameraAlt = Math.max(sat.alt + 0.8, 1.6);
      globeEl.current.pointOfView({ lat: sat.lat, lng: sat.lng, altitude: cameraAlt }, 1400);
    }
  };

  const unlockSatellite = () => {
    setLockedSatellite(null);
    setIsPanelOpen(false);
    setHtmlElementsData([]);
    if (globeEl.current) {
      if (autoRotate) {
        globeEl.current.controls().autoRotate = true;
      }
      globeEl.current.pointOfView({ altitude: 2.2 }, 1000);
    }
  };

  useEffect(() => {
    if (!lockedSatellite && altLineMeshRef.current) {
      altLineMeshRef.current.visible = false;
    }
  }, [lockedSatellite]);

  // Sync auto-rotation state with orientation-preserving animation
  useEffect(() => {
    if (!autoRotate) return;
    let animId;
    const rotateStep = () => {
      const camera = globeEl.current?.camera();
      if (camera) {
        const up = camera.up.clone().normalize();
        const q = new THREE.Quaternion().setFromAxisAngle(up, 0.0035);
        camera.position.applyQuaternion(q);
        camera.lookAt(0, 0, 0);
      }
      animId = requestAnimationFrame(rotateStep);
    };
    animId = requestAnimationFrame(rotateStep);
    return () => cancelAnimationFrame(animId);
  }, [autoRotate]);

  // Toolbar Actions
  const toggleTheme = () => setEarthTheme(prev => prev === 'blue-marble' ? 'night' : 'blue-marble');
  const toggleSwarm = () => setShowSwarm(prev => !prev);
  const toggleAutoRotate = () => setAutoRotate(prev => !prev);
  const resetCamera = () => {
    unlockSatellite();
    if (globeEl.current) {
      const camera = globeEl.current.camera();
      if (camera) {
        camera.up.set(0, 1, 0);
      }
      globeEl.current.pointOfView({ lat: 0, lng: 0, altitude: 2.2 }, 1000);
    }
  };

  // 3. High-performance propagation loop
  useEffect(() => {
    const updatePositions = () => {
      if (!dataReady) return;
      const date = new Date();
      const gmst = satellite.gstime(date);
      
      let needsThreatUpdate = false;
      let lockedSatUpdated = null;

      // Apply swarm visibility
      if (swarmPointsRef.current) {
        swarmPointsRef.current.visible = showSwarm;
      }

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

      // Filter evaluation function
      const matchesFilter = (sat) => {
        if (!sat) return false;
        
        // 1. Orbit Filter
        if (filters.selectedOrbits && filters.selectedOrbits.length > 0) {
          if (!filters.selectedOrbits.includes(sat.orbit_type)) {
            return false;
          }
        }

        // 2. Tag Filter
        if (filters.selectedTags && filters.selectedTags.length > 0) {
          const nameUp = (sat.name || '').toUpperCase();
          const matchesAnyTag = filters.selectedTags.some(tag => {
            const tagUp = tag.toUpperCase().replace(/\s+/g, '');
            const cleanName = nameUp.replace(/\s+/g, '');
            if (tag === 'Starlink' && nameUp.includes('STARLINK')) return true;
            if (tag === 'One Web' && (nameUp.includes('ONEWEB') || nameUp.includes('ONE WEB'))) return true;
            if (tag === 'Space Station' && (nameUp.includes('ISS') || nameUp.includes('TIANGONG') || nameUp.includes('ZARYA') || nameUp.includes('CSS'))) return true;
            if (tag === 'NAVSTAR' && (nameUp.includes('NAVSTAR') || nameUp.includes('GPS'))) return true;
            if (tag === 'Weather' && (nameUp.includes('METEOR') || nameUp.includes('NOAA') || nameUp.includes('GOES') || nameUp.includes('HIMAWARI') || nameUp.includes('FENGYUN'))) return true;
            if (tag === 'Military' && (nameUp.includes('USA ') || nameUp.includes('NROL') || nameUp.includes('COSMOS') || nameUp.includes('YAOGAN'))) return true;
            return cleanName.includes(tagUp);
          });
          if (!matchesAnyTag) return false;
        }

        // 3. Debris Filter
        const isDebris = sat.satellite_type === 'Debris' || sat.name?.toUpperCase().includes('DEB') || sat.name?.toUpperCase().includes('R/B');
        if (filters.debrisFilter === 'Hide' && isDebris) return false;
        if (filters.debrisFilter === 'Debris only' && !isDebris) return false;

        return true;
      };

      if (swarmPointsRef.current && swarmSatsRef.current.length > 0) {
        const now = Date.now();
        // PERFORMANCE FIX: Throttle 16,000+ background swarm propagations to once every 3.5 seconds
        // LEO satellites take 90+ minutes to orbit; 3.5s updates save 90% CPU and eliminate UI freezing
        if (!swarmPointsRef.current.lastSwarmUpdate || now - swarmPointsRef.current.lastSwarmUpdate > 3500) {
          swarmPointsRef.current.lastSwarmUpdate = now;
          
          const positions = swarmPointsRef.current.geometry.attributes.position.array;
          let idx = 0;
          swarmSatsRef.current.forEach(sat => {
            if (idx >= positions.length) return;

            // Check if satellite matches current filters
            if (!matchesFilter(sat)) {
              positions[idx++] = 0;
              positions[idx++] = 0;
              positions[idx++] = 0;
              return;
            }

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
                positions[idx++] = 0;
                positions[idx++] = 0;
                positions[idx++] = 0;
              }
            } catch(e) {
              positions[idx++] = 0;
              positions[idx++] = 0;
              positions[idx++] = 0;
            }
          });
          
          for (let i = idx; i < positions.length; i++) {
            positions[i] = 0;
          }
          swarmPointsRef.current.geometry.attributes.position.needsUpdate = true;
        }
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
          // Update Custom Altitude Stalk (Solid 3D Laser Cylinder)
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
            
            const vGround = new THREE.Vector3(x1, y1, z1);
            const vSat = new THREE.Vector3(x2, y2, z2);
            const stalkLength = vGround.distanceTo(vSat);
            
            if (stalkLength > 0.1) {
              altLineMeshRef.current.geometry.dispose();
              altLineMeshRef.current.geometry = new THREE.CylinderGeometry(0.35, 0.35, stalkLength, 8);
              
              const midpoint = new THREE.Vector3().addVectors(vGround, vSat).multiplyScalar(0.5);
              altLineMeshRef.current.position.copy(midpoint);
              
              const dir = new THREE.Vector3().subVectors(vSat, vGround).normalize();
              altLineMeshRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
              altLineMeshRef.current.visible = true;
            }
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
  }, [highRiskNames, lockedSatellite?.norad_id, dataReady, showSwarm, filters]);

  // 4. Custom Orbit Trace via 3D Solid Tube Mesh
  useEffect(() => {
    if (!orbitLineMeshRef.current) return;
    
    if (!lockedSatellite) {
      orbitLineMeshRef.current.visible = false;
      return;
    }
    
    const baseDate = new Date();
    const fixedGmst = satellite.gstime(baseDate); // Freeze Earth's rotation for a closed loop
    const periodMins = Math.ceil((2 * Math.PI) / (lockedSatellite.satrec?.no || 0.06));
    const steps = 180; // High resolution
    const stepSize = periodMins / steps;
    
    const points = [];
    for (let i = 0; i < steps; i++) {
      const d = new Date(baseDate.getTime() + i * stepSize * 60000);
      try {
        const pv = satellite.propagate(lockedSatellite.satrec, d);
        if (pv.position) {
          const gd = satellite.eciToGeodetic(pv.position, fixedGmst);
          const lat = satellite.degreesLat(gd.latitude);
          const lng = satellite.degreesLong(gd.longitude);
          const alt = gd.height / 6371.0;
          
          const phi = (90 - lat) * (Math.PI / 180);
          const theta = (90 - lng) * (Math.PI / 180);
          const r = GLOBE_RADIUS * (1 + alt);
          
          points.push(new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
          ));
        }
      } catch (e) {}
    }
    
    if (points.length > 10) {
      try {
        const curve = new THREE.CatmullRomCurve3(points, true);
        orbitLineMeshRef.current.geometry.dispose();
        orbitLineMeshRef.current.geometry = new THREE.TubeGeometry(curve, 180, 0.35, 8, true);
        orbitLineMeshRef.current.visible = true;
      } catch (e) {
        console.warn("Orbit tube generation fallback", e);
      }
    }

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

  // 5. Free 360° Trackball Drag on ANY 3D Axis with Hand Cursor (Grab / Grabbing)
  useEffect(() => {
    let isDragging = false;
    let downPos = { x: 0, y: 0 };
    let lastPos = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 4.0;

    const onPointerDown = (e) => {
      // Don't intercept clicks on UI buttons, inputs, panels or navigation
      if (e.target.closest('button, input, .glass-panel, .glass-panel-bright, [role="button"], a, select, nav')) {
        return;
      }
      isDragging = true;
      downPos = { x: e.clientX, y: e.clientY };
      lastPos = { x: e.clientX, y: e.clientY };
      document.body.style.cursor = 'grabbing';
      if (autoRotate) {
        setAutoRotate(false);
      }
    };

    const onPointerMove = (e) => {
      if (isDragging) {
        document.body.style.cursor = 'grabbing';
        const dx = e.clientX - lastPos.x;
        const dy = e.clientY - lastPos.y;
        lastPos = { x: e.clientX, y: e.clientY };

        const camera = globeEl.current?.camera();
        if (camera && (dx !== 0 || dy !== 0)) {
          // Camera local right and up vectors in world coordinate space
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
          const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();

          const sensitivity = 0.005;

          // Compute 3D rotation axis perpendicular to drag vector
          const rotAxis = new THREE.Vector3()
            .addScaledVector(right, -dy)
            .addScaledVector(up, -dx)
            .normalize();

          const angle = Math.hypot(dx, dy) * sensitivity;

          if (angle > 0.0001 && rotAxis.lengthSq() > 0.5) {
            // Apply 3D Quaternion rotation to camera position AND camera up vector (Zero Gimbal Lock)
            const q = new THREE.Quaternion().setFromAxisAngle(rotAxis, angle);
            camera.position.applyQuaternion(q);
            camera.up.applyQuaternion(q);
            camera.lookAt(0, 0, 0);
          }
        }
        return;
      }

      // Satellite Hover Raycasting
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
      document.body.style.cursor = 'grab';
    };

    const onPointerUp = (e) => {
      if (isDragging) {
        isDragging = false;
        const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        if (dist < 5 && hoveredSatRef.current) {
          lockOnSatellite(hoveredSatRef.current);
        }
        document.body.style.cursor = hoveredSatRef.current ? 'pointer' : 'grab';
      }
    };

    const onWheel = (e) => {
      // Don't zoom when scrolling within sidebars/feed
      if (e.target.closest('.overflow-y-auto, .overflow-auto, input, select')) {
        return;
      }
      const camera = globeEl.current?.camera();
      if (!camera) return;
      const zoomFactor = e.deltaY < 0 ? 0.92 : 1.08;
      const currentDist = camera.position.length();
      const newDist = THREE.MathUtils.clamp(currentDist * zoomFactor, 105, 1200);
      camera.position.setLength(newDist);
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    
    document.body.style.cursor = 'grab';

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('wheel', onWheel);
      document.body.style.cursor = 'default';
    };
  }, [autoRotate]);

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

      // Create Altitude Stalk for Locked Satellite (Solid 3D Glowing Laser Cylinder)
      const altMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff, // Vibrant glowing cyan
        transparent: true,
        opacity: 0.95
      });
      const altGeo = new THREE.CylinderGeometry(0.35, 0.35, 1, 8);
      const altMesh = new THREE.Mesh(altGeo, altMat);
      altMesh.visible = false;
      altLineMeshRef.current = altMesh;
      scene.add(altMesh);

      // Create Orbit Trajectory (Solid 3D Glowing Neon Cyan Tube)
      const orbitMat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee, // Bright Neon Cyan
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide
      });
      const orbitMesh = new THREE.Mesh(new THREE.BufferGeometry(), orbitMat);
      orbitMesh.visible = false;
      orbitLineMeshRef.current = orbitMesh;
      scene.add(orbitMesh);

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_SWARM_SATS * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      // Generate circular texture programmatically
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext('2d');
      context.beginPath();
      context.arc(8, 8, 8, 0, 2 * Math.PI);
      context.fillStyle = '#ffffff';
      context.fill();
      const circleTexture = new THREE.CanvasTexture(canvas);

      const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 3.5,
        map: circleTexture,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: false,
        alphaTest: 0.5
      });
      
      // CRITICAL FIX: The raycaster needs a valid bounding sphere to process intersections!
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);
      
      pointsMesh = new THREE.Points(geometry, material);
      pointsMesh.frustumCulled = false;
      swarmPointsRef.current = pointsMesh;
      scene.add(pointsMesh);

      const controls = globeEl.current.controls();
      if (controls) {
        controls.enabled = false; // Disable rigid OrbitControls so our Free 360 Trackball handles 6-DOF rotation
      }
      globeEl.current.pointOfView({ altitude: 2.2 });
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
          <div className="glass-panel-bright p-4 min-w-[280px] rounded-xl shadow-2xl border border-cyan-400/40 bg-slate-950/90 backdrop-blur-2xl">
            <div className="flex items-center space-x-2.5 mb-2.5 pb-2.5 border-b border-white/15">
              <div className={`w-2.5 h-2.5 rounded-full ${hoveredSat.isHighRisk ? 'bg-red-500 animate-pulse shadow-[0_0_8px_#ff0055]' : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'}`}></div>
              <div className="text-white font-bold text-sm tracking-wide truncate max-w-[220px]">{hoveredSat.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs font-mono">
              <div className="text-slate-400 font-semibold uppercase text-[11px]">NORAD ID</div>
              <div className="text-cyan-300 font-bold text-right text-xs">{hoveredSat.norad_id}</div>
              
              <div className="text-slate-400 font-semibold uppercase text-[11px]">ALTITUDE</div>
              <div className="text-slate-100 font-bold text-right text-xs">{(hoveredSat.alt * 6371).toFixed(1)} km</div>
              
              <div className="text-slate-400 font-semibold uppercase text-[11px]">LATITUDE</div>
              <div className="text-slate-100 font-bold text-right text-xs">{hoveredSat.lat?.toFixed(2)}°</div>
              
              <div className="text-slate-400 font-semibold uppercase text-[11px]">LONGITUDE</div>
              <div className="text-slate-100 font-bold text-right text-xs">{hoveredSat.lng?.toFixed(2)}°</div>
            </div>
            {hoveredSat.isHighRisk && (
              <div className="mt-3 text-xs text-red-300 border border-red-500/50 bg-red-500/20 text-center py-1 rounded-md uppercase tracking-widest font-bold">
                ⚠️ ACTIVE THREAT PAIR
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center Floating HUD Toolbar + Integrated Search */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center bg-[#070b14]/90 border border-cyan-500/30 rounded-2xl shadow-2xl backdrop-blur-2xl p-1.5 gap-2 max-w-[90vw]">
        {/* Integrated Satellite Search */}
        <div className="relative w-56 sm:w-72">
          <input 
            type="text" 
            placeholder="Search 16,000+ satellites..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            className="w-full bg-slate-900/90 text-cyan-200 font-mono text-xs px-3 py-1.5 pl-8 rounded-xl border border-white/10 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all placeholder:text-slate-500"
          />
          <div className="absolute left-2.5 top-2 pointer-events-none text-slate-400">
            <Search size={13} />
          </div>
          {searchQuery && (
            <button 
              onClick={() => { setSearchQuery(''); setIsDropdownOpen(false); }}
              className="absolute right-2 top-1.5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={13} />
            </button>
          )}

          {isDropdownOpen && searchResults.length > 0 && (
            <div className="absolute left-0 top-full mt-2 w-72 sm:w-80 glass-panel-bright overflow-hidden rounded-xl shadow-2xl border border-cyan-500/30 bg-slate-950/95 max-h-72 overflow-y-auto z-50">
              {searchResults.map((sat, i) => (
                <div 
                  key={sat.norad_id}
                  onClick={() => lockOnSatellite(sat)}
                  className="px-3 py-2 font-mono text-xs cursor-pointer hover:bg-cyan-500/20 border-b border-white/[0.06] transition-colors flex justify-between items-center"
                >
                  <div className="flex items-center space-x-2 truncate">
                    {sat.isHighRisk && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
                    <span className="text-white font-medium truncate">{sat.name}</span>
                  </div>
                  <span className="text-cyan-400 text-[10px] font-bold shrink-0 ml-2">#{sat.norad_id}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-white/15"></div>

        <button 
          onClick={toggleAutoRotate}
          className={`p-2 rounded-xl transition-all cursor-pointer ${autoRotate ? 'text-cyan-300 bg-cyan-950/70 border border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
          title={autoRotate ? "Pause Auto-Rotation" : "Start Auto-Rotation"}
        >
          {autoRotate ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <button 
          onClick={toggleSwarm}
          className={`p-2 rounded-xl transition-all cursor-pointer ${showSwarm ? 'text-cyan-300 bg-cyan-950/70 border border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
          title="Toggle Satellite Swarm (16,000+ objects)"
        >
          <Satellite size={16} />
        </button>

        <button 
          onClick={toggleTheme}
          className={`p-2 rounded-xl transition-all cursor-pointer ${earthTheme === 'night' ? 'text-cyan-300 bg-cyan-950/70 border border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
          title="Toggle Earth Day/Night Theme"
        >
          <GlobeIcon size={16} />
        </button>

        <button 
          onClick={() => {
            setActivePanelTab('filters');
            setIsPanelOpen(prev => !prev || activePanelTab !== 'filters');
          }}
          className={`p-2 rounded-xl transition-all cursor-pointer ${isPanelOpen && activePanelTab === 'filters' ? 'text-cyan-300 bg-cyan-950/70 border border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
          title="Global Filters"
        >
          <SlidersHorizontal size={16} />
        </button>
        
        <div className="w-px h-5 bg-white/15"></div>
        
        <button 
          onClick={resetCamera}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Reset View & Unlock"
        >
          <RotateCw size={16} />
        </button>
      </div>

      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl={`//unpkg.com/three-globe/example/img/earth-${earthTheme}.jpg`}
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

        htmlElement={(d) => {
          const el = document.createElement('div');
          el.style.pointerEvents = 'none';
          const altKm = d.alt ? (d.alt * 6371).toFixed(0) : 'LEO';
          el.innerHTML = `
            <div style="transform: translate(-50%, -50%); position: relative; width: 100px; height: 100px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <!-- Target Name & Altitude Badge Above Satellite -->
              <div style="position: absolute; bottom: 80px; background: rgba(7, 11, 20, 0.95); border: 1.5px solid #22d3ee; color: #22d3ee; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 6px; white-space: nowrap; box-shadow: 0 0 16px rgba(34, 211, 238, 0.6); text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 4px;">
                <span style="color: #ff0055;">⌖</span> ${d.name || 'LOCKED TARGET'} <span style="color: #94a3b8; font-size: 9px;">(${altKm} km)</span>
              </div>
              
              <!-- Spinning Neon Outer Reticle -->
              <svg width="84" height="84" viewBox="0 0 40 40" style="position: absolute; animation: reticleSpin 6s linear infinite; transform-origin: center; filter: drop-shadow(0 0 10px #22d3ee);">
                <circle cx="20" cy="20" r="17" fill="none" stroke="#22d3ee" stroke-width="1.2" stroke-dasharray="4 3"/>
                <circle cx="20" cy="20" r="11" fill="none" stroke="rgba(34,211,238,0.5)" stroke-width="0.8"/>
              </svg>
              
              <!-- Fixed Target Crosshairs & Red Tracking Core -->
              <svg width="84" height="84" viewBox="0 0 40 40" style="position: absolute;">
                <line x1="20" y1="1" x2="20" y2="8" stroke="#22d3ee" stroke-width="2"/>
                <line x1="20" y1="32" x2="20" y2="39" stroke="#22d3ee" stroke-width="2"/>
                <line x1="1" y1="20" x2="8" y2="20" stroke="#22d3ee" stroke-width="2"/>
                <line x1="32" y1="20" x2="39" y2="20" stroke="#22d3ee" stroke-width="2"/>
                <circle cx="20" cy="20" r="3.5" fill="#ff0055">
                  <animate attributeName="r" values="3;4.5;3" dur="1.2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="1;0.6;1" dur="1.2s" repeatCount="indefinite"/>
                </circle>
              </svg>
            </div>
          `;
          return el;
        }}
      />

      {/* SATELLITE ANALYTICS & FILTERS PANEL */}
      {isPanelOpen && (
        <SatellitePanel
          sat={lockedSatellite}
          filters={filters}
          setFilters={setFilters}
          activeTab={activePanelTab}
          setActiveTab={setActivePanelTab}
          onClose={() => {
            setIsPanelOpen(false);
            if (lockedSatellite && activePanelTab !== 'filters') {
              unlockSatellite();
            }
          }}
        />
      )}
    </div>
  );
}
