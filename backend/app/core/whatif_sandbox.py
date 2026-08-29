import math
import numpy as np
from datetime import datetime, timedelta, timezone
from scipy.integrate import solve_ivp
from sgp4.api import Satrec, WGS84, jday
from concurrent.futures import ProcessPoolExecutor, as_completed

from app.core.stage3_refine import combined_ode
from app.core.spatial_index import load_satellites, propagate_all
from app.core.risk import compute_formal_risk_estimate, get_hard_body_radius

# ── Coordinate Transformations ────────────────────────────────────────────────

def get_rtn_matrix(r_vec, v_vec):
    """
    Computes the transformation matrix from RTN (Radial, Transverse, Normal) to ECI.
    R: Radial (along position vector)
    N: Normal (cross product of R and V, points perpendicular to orbital plane)
    T: Transverse (cross product of N and R, points generally along velocity)
    """
    r_norm = np.linalg.norm(r_vec)
    R_unit = r_vec / r_norm
    
    h_vec = np.cross(r_vec, v_vec)
    N_unit = h_vec / np.linalg.norm(h_vec)
    
    T_unit = np.cross(N_unit, R_unit)
    
    # Transformation matrix from RTN to ECI
    # V_eci = M * V_rtn
    M = np.column_stack((R_unit, T_unit, N_unit))
    return M

# ── Simulation Engine ────────────────────────────────────────────────────────

