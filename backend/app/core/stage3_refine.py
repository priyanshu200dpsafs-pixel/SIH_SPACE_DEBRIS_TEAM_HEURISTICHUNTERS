"""
Stage 3: Parallelized High-Fidelity Conjunction Refinement
with Persistence-Based Co-Location Filter.

Uses ProcessPoolExecutor to run solve_ivp integrations across CPU cores.
Force model: Two-body + J2-J6 zonal harmonics + lunisolar + NRLMSISE-00 drag.
"""
import os
import sys
import time
import json
import math
import numpy as np
from datetime import datetime, timedelta, timezone
from scipy.integrate import solve_ivp
from concurrent.futures import ProcessPoolExecutor, as_completed
from collections import defaultdict

try:
    from nrlmsise00 import msise_model
    HAS_NRLMSISE = True
except ImportError:
    HAS_NRLMSISE = False

# ── Earth & gravitational constants ──────────────────────────────────────────
MU = 398600.4418          # km^3/s^2
RE = 6378.137             # km (equatorial radius)
J2 = 1.08263e-3
J3 = -2.53881e-6
J4 = -1.61998e-6
J5 = -2.27141e-7
J6 = 5.40788e-7

# ── Known structural groups (secondary safety net) ───────────────────────────
# Each set contains NORAD IDs that are physically part of the same structure.
KNOWN_STATION_GROUPS = [
    # ISS complex (core modules)
    {25544, 25575, 26400, 26700, 36086, 49044},
    # Chinese Space Station (Tiangong / CSS core modules)
    {48274, 53239, 54216},
]

# ── Known formation-flying missions (Layer 2: domain knowledge) ──────────────
# These are controlled, coordinated missions that fly close by DESIGN.
KNOWN_FORMATION_MISSIONS = [
    # DLR TerraSAR-X / TanDEM-X helix formation (since 2010)
    {31698, 36605},
    # PIESAT-1 / Hongtu-1 Cartwheel formation (launched together 2023-03-30)
    {56153, 56154, 56155, 56156},
    # Tianhui 2-02 A/B bistatic InSAR tandem (launched 2021-08-18)
    {49071, 49072},
    # SUPERVIEW NEO-2 03/04 SAR formation pair
    {62079, 62080},
]

# ── Known docked/visiting vehicles (extend station groups dynamically) ───────
# These are vehicles currently docked to stations — update periodically.
KNOWN_DOCKED_VEHICLES = {
    # ISS visiting vehicles (as of Aug 2026)
    67796: 25544,   # CREW DRAGON 12 → ISS
    68319: 25544,   # PROGRESS-MS 33 → ISS
    68689: 25544,   # CYGNUS NG-24 → ISS
    68837: 25544,   # PROGRESS-MS 34 → ISS
    100057: 25544,  # SOYUZ-MS 29 → ISS
    # CSS visiting vehicles (as of Aug 2026)
    69049: 48274,   # TIANZHOU-10 → CSS
    69180: 48274,   # SHENZHOU-23 → CSS
}

def get_known_group(norad_id):
    """Return the station group set a NORAD ID belongs to, or None."""
    for group in KNOWN_STATION_GROUPS:
        if norad_id in group:
            return group
    # Check if it's a docked vehicle
    if norad_id in KNOWN_DOCKED_VEHICLES:
        parent_id = KNOWN_DOCKED_VEHICLES[norad_id]
        for group in KNOWN_STATION_GROUPS:
            if parent_id in group:
                return group
    return None

def is_known_colocated(id1, id2):
    """Check if two NORAD IDs belong to the same known station group."""
    g1 = get_known_group(id1)
    if g1 and id2 in g1:
        return True
    # Also check if id2 is a docked vehicle to the same station
    g2 = get_known_group(id2)
    if g1 and g2 and g1 == g2:
        return True
    return False

def is_known_formation(id1, id2):
    """Check if two NORAD IDs are part of a known formation-flying mission."""
    for group in KNOWN_FORMATION_MISSIONS:
        if id1 in group and id2 in group:
            return True
    return False

def is_same_launch(obj_id_1, obj_id_2):
    """Check if two OBJECT_IDs share the same launch designator (e.g., '2026-187')."""
    if not obj_id_1 or not obj_id_2:
        return False
    # OBJECT_ID format: "YYYY-NNNXX" where YYYY-NNN is the launch and XX is the piece
    prefix1 = obj_id_1.rsplit('-', 1)[0] if '-' in obj_id_1 else obj_id_1
    prefix2 = obj_id_2.rsplit('-', 1)[0] if '-' in obj_id_2 else obj_id_2
    # Handle format like "2026-187E" — split on last letter group
    import re
    m1 = re.match(r'(\d{4}-\d{3})', obj_id_1)
    m2 = re.match(r'(\d{4}-\d{3})', obj_id_2)
    if m1 and m2:
        return m1.group(1) == m2.group(1)
    return False


