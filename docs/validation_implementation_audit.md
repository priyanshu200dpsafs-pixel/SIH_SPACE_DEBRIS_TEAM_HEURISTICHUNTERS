# ARES Validation Implementation Audit
**Phase 0 - Repository Audit**

This document tracks the actual state of the physics modules within the ARES codebase prior to beginning the Scientific Validation Test Campaign.

## 1. Core Propagation & Pre-Filtering
- **TLE Ingestion**: Handled in `backend/app/core/fetch_data.py`. Uses Celery tasks to fetch from Space-Track/Celestrak, parses to objects. Status: **IMPLEMENTED**
- **SGP4 Propagation**: Handled via standard `sgp4` library (Python) in `spatial_index.py` (for rough screening) and `satellite.js` in frontend. Status: **IMPLEMENTED**
- **Spatial Screening**: Handled in `backend/app/core/spatial_index.py`. Uses an Octree and chunked distance calculations (k-d tree or vectorized distances). Status: **IMPLEMENTED**

## 2. High-Fidelity Physics
- **TCA Refinement**: Handled in `backend/app/core/stage3_refine.py`. Uses Scipy `solve_ivp` (DOP853) to integrate trajectories and find minimum distance. Status: **IMPLEMENTED**
- **Force Model**: Handled in `backend/app/core/stage3_refine.py`. Incorporates 2-body, J2-J6 zonal harmonics, Lunar/Solar point-mass perturbations, and NRLMSISE-00 atmospheric drag. Status: **IMPLEMENTED**

## 3. Probability & Risk Modeling
- **Covariance Model**: Handled in `backend/app/core/risk.py`. Implements an Empirical RTN Covariance matrix using TLE age, altitude, and B* drag parameters (Osweiler/Peterson/Chan formulation). Note: This is an empirical approximation since exact sensor covariance is not provided in public TLEs. Status: **IMPLEMENTED (Empirical)**
- **Hard-Body Radius (HBR) Model**: Handled in `backend/app/core/risk.py`. Uses a hybrid sizing model driven by RCS class (Small, Medium, Large) and Object Type (Payload, Debris, Rocket Body). Status: **IMPLEMENTED**
- **Foster 2D Pc Integration**: Handled in `backend/app/core/risk.py` (`compute_foster_2d_pc`). Projects covariance onto the B-plane and performs 2D numerical integration over the combined HBR. Status: **IMPLEMENTED**
- **Chan Analytical Pc**: Handled in `backend/app/core/risk.py` (`calculate_pc_chan_log10`). Used as a fast analytical cross-check to Foster. Status: **IMPLEMENTED**

## 4. Context & Intelligence
- **Context Filtering**: Handled in `backend/app/core/stage3_refine.py`. Identifies co-located structures (e.g. ISS, Tiangong) and formation-flying missions (e.g. TerraSAR-X, SuperView) to filter out intentional close approaches. Status: **IMPLEMENTED**
- **Threat Ranking**: Handled in `backend/app/core/threat_ranking.py`. Computes a composite `threat_score` weighting Pc, Urgency, Miss Distance, and Kinetic Energy. Status: **IMPLEMENTED**
- **CAM (Collision Avoidance Maneuver) Calculations**: Handled in `backend/app/core/cam_solver.py`. Solves for delta-v vectors to reduce Pc below threshold. Status: **IMPLEMENTED**
