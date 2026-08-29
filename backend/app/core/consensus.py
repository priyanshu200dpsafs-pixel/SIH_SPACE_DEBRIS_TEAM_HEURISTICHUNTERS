"""
Multi-Model Propagation Consensus Engine

Compares independent analytical (SGP4) and high-order numerical (DOP853)
orbital propagations to evaluate model consistency for high-priority conjunctions.

NOTE: This layer produces diagnostic / consistency metrics and encounter geometry
divergences. It does NOT invent or output an artificial probability.
"""

import math
import numpy as np
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, List, Tuple
from sgp4.api import Satrec, jday


@dataclass
class PropagationResult:
    """Standardized single-object propagation state and metadata interface."""
    position_km: List[float]
    velocity_km_s: List[float]
    timestamp_utc: str
    propagator_name: str
    integration_status: str
    numerical_metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class PropagatorEncounterSummary:
    """Conjunction encounter metrics produced by a specific propagator."""
    propagator_name: str
    tca_utc: str
    tca_timestamp: datetime
    miss_distance_km: float
    relative_speed_km_s: float
    relative_position_km: List[float]
    relative_velocity_km_s: List[float]
    state_1: PropagationResult
    state_2: PropagationResult

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d['tca_timestamp'] = self.tca_timestamp.isoformat()
        return d


@dataclass
class ModelConsensusEvaluation:
    """Full diagnostic comparison between independent propagation models."""
    model_agreement_score: float  # 0.0 to 100.0 diagnostic score
    consensus_status: str         # HIGH_AGREEMENT, MODERATE_AGREEMENT, HIGH_DIVERGENCE
    requires_scrutiny: bool       # True if models diverge materially
    delta_tca_seconds: float
    delta_miss_distance_km: float
    delta_relative_speed_km_s: float
    max_trajectory_separation_km: float
    relative_velocity_angle_deg: float
    sgp4_summary: Dict[str, Any]
    numerical_summary: Dict[str, Any]
    diagnostic_notes: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def evaluate_sgp4_fine_encounter(
    sat1: Satrec,
    sat2: Satrec,
    rough_tca: datetime,
    search_window_sec: float = 600.0,
    time_step_sec: float = 1.0
) -> Optional[PropagatorEncounterSummary]:
    """
    Independently propagates SGP4 in fine steps around rough TCA to find
    the exact analytical minimum distance, TCA, and state vectors.
    """
    half_window = search_window_sec / 2.0
    start_time = rough_tca - timedelta(seconds=half_window)
    num_steps = int(search_window_sec / time_step_sec) + 1

    min_dist = float('inf')
    best_time = rough_tca
    best_r1, best_v1 = None, None
    best_r2, best_v2 = None, None

    for i in range(num_steps):
        t_curr = start_time + timedelta(seconds=i * time_step_sec)
        jd, fr = jday(t_curr.year, t_curr.month, t_curr.day,
                      t_curr.hour, t_curr.minute,
                      t_curr.second + t_curr.microsecond * 1e-6)
        
        e1, r1, v1 = sat1.sgp4(jd, fr)
        e2, r2, v2 = sat2.sgp4(jd, fr)

        if e1 != 0 or e2 != 0:
            continue

        r1_arr = np.array(r1)
        r2_arr = np.array(r2)
        dist = float(np.linalg.norm(r1_arr - r2_arr))

        if dist < min_dist:
            min_dist = dist
            best_time = t_curr
            best_r1 = r1_arr
            best_v1 = np.array(v1)
            best_r2 = r2_arr
            best_v2 = np.array(v2)

    if best_r1 is None or best_r2 is None:
        return None

    # Parabolic sub-second interpolation around best_time if possible
    rel_pos = (best_r1 - best_r2).tolist()
    rel_vel = (best_v1 - best_v2).tolist()
    rel_speed = float(np.linalg.norm(best_v1 - best_v2))

    state_1 = PropagationResult(
        position_km=best_r1.tolist(),
        velocity_km_s=best_v1.tolist(),
        timestamp_utc=best_time.strftime('%Y-%m-%d %H:%M:%S UTC'),
        propagator_name="SGP4",
        integration_status="SUCCESS",
        numerical_metadata={"error_code_1": int(getattr(sat1, 'error', 0)), "step_size_sec": time_step_sec}
    )

    state_2 = PropagationResult(
        position_km=best_r2.tolist(),
        velocity_km_s=best_v2.tolist(),
        timestamp_utc=best_time.strftime('%Y-%m-%d %H:%M:%S UTC'),
        propagator_name="SGP4",
        integration_status="SUCCESS",
        numerical_metadata={"error_code_2": int(getattr(sat2, 'error', 0)), "step_size_sec": time_step_sec}
    )

    return PropagatorEncounterSummary(
        propagator_name="SGP4 Analytical",
        tca_utc=best_time.strftime('%Y-%m-%d %H:%M:%S UTC'),
        tca_timestamp=best_time,
        miss_distance_km=round(min_dist, 4),
        relative_speed_km_s=round(rel_speed, 4),
        relative_position_km=[round(x, 4) for x in rel_pos],
        relative_velocity_km_s=[round(x, 4) for x in rel_vel],
        state_1=state_1,
        state_2=state_2
    )


