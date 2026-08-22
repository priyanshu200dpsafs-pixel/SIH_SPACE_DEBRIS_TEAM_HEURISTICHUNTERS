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
    run_cdm_backtest
)
from spatial_index import load_satellites, propagate_all, find_close_approaches
from sgp4.api import Satrec, WGS84, jday

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
    Worker function: Integrates pair trajectory around TCA and computes 2D Foster Pc.
    """
    (id1, id2, name1, name2, r1_init, v1_init, r2_init, v2_init, tca_iso,
     alt1, dt_days1, bstar1, rcs1, type1,
     alt2, dt_days2, bstar2, rcs2, type2, f107, ap) = pair_data

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

    # Foster 2D Pc
    pc, diag = compute_foster_2d_pc(
        r1_tca, v1_tca, r2_tca, v2_tca,
        cov_rtn1, cov_rtn2,
        combined_hbr
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
    }


def run_stage4_full_pipeline(max_refine_candidates: int = 250, f107: float = 150.0, ap: float = 15.0):
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

    WINDOW_HOURS = 24
    TIMESTEP_SECONDS = 60
    SCREEN_THRESHOLD = 50.0
    COLOCATION_THRESHOLD = 0.1

    active_events = {}
    finished_events = []
    distance_histories = defaultdict(list)

    total_steps = int((WINDOW_HOURS * 3600) / TIMESTEP_SECONDS)
    t0 = time.perf_counter()

    for step in range(total_steps):
        target_time = now + timedelta(seconds=step * TIMESTEP_SECONDS)
        jd_val, fr_val = jday(target_time.year, target_time.month, target_time.day,
                              target_time.hour, target_time.minute,
                              target_time.second + target_time.microsecond * 1e-6)
        coords, valid_indices = propagate_all(satrecs, jd_val, fr_val)
        approaches = find_close_approaches(coords, valid_indices, norad_ids, threshold_km=SCREEN_THRESHOLD)

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
    print(f"  Screening completed in {time.perf_counter() - t0:.1f}s. Merged events: {len(sorted_all)}")

    # 3. Apply Multi-Layer Co-Location & Formation Filters
    print("\n[Step 3] Applying Formation & Co-Location Filters...")
    genuine_conjunctions = []
    colocated_count = 0
    formation_count = 0

    for ev in sorted_all:
        id1, id2 = ev['id1'], ev['id2']
        pair_key = (id1, id2)

        # Check known formation flying
        if is_known_formation(id1, id2):
            formation_count += 1
            continue

        # Check co-location persistence
        if ev['min_dist'] < COLOCATION_THRESHOLD and pair_key in distance_histories:
            history = distance_histories[pair_key]
            persistence_verdict = classify_colocation(history)
            if persistence_verdict == 'COLOCATED' or is_known_colocated(id1, id2):
                colocated_count += 1
                continue

        # Check same-launch (recently deployed siblings)
        rec1 = tle_lookup.get(id1)
        rec2 = tle_lookup.get(id2)
        if rec1 and rec2 and is_same_launch(rec1.get('OBJECT_ID'), rec2.get('OBJECT_ID')):
            formation_count += 1
            continue

        genuine_conjunctions.append(ev)

    print(f"  Filtered out {colocated_count} co-located / {formation_count} formation pairs.")
    print(f"  Genuine candidate conjunctions: {len(genuine_conjunctions)}")

    # 4. Prepare top candidates for Stage 3 Refinement + Stage 4 Pc
    candidates = genuine_conjunctions[:max_refine_candidates]
    print(f"\n[Step 4] Integrating & Computing Foster 2D Pc for top {len(candidates)} candidates...")

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
            f107, ap
        ))

    results = []
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(refine_and_compute_pc_worker, pd) for pd in pair_data_list]
        for f in as_completed(futures):
            results.append(f.result())

    # Sort results by Probability of Collision (descending), then by miss distance (ascending)
    results_sorted_pc = sorted(results, key=lambda x: (-x['pc'], x['refined_min_dist_km']))

    print("\n" + "=" * 70)
    print(" FINAL STAGE 4 CONJUNCTION ASSESSMENT RESULTS (RANKED BY Pc)")
    print("=" * 70)
    for i, r in enumerate(results_sorted_pc[:20]):
        print(f" {i+1:2d}. [{r['id1']}] {r['name1']} <-> [{r['id2']}] {r['name2']}")
        print(f"     Pc: {r['pc_scientific']} ({r['pc']:.8f}) | Miss Dist: {r['refined_min_dist_km']:.4f} km | Rel Speed: {r['relative_speed_km_s']:.2f} km/s")
        print(f"     TCA: {r['refined_tca']} | HBR: {r['hbr_m']:.1f} m | Sigma_X/Y: {r['sigma_x_m']:.1f}m / {r['sigma_y_m']:.1f}m")

    return bt, results_sorted_pc


if __name__ == '__main__':
    run_stage4_full_pipeline(max_refine_candidates=250)
