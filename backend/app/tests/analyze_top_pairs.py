"""
Extended persistence analysis on the top 20 closest-approach pairs.
Checks for formation-flying/constellation patterns at ANY separation distance,
not just near-zero.
"""
import json
import os
import math
import numpy as np
from datetime import datetime, timedelta, timezone
from sgp4.api import Satrec, WGS84, jday

# ── Load TLE data ────────────────────────────────────────────────────────────
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

# ── Top 25 pairs from the production run (by refined min distance) ───────────
TOP_PAIRS = [
    (67363, 67366, "LEMUR-2 FIKRETDENGIZ", "LEMUR-2 CALLUM-K-J"),
    (64919, 68324, "STARLINK-34599", "STARLINK-37164"),
    (55957, 55960, "STARLINK-5884", "STARLINK-5938"),
    (62079, 62080, "SUPERVIEW NEO-2 03", "SUPERVIEW NEO-2 04"),
    (49071, 49072, "TIANHUI 2-02A", "TIANHUI 2-02B"),
    (55593, 56525, "STARLINK-5703", "STARLINK-6329"),
    (100360, 100361, "GUOWANG 24 OBJECT E", "GUOWANG 24 OBJECT F"),
    (52871, 64099, "STARLINK-4207", "STARLINK-34074"),
    (56153, 56154, "PIESAT A", "PIESAT B"),
    (65930, 69946, "STARLINK-35513", "STARLINK-37905"),
    (58979, 69185, "STARLINK-31380", "STARLINK-37237"),
    (31698, 36605, "TERRASAR-X", "TANDEM-X"),
    (56155, 56156, "PIESAT C", "PIESAT D"),
    (56153, 56156, "PIESAT A", "PIESAT D"),
    (59922, 66576, "STARLINK-31872", "STARLINK-35814"),
    (53402, 64683, "STARLINK-4499", "STARLINK-34550"),
    (56154, 56156, "PIESAT B", "PIESAT D"),
    (59297, 67925, "STARLINK-31487", "STARLINK-36726"),
    (69885, 69889, "GRUS-3A", "ICEYE-X81"),
    (64750, 68083, "STARLINK-34531", "STARLINK-37065"),
]

# ── Propagate each pair across full 24h window at 60s resolution ─────────────
now = datetime.now(timezone.utc).replace(tzinfo=None)
WINDOW_HOURS = 24
TIMESTEP_SECONDS = 60
total_steps = int((WINDOW_HOURS * 3600) / TIMESTEP_SECONDS)

print(f"Analyzing {len(TOP_PAIRS)} pairs across {WINDOW_HOURS}h at {TIMESTEP_SECONDS}s resolution")
print(f"({total_steps} timesteps per pair)\n")

formation_pairs = []
transient_pairs = []