def simulate_maneuver(
    target_id: int, 
    secondary_id: int, 
    tca_original: datetime,
    dv_rtn_m_s: tuple, 
    hours_before_tca: float,
    tle_lookup: dict
):
    """
    Simulate a maneuver and evaluate the new miss distance and secondary risks.
    dv_rtn_m_s: (dv_radial, dv_transverse, dv_normal) in meters/second
    """
    if target_id not in tle_lookup or secondary_id not in tle_lookup:
        raise ValueError("TLEs for requested objects not found in active catalog.")
        
    rec1 = tle_lookup[target_id]
    rec2 = tle_lookup[secondary_id]
    
    # 1. Propagate via SGP4 up to the burn time
    burn_time = tca_original - timedelta(hours=hours_before_tca)
    jd_burn, fr_burn = jday(burn_time.year, burn_time.month, burn_time.day,
                            burn_time.hour, burn_time.minute,
                            burn_time.second + burn_time.microsecond * 1e-6)
                            
    def make_satrec(rec):
        sat = Satrec()
        dt = datetime.fromisoformat(rec['EPOCH'].rstrip('Z'))
        epoch_days = (dt - datetime(1949, 12, 31)).total_seconds() / 86400.0
        deg2rad = math.pi / 180.0
        rev2radmin2 = (2 * math.pi) / (1440.0 ** 2)
        rev2radmin3 = (2 * math.pi) / (1440.0 ** 3)
        rev2radmin = (2 * math.pi) / 1440.0
        sat.sgp4init(
            WGS84, 'i', int(rec['NORAD_CAT_ID']), epoch_days,
            rec.get('BSTAR', 0.0),
            rec.get('MEAN_MOTION_DOT', 0.0) * rev2radmin2,
            rec.get('MEAN_MOTION_DDOT', 0.0) * rev2radmin3,
            rec.get('ECCENTRICITY', 0.0),
            rec.get('ARG_OF_PERICENTER', 0.0) * deg2rad,
            rec.get('INCLINATION', 0.0) * deg2rad,
            rec.get('MEAN_ANOMALY', 0.0) * deg2rad,
            rec.get('MEAN_MOTION', 0.0) * rev2radmin,
            rec.get('RA_OF_ASC_NODE', 0.0) * deg2rad
        )
        return sat

    sat1 = make_satrec(rec1)
    sat2 = make_satrec(rec2)
    
    e1, r1, v1 = sat1.sgp4(jd_burn, fr_burn)
    e2, r2, v2 = sat2.sgp4(jd_burn, fr_burn)
    
    if e1 != 0 or e2 != 0:
        raise ValueError(f"SGP4 propagation error at burn time: {e1}, {e2}")
        
    r1, v1 = np.array(r1), np.array(v1)
    r2, v2 = np.array(r2), np.array(v2)
    
    # 2. Apply Delta-V in RTN frame
    # M converts RTN to ECI
    M_rtn2eci = get_rtn_matrix(r1, v1)
    dv_rtn_km_s = np.array(dv_rtn_m_s) / 1000.0
    dv_eci_km_s = M_rtn2eci @ dv_rtn_km_s if dv_rtn_km_s.any() else np.zeros(3)
    
    v1_modified = v1 + dv_eci_km_s
    
    # 3. Propagate numerically through the TCA
    # Window spans from burn time to TCA + 1 hour (to allow for shifts)
    integration_window_s = (hours_before_tca * 3600.0) + 3600.0 
    
    initial_state = np.concatenate((r1, v1_modified, r2, v2))
    
    sol = solve_ivp(
        lambda t, y: combined_ode(t, y, burn_time),
        [0, integration_window_s], initial_state,
        method='DOP853', rtol=1e-6, atol=1e-6,
        dense_output=True, max_step=60.0
    )
    
    # Find new TCA and Miss Distance
    t_fine = np.linspace(0, integration_window_s, int(integration_window_s / 2.0))
    min_dist = float('inf')
    min_t = 0.0
    for ti in t_fine:
        state = sol.sol(ti)
        d = np.linalg.norm(state[0:3] - state[6:9])
        if d < min_dist:
            min_dist = d
            min_t = ti
            
    new_tca = burn_time + timedelta(seconds=min_t)
    
    # 4. Evaluate new PC using numerical output state at new_tca
    state_at_tca = sol.sol(min_t)
    r1_tca, v1_tca = state_at_tca[0:3], state_at_tca[3:6]
    r2_tca, v2_tca = state_at_tca[6:9], state_at_tca[9:12]
    
    # Extract bounding box / trajectory for secondary screening
    # Sample every 60 seconds from burn time to +12 hours
    secondary_window_s = 12 * 3600
    if secondary_window_s > integration_window_s:
        # Extend propagation for target satellite only for screening
        def single_ode(t, y, epoch_dt):
            from app.core.stage3_refine import force_model
            return force_model(t, y, epoch_dt)
            
        sol_ext = solve_ivp(
            lambda t, y: single_ode(t, y, burn_time),
            [0, secondary_window_s], np.concatenate((r1, v1_modified)),
            method='DOP853', rtol=1e-5, atol=1e-5, dense_output=True, max_step=60.0
        )
    else:
        sol_ext = sol
        
    # Run secondary screening against catalog
    satrecs, catalog_norads, catalog_names = load_satellites()
    secondary_conjunctions = []
    
    for t_sec in range(0, secondary_window_s, 120): # Check every 2 minutes
        check_time = burn_time + timedelta(seconds=t_sec)
        jd_c, fr_c = jday(check_time.year, check_time.month, check_time.day,
                          check_time.hour, check_time.minute,
                          check_time.second + check_time.microsecond * 1e-6)
                          
        target_state = sol_ext.sol(t_sec)
        target_pos = target_state[0:3]
        
        # Propagate all satellites
        coords, valid_indices = propagate_all(satrecs, jd_c, fr_c)
        
        # We only care about objects close to target_pos
        for i in valid_indices:
            nid = catalog_norads[i]
            if nid == target_id or nid == secondary_id:
                continue
            dist = np.linalg.norm(coords[i] - target_pos)
            if dist < 5.0: # 5km threshold for secondary risk
                secondary_conjunctions.append({
                    "norad_id": nid,
                    "name": catalog_names[i],
                    "tca": check_time.isoformat(),
                    "miss_dist_km": float(dist)
                })
                
    # Deduplicate secondary conjunctions
    unique_secondaries = {}
    for sc in secondary_conjunctions:
        nid = sc["norad_id"]
        if nid not in unique_secondaries or sc["miss_dist_km"] < unique_secondaries[nid]["miss_dist_km"]:
            unique_secondaries[nid] = sc
            
    # Calculate new Pc using empirical default covariances
    hbr1 = get_hard_body_radius(rec1.get('RCS'), rec1.get('OBJECT_TYPE'), rec1.get('OBJECT_NAME'))
    hbr2 = get_hard_body_radius(rec2.get('RCS'), rec2.get('OBJECT_TYPE'), rec2.get('OBJECT_NAME'))
    hbr_m = hbr1 + hbr2
    from app.core.risk import compute_empirical_covariance_rtn
    
    epoch1 = datetime.fromisoformat(rec1['EPOCH'].rstrip('Z'))
    epoch2 = datetime.fromisoformat(rec2['EPOCH'].rstrip('Z'))
    dt_days1 = max(0.0, (burn_time - epoch1).total_seconds() / 86400.0)
    dt_days2 = max(0.0, (burn_time - epoch2).total_seconds() / 86400.0)
    alt1 = np.linalg.norm(r1_tca) - 6378.137
    alt2 = np.linalg.norm(r2_tca) - 6378.137
    
    cov1 = compute_empirical_covariance_rtn(alt1, dt_days1, rec1.get('BSTAR', 1e-4))
    cov2 = compute_empirical_covariance_rtn(alt2, dt_days2, rec2.get('BSTAR', 1e-4))
    
    rel_pos = r1_tca - r2_tca
    rel_vel = v1_tca - v2_tca
    
    risk_results = compute_formal_risk_estimate(
        r1_tca, v1_tca, cov1,
        r2_tca, v2_tca, cov2,
        hbr_m, "EMPIRICAL_SGP4"
    )
    
    return {
        "scenario": {
            "tca": new_tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
            "miss_dist_km": float(min_dist),
            "relative_speed_km_s": float(np.linalg.norm(rel_vel)),
            "pc": risk_results['pc_nominal'],
            "log10_pc": math.log10(risk_results['pc_nominal']) if risk_results['pc_nominal'] > 0 else -100,
            "hbr_m": hbr_m
        },
        "secondary_risks": list(unique_secondaries.values())
    }

