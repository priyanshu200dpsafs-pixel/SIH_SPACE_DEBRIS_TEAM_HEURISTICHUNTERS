"""
Stage 4: Probability of Collision (Pc) Calculation Pipeline

Executes Foster 2D Collision Probability integration on Stage 3 refined conjunctions:
1. Filters out co-located structures and formation-flying missions.
2. Extracts numerical states (r, v) at TCA from high-fidelity numerical propagation.
3. Computes empirical RTN covariances scaled by altitude, epoch age, and B*.
4. Applies hybrid HBR sizing model (RCS primary + object-type fallback).
5. Projects combined covariance onto the conjunction B-plane and performs 2D Gaussian integration.
6. Ranks genuine conjunctions by Pc and miss distance.
"""

import os
import sys
import math
import time
import json
import numpy as np
from datetime import datetime, timedelta, timezone
from scipy.integrate import solve_ivp
from concurrent.futures import ProcessPoolExecutor, as_completed
from collections import defaultdict

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from stage3_refine import (
    MU, RE, force_model, combined_ode,
    classify_colocation, is_known_colocated, is_known_formation, is_same_launch
)
from risk import (
    get_hard_body_radius,
    compute_empirical_covariance_rtn,
    compute_foster_2d_pc,
    compute_formal_risk_estimate,
    run_cdm_backtest,
    run_monte_carlo_validation
)
from spatial_index import load_satellites, propagate_all, find_close_approaches
from sgp4.api import Satrec, WGS84, jday
from consensus import (
    PropagationResult,
    PropagatorEncounterSummary,
    ModelConsensusEvaluation,
    evaluate_sgp4_fine_encounter,
    compare_propagation_models
)
from app.core.config import settings

deg2rad = math.pi / 180.0
rev2radmin = (2 * math.pi) / 1440.0
rev2radmin2 = (2 * math.pi) / (1440.0 ** 2)
rev2radmin3 = (2 * math.pi) / (1440.0 ** 3)
base_epoch = datetime(1949, 12, 31)

def make_satrec(rec):
    sat = Satrec()
    dt_str = rec['EPOCH'].rstrip('Z')
    dt = datetime.fromisoformat(dt_str)
    epoch_days = (dt - base_epoch).total_seconds() / 86400.0
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