for id1, id2, name1, name2 in TOP_PAIRS:
    rec1 = tle_lookup.get(id1)
    rec2 = tle_lookup.get(id2)
    if not rec1 or not rec2:
        print(f"  SKIP [{id1}] {name1} <-> [{id2}] {name2}: TLE not found")
        continue

    sat1 = make_satrec(rec1)
    sat2 = make_satrec(rec2)

    distances = []
    times = []
    for step in range(total_steps):
        t = now + timedelta(seconds=step * TIMESTEP_SECONDS)
        jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute,
                      t.second + t.microsecond * 1e-6)
        e1, r1, _ = sat1.sgp4(jd, fr)
        e2, r2, _ = sat2.sgp4(jd, fr)
        if e1 == 0 and e2 == 0:
            d = np.linalg.norm(np.array(r1) - np.array(r2))
            distances.append(d)
            times.append(step * TIMESTEP_SECONDS / 3600.0)  # hours

    if not distances:
        print(f"  SKIP [{id1}] {name1} <-> [{id2}] {name2}: propagation failed")
        continue

    arr = np.array(distances)
    mean_d = np.mean(arr)
    std_d = np.std(arr)
    min_d = np.min(arr)
    max_d = np.max(arr)
    range_d = max_d - min_d
    cv = std_d / mean_d if mean_d > 0.001 else 0.0  # coefficient of variation

    # Find the index of min distance for TCA
    min_idx = np.argmin(arr)
    tca_hours = times[min_idx]

    # Classify using multiple criteria:
    # 1. Coefficient of variation (CV): formation pairs have CV < 0.3
    #    (std is less than 30% of mean — separation is "steady")
    # 2. Range relative to mean: formation pairs have range/mean < 0.5
    # 3. Duration at close range: formation pairs spend >80% of window within
    #    2x their minimum distance
    pct_within_2x_min = np.sum(arr < 2 * min_d) / len(arr) * 100

    is_formation = False
    reasons = []

    if cv < 0.3:
        is_formation = True
        reasons.append(f"CV={cv:.3f} < 0.3 (low variance relative to mean)")
    if mean_d > 0.001 and range_d / mean_d < 0.5:
        is_formation = True
        reasons.append(f"range/mean={range_d/mean_d:.3f} < 0.5 (narrow oscillation)")
    if pct_within_2x_min > 80:
        is_formation = True
        reasons.append(f"{pct_within_2x_min:.0f}% of window within 2x min dist")

    # Override: if range is very large (>50% of mean or >5km absolute),
    # it's likely a genuine transient pass even if CV seems low
    if range_d > 5.0:
        is_formation = False
        reasons = [f"range={range_d:.2f}km too large for formation"]
    if cv > 0.5:
        is_formation = False
        reasons = [f"CV={cv:.3f} > 0.5 (high variance = transient event)"]

    classification = "FORMATION/CONSTELLATION" if is_formation else "TRANSIENT CONJUNCTION"

    print(f"  [{id1}] {name1} <-> [{id2}] {name2}")
    print(f"    Classification: {classification}")
    print(f"    mean={mean_d:.4f}km  std={std_d:.4f}km  min={min_d:.4f}km  max={max_d:.4f}km")
    print(f"    range={range_d:.4f}km  CV={cv:.3f}  %within2xMin={pct_within_2x_min:.0f}%")
    print(f"    Reasons: {'; '.join(reasons)}")

    # Describe the shape
    # Check if there's a clear V-shape: distance decreases then increases
    first_quarter = np.mean(arr[:len(arr)//4])
    middle = np.mean(arr[len(arr)//4:3*len(arr)//4])
    last_quarter = np.mean(arr[3*len(arr)//4:])
    if first_quarter > middle < last_quarter and (first_quarter - middle) > 0.5 * mean_d:
        print(f"    Shape: V-PATTERN (approach-then-recede)")
    elif std_d < 0.1 * mean_d:
        print(f"    Shape: FLAT (constant separation)")
    else:
        print(f"    Shape: OSCILLATING (periodic variation)")
    print()

    entry = {
        'id1': id1, 'id2': id2, 'name1': name1, 'name2': name2,
        'min_dist': min_d, 'mean_dist': mean_d, 'std': std_d,
        'range': range_d, 'cv': cv, 'tca_hours': tca_hours,
        'classification': classification,
    }
    if is_formation:
        formation_pairs.append(entry)
    else:
        transient_pairs.append(entry)

# ── Final re-ranked list ─────────────────────────────────────────────────────
print(f"\n{'='*70}")
print(f" FINAL CLASSIFICATION SUMMARY")
print(f"{'='*70}")
print(f"\n  Formation/Constellation pairs (excluded from danger list): {len(formation_pairs)}")
for p in sorted(formation_pairs, key=lambda x: x['min_dist']):
    print(f"    [{p['id1']}] {p['name1']} <-> [{p['id2']}] {p['name2']}")
    print(f"      min={p['min_dist']:.4f}km  mean={p['mean_dist']:.4f}km  "
          f"std={p['std']:.4f}km  CV={p['cv']:.3f}")

print(f"\n  Genuine transient conjunctions (TRUE danger list): {len(transient_pairs)}")
for i, p in enumerate(sorted(transient_pairs, key=lambda x: x['min_dist'])):
    tca_dt = now + timedelta(hours=p['tca_hours'])
    print(f"    {i+1}. [{p['id1']}] {p['name1']} <-> [{p['id2']}] {p['name2']}")
    print(f"       Min Dist: {p['min_dist']:.4f} km ({p['min_dist']*1000:.1f} m)")
    print(f"       TCA: ~{tca_dt.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"       CV={p['cv']:.3f}  range={p['range']:.2f}km")
