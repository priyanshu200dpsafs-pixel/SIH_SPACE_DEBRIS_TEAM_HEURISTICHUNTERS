import pytest
import numpy as np
from app.core.spatial_index import find_close_approaches

def test_incremental_kd_tree_screening():
    # Create 100 random coordinates in a 100x100x100 box
    np.random.seed(42)
    coords = np.random.uniform(-50, 50, (100, 3))
    vels = np.zeros_like(coords) # Mock zero velocities
    valid_indices = list(range(100))
    norad_ids = [1000 + i for i in range(100)]
    
    # 1. Run FULL screening
    full_pairs = find_close_approaches(coords, vels, valid_indices, norad_ids, threshold_km=25.0)
    full_pairs_set = { (p[0], p[1]) for p in full_pairs }
    
    # 2. Simulate 5 changed objects
    changed_indices = {10, 20, 30, 40, 50}
    
    incremental_pairs = find_close_approaches(coords, vels, valid_indices, norad_ids, threshold_km=25.0, changed_indices_set=changed_indices)
    incremental_pairs_set = { (p[0], p[1]) for p in incremental_pairs }
    
    # 3. What pairs SHOULD the incremental screening have found?
    # It should find all pairs in full_pairs_set where at least one object is in changed_indices
    expected_incremental_pairs = {
        (i, j) for (i, j) in full_pairs_set
        if i in changed_indices or j in changed_indices
    }
    
    assert incremental_pairs_set == expected_incremental_pairs
    assert len(incremental_pairs_set) > 0 # Ensure we actually tested something
    print(f"Full pairs: {len(full_pairs_set)}")
    print(f"Incremental pairs: {len(incremental_pairs_set)}")
    print(f"Expected pairs: {len(expected_incremental_pairs)}")
