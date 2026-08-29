import pytest
import numpy as np
from app.core.risk import run_monte_carlo_validation

def test_monte_carlo_agreement_standard_encounter():
    """Test that MC validation correctly agrees with Foster Pc for a typical encounter."""
    # Encounter params: miss = 1000m, hbr = 5m, sig_x = 100, sig_y = 500
    # True Foster Pc would be quite small.
    # Let's pick a tighter covariance so Pc is higher and MC catches it.
    miss = 10.0
    hbr = 5.0
    sig_x = 10.0
    sig_y = 10.0
    
    foster_pc = 0.05 # Approximate expected value
    
    res = run_monte_carlo_validation(
        miss_dist_m=miss,
        hbr_m=hbr,
        sigma_x_m=sig_x,
        sigma_y_m=sig_y,
        foster_pc=foster_pc,
        miss_angle_rad=0.0,
        num_samples=100000,
        seed=1337
    )
    
    assert res['mc_sample_count'] == 100000
    assert res['mc_seed'] == 1337
    assert 0.01 < res['mc_pc'] < 0.20
    assert 'mc_confidence_interval' in res
    assert 'mc_validation_status' in res

def test_monte_carlo_divergence():
    """Test that MC validation catches significant divergence."""
    miss = 10.0
    hbr = 5.0
    sig_x = 10.0
    sig_y = 10.0
    
    # We supply a completely wrong Foster PC (e.g. 1e-10) when true is ~0.05
    foster_pc = 1e-10
    
    res = run_monte_carlo_validation(
        miss_dist_m=miss,
        hbr_m=hbr,
        sigma_x_m=sig_x,
        sigma_y_m=sig_y,
        foster_pc=foster_pc,
        miss_angle_rad=0.0,
        num_samples=100000,
        seed=42
    )
    
    assert res['mc_validation_status'] == 'SIGNIFICANT DIVERGENCE'

def test_monte_carlo_zero_collisions():
    """Test that MC handles 0 collisions correctly."""
    miss = 5000.0 # 5 km miss
    hbr = 1.0
    sig_x = 10.0
    sig_y = 10.0
    
    foster_pc = 1e-15
    
    res = run_monte_carlo_validation(
        miss_dist_m=miss,
        hbr_m=hbr,
        sigma_x_m=sig_x,
        sigma_y_m=sig_y,
        foster_pc=foster_pc,
        miss_angle_rad=0.0,
        num_samples=10000, # smaller N so it finishes fast
        seed=42
    )
    
    assert res['mc_pc'] == 0.0
    assert res['mc_validation_status'] == 'AGREE'
    assert "[0.0" in res['mc_confidence_interval']