# ── Force model ──────────────────────────────────────────────────────────────
def force_model(t, state, epoch_dt, f107=150.0, ap=15.0):
    """Full perturbation acceleration for a single satellite."""
    r_vec = state[0:3]
    v_vec = state[3:6]
    r = np.linalg.norm(r_vec)
    x, y, z = r_vec

    r3 = r ** 3
    acc = -MU / r3 * r_vec

    z_r = z / r
    z_r2 = z_r ** 2
    re_r = RE / r
    re_r2 = re_r ** 2

    fac_j2 = 1.5 * J2 * re_r2 * MU / r3
    acc[0] += fac_j2 * x * (5 * z_r2 - 1)
    acc[1] += fac_j2 * y * (5 * z_r2 - 1)
    acc[2] += fac_j2 * z * (5 * z_r2 - 3)

    fac_j3 = 0.5 * J3 * re_r2 * re_r * MU / r3
    acc[0] += fac_j3 * x * (7 * z_r2 * z_r - 3 * z_r)
    acc[1] += fac_j3 * y * (7 * z_r2 * z_r - 3 * z_r)
    acc[2] += fac_j3 * (z * (7 * z_r2 * z_r - 6 * z_r) + (3.0 / 5.0) * r)

    fac_j4 = -0.625 * J4 * re_r2 * re_r2 * MU / r3
    z_r4 = z_r2 * z_r2
    acc[0] += fac_j4 * x * (63 * z_r4 - 42 * z_r2 + 3)
    acc[1] += fac_j4 * y * (63 * z_r4 - 42 * z_r2 + 3)
    acc[2] += fac_j4 * z * (63 * z_r4 - 70 * z_r2 + 15)

    fac_j5 = J5 * re_r2 * re_r2 * re_r * MU / r3 * 0.125
    z_r5 = z_r4 * z_r
    acc[0] += fac_j5 * x * (429 * z_r5 - 390 * z_r2 * z_r + 45 * z_r)
    acc[1] += fac_j5 * y * (429 * z_r5 - 390 * z_r2 * z_r + 45 * z_r)
    acc[2] += fac_j5 * z * (429 * z_r5 - 462 * z_r2 * z_r + 105 * z_r)

    fac_j6 = -J6 * (re_r ** 6) * MU / r3 / 16.0
    z_r6 = z_r4 * z_r2
    acc[0] += fac_j6 * x * (3003 * z_r6 - 3465 * z_r4 + 945 * z_r2 - 15)
    acc[1] += fac_j6 * y * (3003 * z_r6 - 3465 * z_r4 + 945 * z_r2 - 15)
    acc[2] += fac_j6 * z * (3003 * z_r6 - 4095 * z_r4 + 1575 * z_r2 - 105)

    sun_pos = np.array([1.496e8, 0.0, 0.0])
    moon_pos = np.array([3.844e5, 0.0, 0.0])
    MU_SUN = 1.32712440018e11
    MU_MOON = 4902.8

    d_sun = sun_pos - r_vec
    d_moon = moon_pos - r_vec
    acc += MU_SUN * (d_sun / np.linalg.norm(d_sun)**3 - sun_pos / np.linalg.norm(sun_pos)**3)
    acc += MU_MOON * (d_moon / np.linalg.norm(d_moon)**3 - moon_pos / np.linalg.norm(moon_pos)**3)

    alt_km = r - RE
    if 100.0 < alt_km < 1000.0:
        if HAS_NRLMSISE:
            # res = msise_model(Epoch, alt, lat, lon, f107A, f107, ap)
            res = msise_model(epoch_dt, alt_km, 0.0, 0.0, f107, f107, ap)
            rho = res[0][5] * 1e9
        else:
            rho = 3.614e-13 * math.exp(-(alt_km - 175.0) / 50.0) * 1e9
        v_norm = np.linalg.norm(v_vec)
        if v_norm > 0:
            acc -= 0.5 * rho * 1e-5 * v_norm * v_vec

    return np.array([v_vec[0], v_vec[1], v_vec[2], acc[0], acc[1], acc[2]])


def combined_ode(t, state, epoch_dt, f107=150.0, ap=15.0):
    d1 = force_model(t, state[0:6], epoch_dt, f107=f107, ap=ap)
    d2 = force_model(t, state[6:12], epoch_dt, f107=f107, ap=ap)
    return np.concatenate((d1, d2))