def compare_propagation_models(
    sgp4_encounter: PropagatorEncounterSummary,
    numerical_encounter: PropagatorEncounterSummary,
    tca_tol_high_sec: float = 3.0,
    tca_tol_mod_sec: float = 15.0,
    dist_tol_high_km: float = 0.25,
    dist_tol_mod_km: float = 1.5
) -> ModelConsensusEvaluation:
    """
    Compares the independent analytical SGP4 encounter and numerical (DOP853)
    encounter to derive consensus metrics and diagnostic agreement grades.
    """
    # 1. Delta TCA in seconds
    delta_tca = abs((numerical_encounter.tca_timestamp - sgp4_encounter.tca_timestamp).total_seconds())

    # 2. Delta Miss Distance in km
    delta_dist = abs(numerical_encounter.miss_distance_km - sgp4_encounter.miss_distance_km)

    # 3. Delta Relative Speed in km/s
    delta_speed = abs(numerical_encounter.relative_speed_km_s - sgp4_encounter.relative_speed_km_s)

    # 4. Trajectory separation at TCA (km)
    r1_num = np.array(numerical_encounter.state_1.position_km)
    r1_sgp4 = np.array(sgp4_encounter.state_1.position_km)
    r2_num = np.array(numerical_encounter.state_2.position_km)
    r2_sgp4 = np.array(sgp4_encounter.state_2.position_km)

    sep_obj1 = float(np.linalg.norm(r1_num - r1_sgp4))
    sep_obj2 = float(np.linalg.norm(r2_num - r2_sgp4))
    max_sep = max(sep_obj1, sep_obj2)

    # 5. Encounter angle difference (angle between relative velocity vectors)
    v_rel_num = np.array(numerical_encounter.relative_velocity_km_s)
    v_rel_sgp4 = np.array(sgp4_encounter.relative_velocity_km_s)

    norm_num = np.linalg.norm(v_rel_num)
    norm_sgp4 = np.linalg.norm(v_rel_sgp4)
    if norm_num > 1e-6 and norm_sgp4 > 1e-6:
        dot_product = np.clip(np.dot(v_rel_num, v_rel_sgp4) / (norm_num * norm_sgp4), -1.0, 1.0)
        angle_deg = float(np.degrees(np.arccos(dot_product)))
    else:
        angle_deg = 0.0

    # 6. Model Agreement Score (Continuous diagnostic score 0.0 - 100.0)
    # Smooth exponential decay based on TCA delta (half-life ~10s) and Range delta (half-life ~1km)
    score_tca = 100.0 * math.exp(-delta_tca / 10.0)
    score_range = 100.0 * math.exp(-delta_dist / 1.0)
    agreement_score = round(max(0.0, min(100.0, 0.5 * score_tca + 0.5 * score_range)), 2)

    # 7. Consensus Classification & Scrutiny Flag
    if delta_tca <= tca_tol_high_sec and delta_dist <= dist_tol_high_km:
        consensus_status = "HIGH_AGREEMENT"
        requires_scrutiny = False
        notes = f"Analytical SGP4 and numerical DOP853 agree closely (ΔTCA={delta_tca:.2f}s, ΔRange={delta_dist*1000:.1f}m)."
    elif delta_tca <= tca_tol_mod_sec and delta_dist <= dist_tol_mod_km:
        consensus_status = "MODERATE_AGREEMENT"
        requires_scrutiny = False
        notes = f"Moderate perturbation variance between models (ΔTCA={delta_tca:.2f}s, ΔRange={delta_dist*1000:.1f}m). Standard operational margin applies."
    else:
        consensus_status = "HIGH_DIVERGENCE"
        requires_scrutiny = True
        notes = f"Material divergence detected between models (ΔTCA={delta_tca:.2f}s, ΔRange={delta_dist*1000:.1f}m). Flight director scrutiny recommended."

    return ModelConsensusEvaluation(
        model_agreement_score=agreement_score,
        consensus_status=consensus_status,
        requires_scrutiny=requires_scrutiny,
        delta_tca_seconds=round(delta_tca, 3),
        delta_miss_distance_km=round(delta_dist, 4),
        delta_relative_speed_km_s=round(delta_speed, 4),
        max_trajectory_separation_km=round(max_sep, 4),
        relative_velocity_angle_deg=round(angle_deg, 3),
        sgp4_summary={
            "tca": sgp4_encounter.tca_utc,
            "miss_distance_km": sgp4_encounter.miss_distance_km,
            "relative_speed_km_s": sgp4_encounter.relative_speed_km_s,
            "propagator": sgp4_encounter.propagator_name
        },
        numerical_summary={
            "tca": numerical_encounter.tca_utc,
            "miss_distance_km": numerical_encounter.miss_distance_km,
            "relative_speed_km_s": numerical_encounter.relative_speed_km_s,
            "propagator": numerical_encounter.propagator_name
        },
        diagnostic_notes=notes
    )
