import pytest
import numpy as np
from datetime import datetime, timezone
from app.core.whatif_sandbox import get_rtn_matrix, simulate_maneuver_landscape

def test_get_rtn_matrix():
    """
    Test the RTN (Radial, Transverse, Normal) to ECI transformation matrix.
    """
    r_vec = np.array([10000.0, 0.0, 0.0])
    v_vec = np.array([0.0, 7.0, 0.0])
    M = get_rtn_matrix(r_vec, v_vec)
    np.testing.assert_array_almost_equal(M[:, 0], [1, 0, 0])
    np.testing.assert_array_almost_equal(M[:, 2], [0, 0, 1])
    np.testing.assert_array_almost_equal(M[:, 1], [0, 1, 0])
    dv_rtn = np.array([0.0, 1.0, 0.0])
    dv_eci = M @ dv_rtn
    np.testing.assert_array_almost_equal(dv_eci, [0.0, 1.0, 0.0])

def test_rtn_matrix_inclined():
    """
    Test RTN matrix for an inclined orbit.
    """
    r_vec = np.array([0.0, 10000.0, 0.0])
    v_vec = np.array([-7.0, 0.0, 7.0])
    M = get_rtn_matrix(r_vec, v_vec)
    np.testing.assert_array_almost_equal(M[:, 0], [0, 1, 0])
    val = 1.0 / np.sqrt(2)
    np.testing.assert_array_almost_equal(M[:, 2], [val, 0, val])
    np.testing.assert_array_almost_equal(M[:, 1], [-val, 0, val])

def test_robustness_grid_generation(mocker):
    import concurrent.futures
    mocker.patch('app.core.whatif_sandbox.ProcessPoolExecutor', concurrent.futures.ThreadPoolExecutor)
    mock_sim = mocker.patch('app.core.whatif_sandbox.simulate_maneuver')
    def side_effect(*args, **kwargs):
        dv_t = kwargs['dv_rtn_m_s'][1]
        pc = 1e-4 if dv_t < 0 else 1e-6
        sec = [] if dv_t > -1 else [{"norad_id": 99999}]
        return {
            'scenario': {'pc': pc},
            'secondary_risks': sec
        }
    mock_sim.side_effect = side_effect
    
    tle_lookup = {
        25544: {},
        48274: {}
    }
    
    res = simulate_maneuver_landscape(
        target_id=25544,
        secondary_id=48274,
        tca_original=datetime(2026, 8, 27, tzinfo=timezone.utc),
        dv_radial_m_s=0.0,
        dv_normal_m_s=0.0,
        center_dv_transverse_m_s=0.0,
        span_dv_transverse_m_s=2.0,
        center_hours=2.0,
        span_hours=1.0,
        resolution=3,
        tle_lookup=tle_lookup,
        current_pc=5e-5
    )
    
    for cell in res['grid']:
        if not cell.get('success'):
            print("ERROR IN CELL:", cell)
        assert cell['success'] is True
        
    for cell in res['grid']:
        if cell['dv_transverse'] < -1.0:
            assert cell['status'] == 'UNSTABLE_SECONDARY'
            assert cell['has_secondary_risk'] is True
        elif cell['dv_transverse'] < 0.0:
            assert cell['status'] == 'UNSTABLE_PRIMARY_INCREASE'
        else:
            assert cell['status'] == 'ROBUST_SAFE'

    assert res['best_candidate']['status'] == 'ROBUST_SAFE'
    assert res['best_candidate']['primary_pc'] == 1e-6