# ── Worker function for ProcessPoolExecutor ──────────────────────────────────
def refine_pair(pair_data):
    """Integrate a single pair over ±5 min around rough TCA."""
    id1, id2, name1, name2, r1, v1, r2, v2, tca_iso = pair_data
    tca_dt = datetime.fromisoformat(tca_iso)
    initial_state = np.concatenate((r1, v1, r2, v2))
    WINDOW = 600.0

    sol = solve_ivp(
        lambda t, y: combined_ode(t, y, tca_dt),
        [0, WINDOW], initial_state,
        method='DOP853', rtol=1e-8, atol=1e-8,
        dense_output=True, max_step=5.0
    )

    t_fine = np.linspace(0, WINDOW, int(WINDOW))
    min_dist = float('inf')
    min_t = 0.0
    for ti in t_fine:
        state = sol.sol(ti)
        d = np.linalg.norm(state[0:3] - state[6:9])
        if d < min_dist:
            min_dist = d
            min_t = ti

    refined_tca = tca_dt + timedelta(seconds=min_t - WINDOW / 2)
    return {
        'id1': id1, 'id2': id2,
        'name1': name1, 'name2': name2,
        'refined_min_dist_km': round(min_dist, 4),
        'refined_tca': refined_tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
    }


# ── Co-Location Persistence Classifier ──────────────────────────────────────
def classify_colocation(distance_history):
    """
    Analyze a pair's distance timeseries across the full propagation window.

    Returns:
        'COLOCATED'   – separation stays flat near zero (structural/docked)
        'CONJUNCTION' – genuine closing-then-opening pattern
    """
    arr = np.array(distance_history)
    if len(arr) < 10:
        return 'CONJUNCTION'  # not enough data to judge

    mean_d = np.mean(arr)
    std_d = np.std(arr)
    range_d = np.max(arr) - np.min(arr)

    # Co-located: mean near zero, very low variance, no significant range swing
    # Structural pairs stay within ~0.01 km of each other at all times
    if mean_d < 0.05 and std_d < 0.02 and range_d < 0.1:
        return 'COLOCATED'

    # Even if mean is low, if there's a clear closing/opening swing, it's real
    if range_d > 0.5:
        return 'CONJUNCTION'

    # Borderline: small mean but some variance — could be a slow drift
    # Use coefficient of variation: if std/mean > 0.5, there's real dynamics
    if mean_d > 0.001 and std_d / mean_d > 0.5:
        return 'CONJUNCTION'

    # Default: if mean < 0.1 and range < 0.5, likely co-located
    if mean_d < 0.1:
        return 'COLOCATED'

    return 'CONJUNCTION'


# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    from sgp4.api import Satrec, WGS84, jday

    NUM_WORKERS = os.cpu_count() or 4
    TIGHT_THRESHOLD_KM = 10.0
    COLOCATION_CHECK_THRESHOLD = 0.1  # km — check persistence for pairs < this
    TIME_BUDGET_MINUTES = 20.0

    print(f"CPU cores detected: {NUM_WORKERS}")
    print(f"Stage 3 threshold: {TIGHT_THRESHOLD_KM} km")
    print(f"Co-location check threshold: {COLOCATION_CHECK_THRESHOLD} km")

    # ── Load TLE data ────────────────────────────────────────────────────────
    tle_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            '..', 'data', 'cache', 'active_tles.json')
    tle_path = os.path.normpath(tle_path)
    with open(tle_path) as f:
        tle_data = json.load(f)
    tle_lookup = {}
    for rec in tle_data:
        nid = rec['NORAD_CAT_ID']
        if nid not in tle_lookup:
            tle_lookup[nid] = rec

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

    # ── 24h KD-tree screening with distance history for tight pairs ──────────
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from spatial_index import load_satellites, propagate_all, find_close_approaches

    print("\n[Phase 1] Running 24h KD-tree screening...")
    t_screen_start = time.perf_counter()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    satrecs, norad_ids, names = load_satellites()

    WINDOW_HOURS = 24
    TIMESTEP_SECONDS = 60
    SCREEN_THRESHOLD = 50.0

    active_events = {}
    finished_events = []
    # Track per-timestep distance for pairs that ever dip below co-location check threshold
    distance_histories = defaultdict(list)  # pair_key → [(step, dist), ...]

    total_steps = int((WINDOW_HOURS * 3600) / TIMESTEP_SECONDS)

    for step in range(total_steps):
        target_time = now + timedelta(seconds=step * TIMESTEP_SECONDS)
        jd_val, fr_val = jday(target_time.year, target_time.month, target_time.day,
                              target_time.hour, target_time.minute,
                              target_time.second + target_time.microsecond * 1e-6)
        coords, valid_indices = propagate_all(satrecs, jd_val, fr_val)
        approaches = find_close_approaches(coords, valid_indices, norad_ids,
                                           threshold_km=SCREEN_THRESHOLD)

        for orig_i, orig_j, dist in approaches:
            id1, id2 = norad_ids[orig_i], norad_ids[orig_j]
            name1, name2 = names[orig_i], names[orig_j]
            pair_key = (min(id1, id2), max(id1, id2))

            # Always record distance for pairs that are very tight
            if dist < COLOCATION_CHECK_THRESHOLD:
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

    t_screen_end = time.perf_counter()
    print(f"  Screening complete in {t_screen_end - t_screen_start:.1f}s")
    print(f"  Total merged events: {len(sorted_all)}")

    # ── Phase 2: Co-Location Classification ──────────────────────────────────
    print(f"\n[Phase 2] Co-location persistence analysis...")
    print(f"  Pairs with min_dist < {COLOCATION_CHECK_THRESHOLD} km: {len(distance_histories)}")

    colocated_pairs = {}    # pair_key → event (logged, not discarded)
    genuine_conjunctions = []
    method_disagreements = []

    for ev in sorted_all:
        pair_key = (ev['id1'], ev['id2'])

        if ev['min_dist'] < COLOCATION_CHECK_THRESHOLD and pair_key in distance_histories:
            history = distance_histories[pair_key]
            persistence_verdict = classify_colocation(history)
            known_verdict_colocated = is_known_colocated(ev['id1'], ev['id2'])

            # Check for method disagreement
            if persistence_verdict == 'COLOCATED' and not known_verdict_colocated:
                method_disagreements.append({
                    'pair': pair_key,
                    'name1': ev['name1'], 'name2': ev['name2'],
                    'persistence': 'COLOCATED',
                    'known_list': 'NOT_IN_LIST',
                    'mean_dist': float(np.mean(history)),
                    'std_dist': float(np.std(history)),
                    'samples': len(history),
                })
            elif persistence_verdict == 'CONJUNCTION' and known_verdict_colocated:
                method_disagreements.append({
                    'pair': pair_key,
                    'name1': ev['name1'], 'name2': ev['name2'],
                    'persistence': 'CONJUNCTION',
                    'known_list': 'IN_KNOWN_GROUP',
                    'mean_dist': float(np.mean(history)),
                    'std_dist': float(np.std(history)),
                    'samples': len(history),
                })

            if persistence_verdict == 'COLOCATED':
                ev['classification'] = 'COLOCATED/STRUCTURAL'
                ev['persistence_stats'] = {
                    'mean_km': round(float(np.mean(history)), 6),
                    'std_km': round(float(np.std(history)), 6),
                    'range_km': round(float(np.max(history) - np.min(history)), 6),
                    'samples': len(history),
                }
                colocated_pairs[pair_key] = ev
            else:
                ev['classification'] = 'GENUINE_CONJUNCTION'
                genuine_conjunctions.append(ev)
        else:
            ev['classification'] = 'GENUINE_CONJUNCTION'
            genuine_conjunctions.append(ev)

    print(f"\n  ── Co-Location Filter Results ──")
    print(f"  Co-located/structural pairs excluded: {len(colocated_pairs)}")
    print(f"  Genuine conjunction candidates remaining: {len(genuine_conjunctions)}")

    if colocated_pairs:
        print(f"\n  Co-located pairs (logged, not discarded):")
        for pk, ev in sorted(colocated_pairs.items(), key=lambda x: x[1]['min_dist']):
            stats = ev['persistence_stats']
            known = "✓ KNOWN" if is_known_colocated(ev['id1'], ev['id2']) else "  NEW"
            print(f"    {known} [{ev['id1']}] {ev['name1']} <-> [{ev['id2']}] {ev['name2']}")
            print(f"         mean={stats['mean_km']:.4f}km  std={stats['std_km']:.4f}km  "
                  f"range={stats['range_km']:.4f}km  samples={stats['samples']}")

    if method_disagreements:
        print(f"\n  ⚠ METHOD DISAGREEMENTS ({len(method_disagreements)} — review manually):")
        for md in method_disagreements:
            print(f"    [{md['pair'][0]}] {md['name1']} <-> [{md['pair'][1]}] {md['name2']}")
            print(f"      Persistence says: {md['persistence']}  |  Known list says: {md['known_list']}")
            print(f"      mean={md['mean_dist']:.4f}km  std={md['std_dist']:.4f}km  samples={md['samples']}")

    # ── Phase 3: Apply threshold filter to genuine conjunctions only ─────────
    MAX_CANDIDATES = 200
    candidates = [e for e in genuine_conjunctions if e['min_dist'] <= TIGHT_THRESHOLD_KM]
    if len(candidates) < MAX_CANDIDATES:
        # Fill up to MAX_CANDIDATES from the sorted genuine list
        genuine_sorted = sorted(genuine_conjunctions, key=lambda e: e['min_dist'])
        candidates = genuine_sorted[:max(MAX_CANDIDATES, len(candidates))]
    candidate_count = len(candidates)

    print(f"\n[Phase 3] Stage 3 refinement candidates (after co-location filter):")
    print(f"  Threshold: {TIGHT_THRESHOLD_KM} km")
    print(f"  Candidates: {candidate_count}")

    # ── Prepare pair data for workers ────────────────────────────────────────
    pair_data_list = []
    skipped = 0
    for ev in candidates:
        rec1 = tle_lookup.get(ev['id1'])
        rec2 = tle_lookup.get(ev['id2'])
        if not rec1 or not rec2:
            skipped += 1
            continue
        sat1 = make_satrec(rec1)
        sat2 = make_satrec(rec2)
        tca = ev['tca']
        jd_t, fr_t = jday(tca.year, tca.month, tca.day,
                          tca.hour, tca.minute,
                          tca.second + tca.microsecond * 1e-6)
        e1, r1, v1 = sat1.sgp4(jd_t, fr_t)
        e2, r2, v2 = sat2.sgp4(jd_t, fr_t)
        if e1 != 0 or e2 != 0:
            skipped += 1
            continue
        pair_data_list.append((
            ev['id1'], ev['id2'], ev['name1'], ev['name2'],
            np.array(r1), np.array(v1), np.array(r2), np.array(v2),
            tca.isoformat()
        ))

    print(f"  Valid pairs for integration: {len(pair_data_list)} (skipped {skipped})")

    # ── Full production run with ProcessPoolExecutor ─────────────────────────
    print(f"\n[Phase 4] Launching FULL production run with {NUM_WORKERS} workers...")
    t_prod_start = time.perf_counter()

    results = []
    completed = 0
    with ProcessPoolExecutor(max_workers=NUM_WORKERS) as pool:
        futures = {pool.submit(refine_pair, pd): pd for pd in pair_data_list}
        for future in as_completed(futures):
            results.append(future.result())
            completed += 1
            if completed % 500 == 0:
                elapsed = time.perf_counter() - t_prod_start
                rate = completed / elapsed
                eta = (len(pair_data_list) - completed) / rate if rate > 0 else 0
                print(f"    Progress: {completed}/{len(pair_data_list)} "
                      f"({elapsed:.1f}s elapsed, ETA {eta:.0f}s)")

    t_prod_end = time.perf_counter()
    total_wall = t_prod_end - t_prod_start

    # ── Final Report ─────────────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f" PRODUCTION RUN COMPLETE")
    print(f"{'='*70}")
    print(f"  Total pairs refined: {len(results)}")
    print(f"  Wall-clock time: {total_wall:.1f}s ({total_wall/60:.1f} min)")
    print(f"  Throughput: {len(results)/total_wall:.1f} pairs/sec")

    # Sort by refined distance
    results_sorted = sorted(results, key=lambda x: x['refined_min_dist_km'])

    print(f"\n  Top 25 closest refined conjunctions:")
    for i, r in enumerate(results_sorted[:25]):
        print(f"    {i+1:3d}. [{r['id1']}] {r['name1']} <-> [{r['id2']}] {r['name2']}")
        print(f"         Refined Dist: {r['refined_min_dist_km']:.4f} km  "
              f"TCA: {r['refined_tca']}")

    # Summary stats
    dists = [r['refined_min_dist_km'] for r in results]
    print(f"\n  Distance distribution (refined):")
    print(f"    Min:    {min(dists):.4f} km")
    print(f"    Max:    {max(dists):.4f} km")
    print(f"    Mean:   {np.mean(dists):.4f} km")
    print(f"    Median: {np.median(dists):.4f} km")
    print(f"    <1km:   {sum(1 for d in dists if d < 1.0)}")
    print(f"    <5km:   {sum(1 for d in dists if d < 5.0)}")
    print(f"    <10km:  {sum(1 for d in dists if d < 10.0)}")
