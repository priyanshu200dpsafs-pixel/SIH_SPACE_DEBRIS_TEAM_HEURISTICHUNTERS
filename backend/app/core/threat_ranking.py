import os
import json
import math
from datetime import datetime, timezone
from typing import Dict, Any

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "threat_config.json")

def load_threat_config() -> Dict[str, Any]:
    with open(_CONFIG_PATH, "r") as f:
        return json.load(f)

def _normalize_log(value: float, min_val: float, max_val: float) -> float:
    """Normalize a value on a log scale between 0 and 1."""
    if value <= min_val:
        return 0.0
    if value >= max_val:
        return 1.0
    
    log_val = math.log10(value)
    log_min = math.log10(min_val)
    log_max = math.log10(max_val)
    
    return (log_val - log_min) / (log_max - log_min)

def _normalize_linear(value: float, min_val: float, max_val: float, invert: bool = False) -> float:
    """Normalize a value linearly between 0 and 1."""
    if invert:
        # e.g., for miss distance, smaller is worse (higher score)
        if value <= min_val:
            return 1.0
        if value >= max_val:
            return 0.0
        return 1.0 - ((value - min_val) / (max_val - min_val))
    else:
        if value <= min_val:
            return 0.0
        if value >= max_val:
            return 1.0
        return (value - min_val) / (max_val - min_val)

def get_risk_category(score: float) -> str:
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "ELEVATED"
    return "LOW"

def calculate_operational_threat_score(conjunction_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculates the operational threat score based on the current configuration.
    Expects conjunction_data to be a dict with:
    - pc (float)
    - tca (datetime or str)
    - min_dist_km (float)
    - relative_speed_km_s (float)
    - hbr_m (float)
    - data_quality_score (float, optional) 0.0 to 1.0
    """
    config = load_threat_config()
    weights = config["weights"]
    norms = config["normalization"]
    
    # 1. Pc Score (Log scaled)
    pc = conjunction_data.get("pc", 0.0)
    pc_score = _normalize_log(pc, norms["pc_min_threshold"], norms["pc_max_threshold"])
    
    # 2. Urgency Score (Linear, inverted)
    tca_val = conjunction_data.get("tca")
    if isinstance(tca_val, str):
        tca = datetime.fromisoformat(tca_val.replace("Z", "+00:00"))
    else:
        tca = tca_val
    
    now = datetime.now(timezone.utc)
    hours_to_tca = max(0.0, (tca - now).total_seconds() / 3600.0)
    urgency_score = _normalize_linear(hours_to_tca, norms["urgency_max_hours"], norms["urgency_min_hours"], invert=True)
    
    # 3. Miss Distance Score (Linear, inverted)
    miss_dist = conjunction_data.get("min_dist_km", norms["miss_distance_max_km"])
    miss_score = _normalize_linear(miss_dist, norms["miss_distance_max_km"], norms["miss_distance_min_km"], invert=True)
    
    # 4. Kinetic Energy Proxy (Relative Velocity + HBR)
    rel_vel = conjunction_data.get("relative_speed_km_s", 0.0)
    hbr = conjunction_data.get("hbr_m", 0.0)
    
    vel_score = _normalize_linear(rel_vel, norms["velocity_min_km_s"], norms["velocity_max_km_s"])
    hbr_score = _normalize_linear(hbr, norms["hbr_min_m"], norms["hbr_max_m"])
    kinetic_score = (vel_score + hbr_score) / 2.0
    
    # 5. Data Quality (Penalty if low)
    # Assume 1.0 is perfect quality. If lower, it subtracts from the score (or acts as uncertainty).
    dq = conjunction_data.get("data_quality_score", 1.0) # default perfect
    # Convert DQ to a penalty/bonus. E.g. lower DQ means higher uncertainty -> slightly higher operational priority to investigate
    dq_score = 1.0 - dq
    
    # Combine with weights
    raw_score = (
        pc_score * weights["pc"] +
        urgency_score * weights["urgency"] +
        miss_score * weights["miss_distance"] +
        kinetic_score * weights["kinetic_energy"] +
        dq_score * weights["data_quality"]
    )
    
    # Normalize to 100
    final_score = raw_score * 100.0
    
    # Calculate % contribution of each factor to the final score for the explanation
    total_weighted = raw_score if raw_score > 0 else 1.0 # avoid div by zero
    
    factors = {
        "pc": round(((pc_score * weights["pc"]) / total_weighted) * 100, 1),
        "urgency": round(((urgency_score * weights["urgency"]) / total_weighted) * 100, 1),
        "miss_distance": round(((miss_score * weights["miss_distance"]) / total_weighted) * 100, 1),
        "kinetic_energy": round(((kinetic_score * weights["kinetic_energy"]) / total_weighted) * 100, 1),
        "data_quality_uncertainty": round(((dq_score * weights["data_quality"]) / total_weighted) * 100, 1),
    }
    
    return {
        "threat_score": round(final_score, 2),
        "risk_category": get_risk_category(final_score),
        "threat_factors": factors,
        "threat_version": config["version"]
    }