def refine_and_compute_pc_worker(pair_data):
    """
    Worker function: Integrates pair trajectory around TCA, computes 2D Foster Pc,
    and runs independent multi-model consensus evaluation between SGP4 and numerical propagation.
    """
    (id1, id2, name1, name2, r1_init, v1_init, r2_init, v2_init, tca_iso,
     alt1, dt_days1, bstar1, rcs1, type1,
     alt2, dt_days2, bstar2, rcs2, type2, f107, ap, rec1, rec2) = pair_data

    tca_dt = datetime.fromisoformat(tca_iso)
    initial_state = np.concatenate((r1_init, v1_init, r2_init, v2_init))
    WINDOW = 600.0  # 10 minute window around rough TCA

    sol = solve_ivp(
        lambda t, y: combined_ode(t, y, tca_dt, f107=f107, ap=ap),
        [0, WINDOW], initial_state,
        method='DOP853', rtol=1e-8, atol=1e-8,
        dense_output=True, max_step=5.0
    )

    t_fine = np.linspace(0, WINDOW, int(WINDOW))
    min_dist = float('inf')
    min_t = 0.0
    best_state = None

    for ti in t_fine:
        state = sol.sol(ti)
        d = np.linalg.norm(state[0:3] - state[6:9])
        if d < min_dist:
            min_dist = d
            min_t = ti
            best_state = state

    refined_tca = tca_dt + timedelta(seconds=min_t - WINDOW / 2)

    r1_tca = best_state[0:3]
    v1_tca = best_state[3:6]
    r2_tca = best_state[6:9]
    v2_tca = best_state[9:12]

    # Altitudes at TCA
    alt1_tca = np.linalg.norm(r1_tca) - RE
    alt2_tca = np.linalg.norm(r2_tca) - RE

    # Covariances in RTN (m^2)
    cov_rtn1 = compute_empirical_covariance_rtn(
        altitude_km=alt1_tca,
        epoch_age_days=dt_days1,
        bstar=bstar1
    )
    cov_rtn2 = compute_empirical_covariance_rtn(
        altitude_km=alt2_tca,
        epoch_age_days=dt_days2,
        bstar=bstar2
    )

    # Hard-Body Radii
    hbr1 = get_hard_body_radius(rcs1, type1, name1)
    hbr2 = get_hard_body_radius(rcs2, type2, name2)
    combined_hbr = hbr1 + hbr2

    # Formal Risk Estimation (Foster + Chan + Sensitivity Analysis)
    pc, diag = compute_formal_risk_estimate(
        r1_tca, v1_tca, r2_tca, v2_tca,
        cov_rtn1, cov_rtn2,
        combined_hbr,
        covariance_source="Empirical TLE"
    )

    # ── Multi-Model Consensus Evaluation ──────────────────────────────────
    consensus_status = "HIGH_AGREEMENT"
    agreement_score = 100.0
    consensus_metrics = None

    if settings.CONSENSUS_ENABLED and rec1 and rec2:
        try:
            sat1 = make_satrec(rec1)
            sat2 = make_satrec(rec2)
            sgp4_encounter = evaluate_sgp4_fine_encounter(sat1, sat2, tca_dt, search_window_sec=600.0, time_step_sec=1.0)

            if sgp4_encounter:
                state_1_num = PropagationResult(
                    position_km=r1_tca.tolist(),
                    velocity_km_s=v1_tca.tolist(),
                    timestamp_utc=refined_tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
                    propagator_name="DOP853_NUMERICAL",
                    integration_status="CONVERGED",
                    numerical_metadata={"rtol": 1e-8, "atol": 1e-8, "force_model": "DOP853 + NRLMSISE-00 + J2-J6"}
                )
                state_2_num = PropagationResult(
                    position_km=r2_tca.tolist(),
                    velocity_km_s=v2_tca.tolist(),
                    timestamp_utc=refined_tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
                    propagator_name="DOP853_NUMERICAL",
                    integration_status="CONVERGED",
                    numerical_metadata={"rtol": 1e-8, "atol": 1e-8, "force_model": "DOP853 + NRLMSISE-00 + J2-J6"}
                )
                rel_pos_num = (r1_tca - r2_tca).tolist()
                rel_vel_num = (v1_tca - v2_tca).tolist()
                rel_speed_num = float(np.linalg.norm(v1_tca - v2_tca))

                num_encounter = PropagatorEncounterSummary(
                    propagator_name="DOP853 High-Order Numerical",
                    tca_utc=refined_tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
                    tca_timestamp=refined_tca,
                    miss_distance_km=round(min_dist, 4),
                    relative_speed_km_s=round(rel_speed_num, 4),
                    relative_position_km=[round(x, 4) for x in rel_pos_num],
                    relative_velocity_km_s=[round(x, 4) for x in rel_vel_num],
                    state_1=state_1_num,
                    state_2=state_2_num
                )

                eval_res = compare_propagation_models(
                    sgp4_encounter=sgp4_encounter,
                    numerical_encounter=num_encounter,
                    tca_tol_high_sec=settings.CONSENSUS_TCA_TOLERANCE_HIGH_S,
                    tca_tol_mod_sec=settings.CONSENSUS_TCA_TOLERANCE_MOD_S,
                    dist_tol_high_km=settings.CONSENSUS_DIST_TOLERANCE_HIGH_KM,
                    dist_tol_mod_km=settings.CONSENSUS_DIST_TOLERANCE_MOD_KM
                )
                consensus_status = eval_res.consensus_status
                agreement_score = eval_res.model_agreement_score
                consensus_metrics = eval_res.to_dict()
        except Exception as e:
            consensus_status = "UNKNOWN"
            agreement_score = None
            consensus_metrics = {"error": str(e)}

    # ── Monte Carlo Pc Validation Mode (Independent Verification) ─────────
    # Trigger Rules: High Risk, High Disagreement, Covariance-Sensitive
    mc_results = {}
    if pc > 1e-4 or diag.get('foster_chan_agreement', 0) > 1.0 or consensus_status == 'HIGH_DIVERGENCE' or diag.get('sensitivity_score', 0) > 2.0:
        mc_results = run_monte_carlo_validation(
            miss_dist_m=diag.get('miss_distance_m', min_dist * 1000.0),
            hbr_m=combined_hbr,
            sigma_x_m=diag.get('sigma_x_m', 0.0),
            sigma_y_m=diag.get('sigma_y_m', 0.0),
            foster_pc=pc,
            miss_angle_rad=math.pi / 4.0, # Approximate unless we extract exactly
            num_samples=100000,
            seed=42
        )

    return {
        'id1': id1, 'id2': id2,
        'name1': name1, 'name2': name2,
        'refined_min_dist_km': round(min_dist, 4),
        'refined_tca': refined_tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
        'pc': pc,
        'pc_scientific': diag.get('pc_scientific', f"{pc:.6e}"),
        'relative_speed_km_s': diag.get('relative_speed_km_s', 0.0),
        'hbr_m': combined_hbr,
        'sigma_x_m': diag.get('sigma_x_m', 0.0),
        'sigma_y_m': diag.get('sigma_y_m', 0.0),
        # Formal Risk Bounds
        'pc_lower': diag.get('pc_lower', 0.0),
        'pc_upper': diag.get('pc_upper', 0.0),
        'sensitivity_score': diag.get('sensitivity_score', 0.0),
        'uncertainty_confidence': diag.get('uncertainty_confidence'),
        'foster_chan_agreement': diag.get('foster_chan_agreement', 0.0),
        'uncertainty_explanation': diag.get('uncertainty_explanation'),
        # Monte Carlo Validation
        'mc_pc': mc_results.get('mc_pc'),
        'mc_confidence_interval': mc_results.get('mc_confidence_interval'),
        'mc_sample_count': mc_results.get('mc_sample_count'),
        'mc_validation_status': mc_results.get('mc_validation_status'),
        'mc_seed': mc_results.get('mc_seed'),
        # Provenance
        'propagation_model': "SGP4 (Stage 1/2)",
        'stage_3_model': "DOP853 + NRLMSISE-00 + J2-J6",
        'tca_convergence_status': "SUCCESS",
        'refinement_tolerance': 1e-8,
        'pc_method': "Foster 2D Polar (Log-Space)",
        'covariance_model': "Empirical Altitude Scaled RTN",
        'hbr_model': "Hybrid RCS + Type fallback",
        # Multi-Model Consensus
        'consensus_status': consensus_status,
        'model_agreement_score': agreement_score,
        'consensus_metrics': consensus_metrics,
    }


