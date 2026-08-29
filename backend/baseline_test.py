import asyncio
import time
import numpy as np
from app.core.fetch_data import fetch_latest_tles
from app.core.stage4_pc import run_stage4_full_pipeline

def run_baseline():
    print("Running Baseline Deterministic Test...")
    tle_data, changed_ids, dataset_version = fetch_latest_tles()
    
    # Take a small deterministic fixture subset of TLEs to simulate an environment.
    # Let's say top 2000 objects.
    fixture_tles = tle_data[:2000]
    # We must patch the fetch to return only this fixture, or we just pass the fixture?
    # No, run_stage4_full_pipeline reads active_tles.json. We can mock it or just let it run on the 16000 objects.
    
    print(f"Total Objects Ingested: {len(tle_data)}")
    start = time.time()
    
    # Run pipeline
    bt, results, screening_time, stage3_time = run_stage4_full_pipeline(
        max_refine_candidates=250, 
        f107=150.0, 
        ap=15.0,
        changed_ids=None
    )
    
    print(f"Screening Time: {screening_time:.2f} s")
    print(f"Stage 3 Runtime: {stage3_time:.2f} s")
    print(f"Total Candidates Returned: {len(results)}")
    
    for r in results:
        pass # we can count failed propagations, etc.

if __name__ == "__main__":
    run_baseline()
