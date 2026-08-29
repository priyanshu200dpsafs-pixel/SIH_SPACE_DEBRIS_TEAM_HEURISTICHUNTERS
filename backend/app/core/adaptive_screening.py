import numpy as np
from datetime import datetime, timedelta
from typing import Tuple
from sgp4.api import jday
from app.core.config import settings

def _sgp4_grid_search(sat1, sat2, start_time: datetime, end_time: datetime, step_s: float) -> Tuple[datetime, float]:
    """
    Performs a linear grid search using SGP4 between start_time and end_time,
    returning the time and distance of closest approach.
    """
    t = start_time
    min_dist = float('inf')
    tca = start_time
    
    # Calculate total steps to avoid floating point timedelta accumulation drift
    total_seconds = (end_time - start_time).total_seconds()
    num_steps = max(1, int(total_seconds / step_s) + 1)
    
    for i in range(num_steps):
        current_t = start_time + timedelta(seconds=i * step_s)
        jd, fr = jday(current_t.year, current_t.month, current_t.day, 
                      current_t.hour, current_t.minute, 
                      current_t.second + current_t.microsecond * 1e-6)
        e1, r1, _ = sat1.sgp4(jd, fr)
        e2, r2, _ = sat2.sgp4(jd, fr)
        
        if e1 == 0 and e2 == 0:
            dist = float(np.linalg.norm(np.array(r1) - np.array(r2)))
            if dist < min_dist:
                min_dist = dist
                tca = current_t
                
    return tca, min_dist

def adaptive_sgp4_refinement(sat1, sat2, coarse_start: datetime, coarse_end: datetime) -> Tuple[datetime, float]:
    """
    Applies adaptive temporal resolution to precisely find the TCA and minimum distance.
    Uses progressively finer steps if the distance crosses specified thresholds.
    """
    # 1. We know the event fell into the <50km band during the coarse (60s) scan.
    # To catch fast-moving objects that might have been at their closest *between* coarse steps,
    # we expand the search window by one coarse step on both sides.
    window_start = coarse_start - timedelta(seconds=settings.SCREENING_COARSE_STEP_S)
    window_end = coarse_end + timedelta(seconds=settings.SCREENING_COARSE_STEP_S)
    
    # Grid 1: Finer Step (e.g. 10s)
    tca_finer, dist_finer = _sgp4_grid_search(sat1, sat2, window_start, window_end, settings.SCREENING_FINER_STEP_S)
    
    if dist_finer > settings.SCREENING_FINER_THRESHOLD_KM:
        return tca_finer, dist_finer
        
    # 2. It entered the <20km band. Switch to Very Fine Step (e.g. 1s).
    # We only need to search within +/- FINER_STEP_S of the finer TCA.
    window2_start = tca_finer - timedelta(seconds=settings.SCREENING_FINER_STEP_S)
    window2_end = tca_finer + timedelta(seconds=settings.SCREENING_FINER_STEP_S)
    
    tca_vf, dist_vf = _sgp4_grid_search(sat1, sat2, window2_start, window2_end, settings.SCREENING_VERY_FINE_STEP_S)
    
    if dist_vf > settings.SCREENING_VERY_FINE_THRESHOLD_KM:
        return tca_vf, dist_vf
        
    # 3. It entered the <5km band. Switch to Ultra Fine Step (0.1s) to see if it drops <1km.
    # We search within +/- VERY_FINE_STEP_S of the very fine TCA.
    window3_start = tca_vf - timedelta(seconds=settings.SCREENING_VERY_FINE_STEP_S)
    window3_end = tca_vf + timedelta(seconds=settings.SCREENING_VERY_FINE_STEP_S)
    
    tca_final, dist_final = _sgp4_grid_search(sat1, sat2, window3_start, window3_end, 0.1)
    
    return tca_final, dist_final