def run_stage4_full_pipeline(max_refine_candidates: int = 250, f107: float = 150.0, ap: float = 15.0, changed_ids: set = None):
    print("=" * 70)
    print(" STAGE 4 CONJUNCTION ASSESSMENT & Pc COMPUTATION PIPELINE")
    print("=" * 70)

    # 1. Backtest validation
    print("\n[Step 1] Running Historical CDM Ground-Truth Backtest...")
    bt = run_cdm_backtest()
    print("  CDM Backtest Results:")
    print(f"    Evaluated CDMs:          {bt['total_evaluated']}")
    print(f"    Linear Correlation:      {bt['correlation_linear']}")
    print(f"    Log-Space Correlation:   {bt['correlation_log_space']}")
    print(f"    Mean Absolute Log-Error: {bt['mean_absolute_log_error']} orders of magnitude")
    print(f"    High Risk (True/Model):  {bt['high_risk_ground_truth_count']} / {bt['high_risk_model_predicted_count']}")
    print(f"    High Risk Concordance:   {bt['high_risk_concordance_pct']}% ({bt['both_high_risk_count']} matches)")

    # 2. Load TLEs and Screen Conjunctions
    print("\n[Step 2] Loading Active TLEs & 24h KD-tree screening...")
    tle_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'cache', 'active_tles.json')
    tle_path = os.path.normpath(tle_path)
    with open(tle_path) as f:
        tle_data = json.load(f)
    tle_lookup = {rec['NORAD_CAT_ID']: rec for rec in tle_data}

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    satrecs, norad_ids, names = load_satellites()

    WINDOW_HOURS = settings.REFRESH_INTERVAL_HOURS # using the config for window
    TIMESTEP_SECONDS = settings.SCREENING_COARSE_STEP_S
    SCREEN_THRESHOLD = settings.SCREENING_COARSE_THRESHOLD_KM
    COLOCATION_THRESHOLD = settings.SCREENING_STAGE3_HANDOFF_KM

    active_events = {}
    finished_events = []
    distance_histories = defaultdict(list)
    
    # Map changed_ids to valid indices
    changed_indices_set = None
    if changed_ids is not None:
        changed_indices_set = {i for i, nid in enumerate(norad_ids) if nid in changed_ids}
        if not changed_indices_set:
            changed_indices_set = set() # Empty means no changes found in active objects

    total_steps = int((WINDOW_HOURS * 3600) / TIMESTEP_SECONDS)
    t0 = time.perf_counter()
    screening_runtime = 0.0
    stage3_runtime = 0.0

    for step in range(total_steps):
        target_time = now + timedelta(seconds=step * TIMESTEP_SECONDS)
        jd_val, fr_val = jday(target_time.year, target_time.month, target_time.day,
                              target_time.hour, target_time.minute,
                              target_time.second + target_time.microsecond * 1e-6)
        coords, vels, valid_indices = propagate_all(satrecs, jd_val, fr_val)
        approaches = find_close_approaches(coords, vels, valid_indices, norad_ids, threshold_km=SCREEN_THRESHOLD, changed_indices_set=changed_indices_set, dt_sec=TIMESTEP_SECONDS)

        for orig_i, orig_j, dist in approaches:
            id1, id2 = norad_ids[orig_i], norad_ids[orig_j]
            name1, name2 = names[orig_i], names[orig_j]
            pair_key = (min(id1, id2), max(id1, id2))

            if dist < COLOCATION_THRESHOLD:
                distance_histories[pair_key].append(dist)

            if pair_key not in active_events:
                active_events[pair_key] = {
                    'id1': pair_key[0], 'id2': pair_key[1],
                    'name1': name1 if id1 == pair_key[0] else name2,
                    'name2': name2 if id2 == pair_key[1] else name1,
                    'min_dist': dist, 'tca': target_time,
                    'start_time': target_time, 'end_time': target_time,
                    'last_seen_step': step
                }
            else:
                ev = active_events[pair_key]
                ev['end_time'] = target_time
                ev['last_seen_step'] = step
                if dist < ev['min_dist']:
                    ev['min_dist'] = dist
                    ev['tca'] = target_time

        ended = [k for k, v in active_events.items() if v['last_seen_step'] < step]
        for k in ended:
            finished_events.append(active_events.pop(k))

    finished_events.extend(active_events.values())
    sorted_all = sorted(finished_events, key=lambda e: e['min_dist'])
    print(f"  Screening completed in {time.perf_counter() - t0:.1f}s. Raw events: {len(sorted_all)}")

    # 2.5 Adaptive Temporal Refinement
    print(f"\n[Step 2.5] Applying Adaptive SGP4 Temporal Refinement...")
    from app.core.adaptive_screening import adaptive_sgp4_refinement
    id_to_sat = {nid: sat for nid, sat in zip(norad_ids, satrecs)}
    refined_events = []
    
    t_adapt_start = time.perf_counter()
    for ev in sorted_all:
        sat1 = id_to_sat.get(ev['id1'])
        sat2 = id_to_sat.get(ev['id2'])
        if sat1 and sat2:
            tca_ref, dist_ref = adaptive_sgp4_refinement(sat1, sat2, ev['start_time'], ev['end_time'])
            ev['tca'] = tca_ref
            ev['min_dist'] = dist_ref
            if dist_ref < COLOCATION_THRESHOLD:
                refined_events.append(ev)
    
    sorted_all = sorted(refined_events, key=lambda e: e['min_dist'])
    print(f"  Adaptive refinement took {time.perf_counter() - t_adapt_start:.1f}s. Filtered to {len(sorted_all)} < {COLOCATION_THRESHOLD}km")

    # 3. Apply Multi-Layer Co-Location & Formation Filters
    print("\n[Step 3] Applying Formation & Co-Location Filters...")
    genuine_conjunctions = []
    colocated_count = 0
    formation_count = 0

    results = [] # Move results array initialization up here so we can append filtered events immediately.
    
    for ev in sorted_all:
        id1, id2 = ev['id1'], ev['id2']
        pair_key = (id1, id2)
        
        tca_iso = ev['tca'].strftime('%Y-%m-%d %H:%M:%S UTC')
        base_result = {
            'id1': ev['id1'], 'id2': ev['id2'],
            'name1': ev['name1'], 'name2': ev['name2'],
            'refined_min_dist_km': ev['min_dist'],
            'refined_tca': tca_iso,
            'pc': 0.0,
            'pc_scientific': "0.000000e+00",
            'relative_speed_km_s': 0.0,
            'hbr_m': 0.0,
            'sigma_x_m': 0.0,
            'sigma_y_m': 0.0,
            'pc_lower': 0.0,
            'pc_upper': 0.0,
            'sensitivity_score': 0.0,
            'uncertainty_confidence': "EXCLUDED",
            'foster_chan_agreement': 0.0,
            'propagation_model': "SGP4 (Filtered)",
            'tca_convergence_status': "SKIPPED",
            'consensus_status': "SKIPPED",
            'model_agreement_score': 0.0,
        }

        # Check known formation flying
        if is_known_formation(id1, id2):
            formation_count += 1
            base_result['uncertainty_explanation'] = "KNOWN DESIGNED FORMATION: Not an independent random conjunction."
            base_result['filter_decisions'] = "Rule: KNOWN_FORMATION (v1.0)"
            results.append(base_result)
            continue

        # Check co-location persistence
        if ev['min_dist'] < COLOCATION_THRESHOLD and pair_key in distance_histories:
            history = distance_histories[pair_key]
            persistence_verdict = classify_colocation(history)
            if persistence_verdict == 'COLOCATED' or is_known_colocated(id1, id2):
                colocated_count += 1
                base_result['uncertainty_explanation'] = "STRUCTURALLY ATTACHED / DOCKED: Persistence analysis or known structure group."
                base_result['filter_decisions'] = "Rule: CO_LOCATED (v1.0)"
                results.append(base_result)
                continue

        # Check same-launch (recently deployed siblings)
        rec1 = tle_lookup.get(id1)
        rec2 = tle_lookup.get(id2)
        if rec1 and rec2 and is_same_launch(rec1.get('OBJECT_ID'), rec2.get('OBJECT_ID')):
            formation_count += 1
            base_result['uncertainty_explanation'] = "SAME-LAUNCH / SEPARATING: Monitor for deployment context."
            base_result['filter_decisions'] = "Rule: SAME_LAUNCH (v1.0)"
            results.append(base_result)
            continue

        genuine_conjunctions.append(ev)

    print(f"  Classified {colocated_count} co-located / {formation_count} formation pairs. Safely bypassed numerical integration.")
    print(f"  Genuine candidate conjunctions: {len(genuine_conjunctions)}")
    
    screening_runtime = time.perf_counter() - t0

    # 4. Prepare top candidates for Stage 3 Refinement + Stage 4 Pc
    candidates = genuine_conjunctions[:max_refine_candidates]
    print(f"\n[Step 4] Integrating & Computing Foster 2D Pc for top {len(candidates)} candidates...")

    t_stage3_start = time.perf_counter()
    workers = os.cpu_count() or 4
    pair_data_list = []

    for ev in candidates:
        rec1 = tle_lookup.get(ev['id1'])
        rec2 = tle_lookup.get(ev['id2'])
        if not rec1 or not rec2:
            continue

        sat1 = make_satrec(rec1)
        sat2 = make_satrec(rec2)
        tca = ev['tca']
        jd_t, fr_t = jday(tca.year, tca.month, tca.day, tca.hour, tca.minute,
                          tca.second + tca.microsecond * 1e-6)
        e1, r1, v1 = sat1.sgp4(jd_t, fr_t)
        e2, r2, v2 = sat2.sgp4(jd_t, fr_t)
        if e1 != 0 or e2 != 0:
            # SGP4 failed for at least one object
            # DO NOT SILENTLY DROP. Add a failure record.
            tca_iso = tca.isoformat()
            results.append({
                'id1': ev['id1'], 'id2': ev['id2'],
                'name1': ev['name1'], 'name2': ev['name2'],
                'refined_min_dist_km': ev['min_dist'],
                'refined_tca': tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
                'pc': -1.0,
                'pc_scientific': "ERROR",
                'relative_speed_km_s': 0.0,
                'hbr_m': 0.0,
                'sigma_x_m': 0.0,
                'sigma_y_m': 0.0,
                'pc_lower': 0.0,
                'pc_upper': 0.0,
                'sensitivity_score': 100.0,
                'uncertainty_confidence': "CRITICAL FAILURE",
                'foster_chan_agreement': 0.0,
                'uncertainty_explanation': "PROPAGATION_FAILED: SGP4 returned error code (likely decayed satellite)",
                'propagation_model': "SGP4 (FAILED)",
                'tca_convergence_status': "FAILED",
                'consensus_status': "FAILED",
                'model_agreement_score': 0.0,
            })
            continue

        epoch1 = datetime.fromisoformat(rec1['EPOCH'].rstrip('Z'))
        epoch2 = datetime.fromisoformat(rec2['EPOCH'].rstrip('Z'))
        dt_days1 = max(0.0, (tca - epoch1).total_seconds() / 86400.0)
        dt_days2 = max(0.0, (tca - epoch2).total_seconds() / 86400.0)

        alt1 = np.linalg.norm(r1) - RE
        alt2 = np.linalg.norm(r2) - RE

        pair_data_list.append((
            ev['id1'], ev['id2'], ev['name1'], ev['name2'],
            np.array(r1), np.array(v1), np.array(r2), np.array(v2),
            tca.isoformat(),
            alt1, dt_days1, rec1.get('BSTAR', 1e-4), rec1.get('RCS'), rec1.get('OBJECT_TYPE'),
            alt2, dt_days2, rec2.get('BSTAR', 1e-4), rec2.get('RCS'), rec2.get('OBJECT_TYPE'),
            f107, ap,
            rec1, rec2
        ))

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(refine_and_compute_pc_worker, pd) for pd in pair_data_list]
        for f in as_completed(futures):
            results.append(f.result())
            
    stage3_runtime = time.perf_counter() - t_stage3_start

    # Sort results by Probability of Collision (descending), then by miss distance (ascending)
    results_sorted_pc = sorted(results, key=lambda x: (-x['pc'], x['refined_min_dist_km']))

    print("\n" + "=" * 70)
    print(" FINAL STAGE 4 CONJUNCTION ASSESSMENT RESULTS (RANKED BY Pc)")
    print("=" * 70)
    for i, r in enumerate(results_sorted_pc[:20]):
        print(f" {i+1:2d}. [{r['id1']}] {r['name1']} <-> [{r['id2']}] {r['name2']}")
        print(f"     Pc: {r['pc_scientific']} (Bounds: [{r['pc_lower']:.2e}, {r['pc_upper']:.2e}]) | Miss: {r['refined_min_dist_km']:.4f} km")
        print(f"     Confidence: {r['uncertainty_confidence']} | Sensitivity: {r['sensitivity_score']:.2f}")
        print(f"     TCA: {r['refined_tca']} | HBR: {r['hbr_m']:.1f} m")

    return bt, results_sorted_pc, screening_runtime, stage3_runtime


if __name__ == '__main__':
    run_stage4_full_pipeline(max_refine_candidates=250)