# ── Batch Landscape Generation ───────────────────────────────────────────────

def _landscape_worker(params):
    """Worker for executing a single cell in the maneuver grid."""
    target_id, secondary_id, tca_original, dv_rtn_m_s, hours_before_tca, tle_lookup, center_pc = params
    
    try:
        sim_result = simulate_maneuver(
            target_id=target_id, 
            secondary_id=secondary_id, 
            tca_original=tca_original,
            dv_rtn_m_s=dv_rtn_m_s, 
            hours_before_tca=hours_before_tca,
            tle_lookup=tle_lookup
        )
        
        # Determine cell risk. Worst case between primary PC and any secondary PC (if we had them, right now we just have miss dists)
        # We flag anything < 5km as dangerous.
        primary_pc = sim_result['scenario']['pc']
        
        has_secondary_risk = len(sim_result['secondary_risks']) > 0
        
        # Simple robustness logic
        status = "ROBUST_SAFE"
        if has_secondary_risk:
            status = "UNSTABLE_SECONDARY"
        elif primary_pc > center_pc:
            status = "UNSTABLE_PRIMARY_INCREASE"
            
        return {
            "success": True,
            "dv_transverse": dv_rtn_m_s[1],
            "hours_before_tca": hours_before_tca,
            "primary_pc": primary_pc,
            "has_secondary_risk": has_secondary_risk,
            "status": status,
            "sim_result": sim_result
        }
    except Exception as e:
        return {
            "success": False,
            "dv_transverse": dv_rtn_m_s[1],
            "hours_before_tca": hours_before_tca,
            "error": str(e),
            "status": "NO_SOLUTION"
        }

def simulate_maneuver_landscape(
    target_id: int, 
    secondary_id: int, 
    tca_original: datetime,
    dv_radial_m_s: float,
    dv_normal_m_s: float,
    center_dv_transverse_m_s: float,
    span_dv_transverse_m_s: float,
    center_hours: float,
    span_hours: float,
    resolution: int,
    tle_lookup: dict,
    current_pc: float
):
    """
    Evaluates a 2D grid (Time x Transverse Delta-V) of maneuvers.
    """
    
    # Generate grid
    dv_values = np.linspace(center_dv_transverse_m_s - span_dv_transverse_m_s, 
                            center_dv_transverse_m_s + span_dv_transverse_m_s, 
                            resolution)
                            
    # Ensure time > 0
    t_min = max(0.1, center_hours - span_hours)
    t_max = center_hours + span_hours
    t_values = np.linspace(t_min, t_max, resolution)
    
    tasks = []
    for t_val in t_values:
        for dv_val in dv_values:
            dv_tuple = (dv_radial_m_s, float(dv_val), dv_normal_m_s)
            tasks.append((
                target_id, secondary_id, tca_original, dv_tuple, float(t_val), tle_lookup, current_pc
            ))
            
    # Execute in parallel
    results = []
    import os
    workers = min(os.cpu_count() or 4, 8)
    
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_landscape_worker, params): params for params in tasks}
        for future in as_completed(futures):
            results.append(future.result())
            
    # Process results to find recommended and worst
    grid = []
    best_candidate = None
    worst_case = None
    
    min_risk = float('inf')
    max_risk = -1.0
    
    for r in results:
        grid.append(r)
        if r['success']:
            # Worst case
            if r['primary_pc'] > max_risk:
                max_risk = r['primary_pc']
                worst_case = r
                
            # Best candidate (must be ROBUST_SAFE)
            if r['status'] == 'ROBUST_SAFE':
                if r['primary_pc'] < min_risk:
                    min_risk = r['primary_pc']
                    best_candidate = r
                    
    # Sort grid to maintain stable order (e.g. by time, then dv)
    grid.sort(key=lambda x: (x['hours_before_tca'], x['dv_transverse']))
    
    return {
        "grid": grid,
        "best_candidate": best_candidate,
        "worst_case": worst_case,
        "resolution": resolution
    }
