"""
Deterministic Unit Tests for Multi-Model Propagation Consensus Layer.
Compatible with standard unittest and pytest.
"""

import unittest
import math
from datetime import datetime, timezone, timedelta
from app.core.consensus import (
    PropagationResult,
    PropagatorEncounterSummary,
    ModelConsensusEvaluation,
    compare_propagation_models,
    evaluate_sgp4_fine_encounter
)
from sgp4.api import Satrec, WGS84, jday


class TestPropagationConsensus(unittest.TestCase):

    def setUp(self):
        self.base_timestamp = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
        r1 = [6878.137, 0.0, 0.0]
        v1 = [0.0, 7.6, 0.0]
        r2 = [6878.500, 0.1, 0.0]
        v2 = [0.0, 7.59, 0.05]

        self.state1 = PropagationResult(
            position_km=r1,
            velocity_km_s=v1,
            timestamp_utc=self.base_timestamp.strftime('%Y-%m-%d %H:%M:%S UTC'),
            propagator_name="SGP4",
            integration_status="SUCCESS",
            numerical_metadata={"error_code": 0}
        )
        self.state2 = PropagationResult(
            position_km=r2,
            velocity_km_s=v2,
            timestamp_utc=self.base_timestamp.strftime('%Y-%m-%d %H:%M:%S UTC'),
            propagator_name="SGP4",
            integration_status="SUCCESS",
            numerical_metadata={"error_code": 0}
        )

    def test_propagation_result_interface(self):
        d = self.state1.to_dict()
        self.assertEqual(d['propagator_name'], "SGP4")
        self.assertEqual(len(d['position_km']), 3)
        self.assertEqual(len(d['velocity_km_s']), 3)
        self.assertEqual(d['integration_status'], "SUCCESS")
        self.assertIn("error_code", d['numerical_metadata'])

    def test_consensus_high_agreement_deterministic(self):
        sgp4_encounter = PropagatorEncounterSummary(
            propagator_name="SGP4 Analytical",
            tca_utc=self.base_timestamp.strftime('%Y-%m-%d %H:%M:%S UTC'),
            tca_timestamp=self.base_timestamp,
            miss_distance_km=0.3800,
            relative_speed_km_s=10.2500,
            relative_position_km=[0.363, 0.100, 0.0],
            relative_velocity_km_s=[0.0, 0.010, -0.050],
            state_1=self.state1,
            state_2=self.state2
        )

        # Minor delta (ΔTCA = 0.5s, ΔRange = 0.02km)
        num_tca = self.base_timestamp + timedelta(seconds=0.5)
        num_encounter = PropagatorEncounterSummary(
            propagator_name="DOP853 High-Order Numerical",
            tca_utc=num_tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
            tca_timestamp=num_tca,
            miss_distance_km=0.4000,
            relative_speed_km_s=10.2520,
            relative_position_km=[0.380, 0.105, 0.0],
            relative_velocity_km_s=[0.0, 0.010, -0.051],
            state_1=self.state1,
            state_2=self.state2
        )

        eval_res = compare_propagation_models(
            sgp4_encounter,
            num_encounter,
            tca_tol_high_sec=3.0,
            tca_tol_mod_sec=15.0,
            dist_tol_high_km=0.25,
            dist_tol_mod_km=1.5
        )

        self.assertEqual(eval_res.consensus_status, "HIGH_AGREEMENT")
        self.assertFalse(eval_res.requires_scrutiny)
        self.assertEqual(eval_res.delta_tca_seconds, 0.5)
        self.assertAlmostEqual(eval_res.delta_miss_distance_km, 0.02, places=3)
        self.assertGreaterEqual(eval_res.model_agreement_score, 90.0)

    def test_consensus_moderate_agreement_deterministic(self):
        sgp4_encounter = PropagatorEncounterSummary(
            propagator_name="SGP4 Analytical",
            tca_utc=self.base_timestamp.strftime('%Y-%m-%d %H:%M:%S UTC'),
            tca_timestamp=self.base_timestamp,
            miss_distance_km=0.5000,
            relative_speed_km_s=8.0000,
            relative_position_km=[0.5, 0.0, 0.0],
            relative_velocity_km_s=[0.0, 8.0, 0.0],
            state_1=self.state1,
            state_2=self.state2
        )

        # Moderate delta (ΔTCA = 6.0s, ΔRange = 0.6km)
        num_tca = self.base_timestamp + timedelta(seconds=6.0)
        num_encounter = PropagatorEncounterSummary(
            propagator_name="DOP853 High-Order Numerical",
            tca_utc=num_tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
            tca_timestamp=num_tca,
            miss_distance_km=1.1000,
            relative_speed_km_s=7.9800,
            relative_position_km=[1.1, 0.0, 0.0],
            relative_velocity_km_s=[0.0, 7.98, 0.0],
            state_1=self.state1,
            state_2=self.state2
        )

        eval_res = compare_propagation_models(
            sgp4_encounter,
            num_encounter,
            tca_tol_high_sec=3.0,
            tca_tol_mod_sec=15.0,
            dist_tol_high_km=0.25,
            dist_tol_mod_km=1.5
        )

        self.assertEqual(eval_res.consensus_status, "MODERATE_AGREEMENT")
        self.assertFalse(eval_res.requires_scrutiny)
        self.assertEqual(eval_res.delta_tca_seconds, 6.0)
        self.assertAlmostEqual(eval_res.delta_miss_distance_km, 0.6, places=3)
        self.assertTrue(40.0 <= eval_res.model_agreement_score < 90.0)

    def test_consensus_high_divergence_scrutiny_deterministic(self):
        sgp4_encounter = PropagatorEncounterSummary(
            propagator_name="SGP4 Analytical",
            tca_utc=self.base_timestamp.strftime('%Y-%m-%d %H:%M:%S UTC'),
            tca_timestamp=self.base_timestamp,
            miss_distance_km=0.2000,
            relative_speed_km_s=11.0000,
            relative_position_km=[0.2, 0.0, 0.0],
            relative_velocity_km_s=[0.0, 11.0, 0.0],
            state_1=self.state1,
            state_2=self.state2
        )

        # Material divergence (ΔTCA = 25.0s, ΔRange = 4.0km)
        num_tca = self.base_timestamp + timedelta(seconds=25.0)
        num_encounter = PropagatorEncounterSummary(
            propagator_name="DOP853 High-Order Numerical",
            tca_utc=num_tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
            tca_timestamp=num_tca,
            miss_distance_km=4.2000,
            relative_speed_km_s=10.5000,
            relative_position_km=[4.2, 0.0, 0.0],
            relative_velocity_km_s=[0.0, 10.5, 0.0],
            state_1=self.state1,
            state_2=self.state2
        )

        eval_res = compare_propagation_models(
            sgp4_encounter,
            num_encounter,
            tca_tol_high_sec=3.0,
            tca_tol_mod_sec=15.0,
            dist_tol_high_km=0.25,
            dist_tol_mod_km=1.5
        )

        self.assertEqual(eval_res.consensus_status, "HIGH_DIVERGENCE")
        self.assertTrue(eval_res.requires_scrutiny)
        self.assertEqual(eval_res.delta_tca_seconds, 25.0)
        self.assertAlmostEqual(eval_res.delta_miss_distance_km, 4.0, places=3)
        self.assertLess(eval_res.model_agreement_score, 40.0)
        self.assertIn("Material divergence detected", eval_res.diagnostic_notes)

    def test_fine_sgp4_encounter_search_deterministic(self):
        sat1 = Satrec()
        sat2 = Satrec()
        epoch_days = 27950.0

        sat1.sgp4init(WGS84, 'i', 10001, epoch_days, 0.0001, 0.0, 0.0, 0.001, 0.0, 1.57, 0.0, 0.065, 0.0)
        sat2.sgp4init(WGS84, 'i', 10002, epoch_days, 0.0001, 0.0, 0.0, 0.001, 0.0, 1.57, math.pi, 0.065, 0.0)

        summary = evaluate_sgp4_fine_encounter(sat1, sat2, self.base_timestamp, search_window_sec=60.0, time_step_sec=5.0)
        self.assertIsNotNone(summary)
        self.assertEqual(summary.propagator_name, "SGP4 Analytical")
        self.assertGreaterEqual(summary.miss_distance_km, 0.0)
        self.assertGreaterEqual(summary.relative_speed_km_s, 0.0)
        self.assertEqual(summary.state_1.propagator_name, "SGP4")
        self.assertEqual(summary.state_2.propagator_name, "SGP4")


if __name__ == '__main__':
    unittest.main()
