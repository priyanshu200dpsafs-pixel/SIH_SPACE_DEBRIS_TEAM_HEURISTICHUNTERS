import os
import sys
import time
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from sgp4.api import jday

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.spatial_index import load_satellites, propagate_all, find_close_approaches
from app.core.adaptive_screening import adaptive_sgp4_refinement
from app.core.config import settings

def run_benchmark():
    print("=== Conjunction Screening Benchmark ===")
    
    # 1. Setup
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    WINDOW_HOURS = 2
    TIMESTEP_SECONDS = settings.SCREENING_COARSE_STEP_S
    SCREEN_THRESHOLD = settings.SCREENING_COARSE_THRESHOLD_KM
    
    print(f"Loading satellites...")
    satrecs, norad_ids, names = load_satellites()
    id_to_sat = {nid: sat for nid, sat in zip(norad_ids, satrecs)}
    
    # 2. KD-Tree Screening (Phase 1)
    active_events = {}
    finished_events = []
    
    total_steps = int((WINDOW_HOURS * 3600) / TIMESTEP_SECONDS)
    
    print(f"\n[1] Running KD-Tree Screening ({WINDOW_HOURS}h, step={TIMESTEP_SECONDS}s, thresh={SCREEN_THRESHOLD}km)")
    t_kd_start = time.perf_counter()
    
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
    
    t_kd_end = time.perf_counter()
    print(f"  KD-Tree Time: {t_kd_end - t_kd_start:.2f}s")
    print(f"  Raw KD-Tree Candidate Events: {len(sorted_all)}")
    
    old_stage3_count = len([e for e in sorted_all if e['min_dist'] < 10.0])
    print(f"  Candidates < 10.0km (OLD Stage-3 Handoff) WITHOUT adaptive: {old_stage3_count}")
    
    # 3. Adaptive Temporal Refinement (Phase 1.5)
    print(f"\n[2] Running Adaptive SGP4 Refinement")
    t_adapt_start = time.perf_counter()
    
    refined_count = 0
    refined_events = []
    
    for ev in sorted_all:
        sat1 = id_to_sat.get(ev['id1'])
        sat2 = id_to_sat.get(ev['id2'])
        if sat1 and sat2:
            tca_ref, dist_ref = adaptive_sgp4_refinement(sat1, sat2, ev['start_time'], ev['end_time'])
            ev['tca'] = tca_ref
            ev['min_dist'] = dist_ref
            refined_count += 1
            refined_events.append(ev)
            
    t_adapt_end = time.perf_counter()
    print(f"  Adaptive Refinement Time: {t_adapt_end - t_adapt_start:.2f}s")
    
    new_stage3_count = len([e for e in refined_events if e['min_dist'] < settings.SCREENING_STAGE3_HANDOFF_KM])
    print(f"  Candidates < {settings.SCREENING_STAGE3_HANDOFF_KM}km (NEW Stage-3 Handoff) WITH adaptive: {new_stage3_count}")
    
    print("\n=== Benchmark Summary ===")
    print(f"  Stage-3 integrations avoided: {old_stage3_count - new_stage3_count} candidates")
    print(f"  Total pipeline time saved (est): ~{(old_stage3_count - new_stage3_count) * 1.5:.1f}s (assuming 1.5s per DOP853 run)")
    
    # Also let's find out how many <1.0km we MISSED before
    old_strict_count = len([e for e in sorted_all if e['min_dist'] < settings.SCREENING_STAGE3_HANDOFF_KM])
    missed = new_stage3_count - old_strict_count
    print(f"  Coverage Improvement: Found {missed} high-speed <1.0km events that were visually missed by the 60s coarse step!")

if __name__ == "__main__":
    run_benchmark()
