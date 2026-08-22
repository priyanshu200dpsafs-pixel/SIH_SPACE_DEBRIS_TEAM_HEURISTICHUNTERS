import json
import os
import time
import math
import numpy as np
from datetime import datetime, timedelta
from collections import defaultdict
from sgp4.api import Satrec, WGS84, jday
from scipy.spatial import cKDTree
import statistics

def load_satellites():
    file_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        "data", "cache", "active_tles.json"
    )
    with open(file_path, 'r') as f:
        data = json.load(f)
        
    satrecs = []
    norad_ids = []
    names = []
    seen_ids = set()
    
    deg2rad = math.pi / 180.0
    rev2radmin = (2 * math.pi) / 1440.0
    rev2radmin2 = (2 * math.pi) / (1440.0 * 1440.0)
    rev2radmin3 = (2 * math.pi) / (1440.0 ** 3)
    base_epoch = datetime(1949, 12, 31)
    
    for record in data:
        norad_id = record.get('NORAD_CAT_ID')
        if norad_id in seen_ids:
            continue
            
        try:
            sat = Satrec()
            dt_str = record['EPOCH']
            if dt_str.endswith('Z'): dt_str = dt_str[:-1]
            dt = datetime.fromisoformat(dt_str)
            epoch_days = (dt - base_epoch).total_seconds() / 86400.0
            
            sat.sgp4init(
                WGS84, 'i', norad_id, epoch_days,
                record.get('BSTAR', 0.0),
                record.get('MEAN_MOTION_DOT', 0.0) * rev2radmin2,
                record.get('MEAN_MOTION_DDOT', 0.0) * rev2radmin3,
                record.get('ECCENTRICITY', 0.0),
                record.get('ARG_OF_PERICENTER', 0.0) * deg2rad,
                record.get('INCLINATION', 0.0) * deg2rad,
                record.get('MEAN_ANOMALY', 0.0) * deg2rad,
                record.get('MEAN_MOTION', 0.0) * rev2radmin,
                record.get('RA_OF_ASC_NODE', 0.0) * deg2rad
            )
            satrecs.append(sat)
            norad_ids.append(norad_id)
            names.append(record.get('OBJECT_NAME', f'Unknown-{norad_id}'))
            seen_ids.add(norad_id)
        except Exception:
            pass
            
    return satrecs, norad_ids, names

def propagate_all(satrecs, target_jd, target_fr):
    coords = []
    valid_indices = []
    for idx, sat in enumerate(satrecs):
        e, r, v = sat.sgp4(target_jd, target_fr)
        if e == 0:
            coords.append(r)
            valid_indices.append(idx)
    if len(coords) == 0:
        return np.array([]), []
    return np.array(coords), valid_indices

def find_close_approaches(coords, valid_indices, norad_ids, threshold_km=50.0):
    if len(coords) == 0:
        return []
    tree = cKDTree(coords)
    pairs = tree.query_pairs(r=threshold_km)
    
    results = []
    for i, j in pairs:
        if i != j:
            dist = np.linalg.norm(coords[i] - coords[j])
            orig_i, orig_j = valid_indices[i], valid_indices[j]
            id1, id2 = norad_ids[orig_i], norad_ids[orig_j]
            if id1 > id2:
                orig_i, orig_j = orig_j, orig_i
            results.append((orig_i, orig_j, dist))
    return results

if __name__ == "__main__":
    WINDOW_HOURS = 24
    TIMESTEP_SECONDS = 60
    THRESHOLD_KM = 50.0
    now = datetime.utcnow()
    t0 = time.perf_counter()
    
    print("Loading satellites...")
    satrecs, norad_ids, names = load_satellites()
    
    active_events = {}
    finished_events = []
    raw_flags_count = 0
    
    total_steps = int((WINDOW_HOURS * 3600) / TIMESTEP_SECONDS)
    print(f"Simulating {WINDOW_HOURS} hours at {TIMESTEP_SECONDS}s intervals ({total_steps} steps)...")
    
    for step in range(total_steps):
        target_time = now + timedelta(seconds=step * TIMESTEP_SECONDS)
        jd, fr = jday(target_time.year, target_time.month, target_time.day, 
                      target_time.hour, target_time.minute, 
                      target_time.second + target_time.microsecond * 1e-6)
        coords, valid_indices = propagate_all(satrecs, jd, fr)
        
        approaches = find_close_approaches(coords, valid_indices, norad_ids, threshold_km=THRESHOLD_KM)
        
        current_step_pairs = set()
        for orig_i, orig_j, dist in approaches:
            raw_flags_count += 1
            id1, id2 = norad_ids[orig_i], norad_ids[orig_j]
            name1, name2 = names[orig_i], names[orig_j]
            pair_key = (id1, id2)
            current_step_pairs.add(pair_key)
            
            if pair_key not in active_events:
                active_events[pair_key] = {
                    'id1': id1, 'id2': id2, 'name1': name1, 'name2': name2,
                    'min_dist': dist, 'tca': target_time,
                    'start_time': target_time, 'end_time': target_time,
                    'last_seen_step': step
                }
            else:
                event = active_events[pair_key]
                event['end_time'] = target_time
                event['last_seen_step'] = step
                if dist < event['min_dist']:
                    event['min_dist'] = dist
                    event['tca'] = target_time
                    
        ended_keys = [k for k, v in active_events.items() if v['last_seen_step'] < step]
        for k in ended_keys:
            finished_events.append(active_events.pop(k))
            
    finished_events.extend(active_events.values())
    t1 = time.perf_counter()
    
    print("\n--- Simulation Complete ---")
    print(f"Total RAW (pair, timestep) flags: {raw_flags_count}")
    print(f"Total MERGED candidate events: {len(finished_events)}")
    print(f"Execution Time: {(t1 - t0):.2f} seconds")
    
    if finished_events:
        distances = [e['min_dist'] for e in finished_events]
        exact_dups = defaultdict(int)
        for d in distances:
            exact_dups[round(d, 2)] += 1
            
        print("\n--- Distance Distribution Stats ---")
        print(f"Min: {min(distances):.2f} km")
        print(f"Max: {max(distances):.2f} km")
        print(f"Mean: {statistics.mean(distances):.2f} km")
        print(f"Median: {statistics.median(distances):.2f} km")
        dup_count = sum(1 for v, c in exact_dups.items() if c > 1)
        print(f"Number of exact-duplicate distance values (to 2 decimals): {dup_count}")
        
        print("\nTop 5 most common distances:")
        for v, c in sorted(exact_dups.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"  {v:.2f} km appeared {c} times")

    # --- Tighter Pre-Filter for Stage 3 ---
    MAX_CANDIDATES = 200
    TIGHT_THRESHOLD_KM = 10.0
    
    print("\n--- Applying Tighter Pre-Filter for Stage 3 ---")
    print(f"Configured to pass Top {MAX_CANDIDATES} or any event under {TIGHT_THRESHOLD_KM} km.")
    
    sorted_events = sorted(finished_events, key=lambda e: e['min_dist'])
    pre_filtered_events = []
    
    for i, event in enumerate(sorted_events):
        if i < MAX_CANDIDATES or event['min_dist'] <= TIGHT_THRESHOLD_KM:
            pre_filtered_events.append(event)
        else:
            break
            
    print(f"Pre-filtered Candidates for Stage 3: {len(pre_filtered_events)}")
