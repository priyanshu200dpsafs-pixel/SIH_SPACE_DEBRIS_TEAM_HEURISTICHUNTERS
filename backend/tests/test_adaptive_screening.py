import pytest
from datetime import datetime, timedelta
import numpy as np
from sgp4.api import Satrec, WGS84

from app.core.adaptive_screening import _sgp4_grid_search, adaptive_sgp4_refinement
from app.core.config import settings

def create_dummy_satrec(inclination_deg=50.0, raan_deg=0.0):
    sat = Satrec()
    sat.sgp4init(
        WGS84, 'i', 12345, 0.0,
        0.0, 0.0, 0.0, 0.0,
        0.0, inclination_deg * np.pi / 180.0, 0.0,
        15.0 * 2 * np.pi / 1440.0, raan_deg * np.pi / 180.0
    )
    return sat

def test_sgp4_grid_search():
    sat1 = create_dummy_satrec(50.0, 0.0)
    sat2 = create_dummy_satrec(50.0, 10.0)
    
    t_start = datetime(2025, 1, 1, 0, 0, 0)
    t_end = t_start + timedelta(seconds=60)
    
    tca, min_dist = _sgp4_grid_search(sat1, sat2, t_start, t_end, 10.0)
    assert tca >= t_start
    assert tca <= t_end
    assert min_dist > 0

def test_adaptive_sgp4_refinement():
    sat1 = create_dummy_satrec(50.0, 0.0)
    sat2 = create_dummy_satrec(50.0, 0.1) # very close orbit
    
    # Simulate a coarse event found between t0 and t1
    t0 = datetime(2025, 1, 1, 0, 0, 0)
    t1 = t0 + timedelta(seconds=60)
    
    # The adaptive refinement expands the window by COARSE_STEP
    tca, dist = adaptive_sgp4_refinement(sat1, sat2, t0, t1)
    
    # Should successfully execute and return valid numbers
    assert dist > 0
    
    # Max possible expansion is coarse + finer + very_fine
    max_expansion = settings.SCREENING_COARSE_STEP_S + settings.SCREENING_FINER_STEP_S + settings.SCREENING_VERY_FINE_STEP_S
    assert tca >= t0 - timedelta(seconds=max_expansion)
    assert tca <= t1 + timedelta(seconds=max_expansion)
