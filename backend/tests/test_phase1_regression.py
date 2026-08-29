import pytest
import os
import json
from unittest.mock import patch
from app.core.stage4_pc import run_stage4_full_pipeline

def test_golden_catalog_filtering_classification():
    """
    Phase 1 & Phase 2 Regression Test:
    Ensures that structural, formation, and same-launch pairs are explicitly 
    classified and preserved with metadata, rather than silently discarded.
    """
    golden_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'golden_catalog.json')
    
    import builtins
    original_open = builtins.open
    
    # Mock the JSON open to return the golden catalog instead of active_tles.json
    def mock_open_golden(file, *args, **kwargs):
        if 'active_tles.json' in str(file):
            return original_open(golden_path, *args, **kwargs)
        return original_open(file, *args, **kwargs)
        
    with patch('builtins.open', mock_open_golden):
        # We need to run the pipeline. Since it's a small catalog (6 objects), it runs instantly.
        # It's important we pass changed_ids=None to trigger a full run.
        # We mock settings so CONSENSUS_ENABLED=False to speed up test if needed,
        # but the default pipeline handles it.
        bt, results, screening_time, stage3_time = run_stage4_full_pipeline(max_refine_candidates=250)
        
        # We should have exactly 3 events generated (3 pairs).
        # We need to find our 3 specific pairs in the results array.
        pair_classifications = {}
        for r in results:
            pair_key = tuple(sorted([r['id1'], r['id2']]))
            pair_classifications[pair_key] = r.get('uncertainty_explanation', '')
            
        # 1. Structural/Docked (ISS 25544 & Crew Dragon 67796)
        iss_dragon = tuple(sorted([25544, 67796]))
        assert iss_dragon in pair_classifications, "ISS/Dragon pair missed by screening"
        assert "STRUCTURALLY ATTACHED / DOCKED" in pair_classifications[iss_dragon]
        
        # 2. Known Formation (TerraSAR-X 31698 & TanDEM-X 36605)
        tandem = tuple(sorted([31698, 36605]))
        assert tandem in pair_classifications, "TerraSAR-X/TanDEM-X missed by screening"
        assert "KNOWN DESIGNED FORMATION" in pair_classifications[tandem]
        
        # 3. Same Launch (Starlink-A 99990 & Starlink-B 99991)
        starlink = tuple(sorted([99990, 99991]))
        assert starlink in pair_classifications, "Starlink siblings missed by screening"
        assert "SAME-LAUNCH / SEPARATING" in pair_classifications[starlink]
        
        # Additionally, verify that for excluded events, the numerical calculations were skipped
        # and safely zeroed out.
        for r in results:
            if r['id1'] in [25544, 67796]: # ISS pair
                assert r['pc'] == 0.0
                assert r['propagation_model'] == "SGP4 (Filtered)"
                assert r['consensus_status'] == "SKIPPED"
