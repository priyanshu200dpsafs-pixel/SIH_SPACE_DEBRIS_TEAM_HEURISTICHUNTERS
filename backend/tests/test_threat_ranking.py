from app.core.threat_ranking import calculate_operational_threat_score
from datetime import datetime, timedelta, timezone

def test_identical_inputs_deterministic():
    tca = datetime.now(timezone.utc) + timedelta(hours=24)
    data = {
        "pc": 1e-4,
        "tca": tca,
        "min_dist_km": 1.0,
        "relative_speed_km_s": 14.0,
        "hbr_m": 10.0,
        "data_quality_score": 0.9
    }
    score1 = calculate_operational_threat_score(data)
    score2 = calculate_operational_threat_score(data)
    assert score1["threat_score"] == score2["threat_score"]
    assert score1["risk_category"] == score2["risk_category"]

def test_higher_pc_higher_score():
    tca = datetime.now(timezone.utc) + timedelta(hours=24)
    data_low = {
        "pc": 1e-7,
        "tca": tca,
        "min_dist_km": 1.0,
        "relative_speed_km_s": 14.0,
        "hbr_m": 10.0,
        "data_quality_score": 0.9
    }
    data_high = {**data_low, "pc": 1e-4}
    
    score_low = calculate_operational_threat_score(data_low)
    score_high = calculate_operational_threat_score(data_high)
    
    assert score_high["threat_score"] > score_low["threat_score"]

def test_urgency_factor():
    data_far = {
        "pc": 1e-5,
        "tca": datetime.now(timezone.utc) + timedelta(hours=70),
        "min_dist_km": 1.0,
        "relative_speed_km_s": 14.0,
        "hbr_m": 10.0,
        "data_quality_score": 0.9
    }
    data_near = {**data_far, "tca": datetime.now(timezone.utc) + timedelta(hours=10)}
    
    score_far = calculate_operational_threat_score(data_far)
    score_near = calculate_operational_threat_score(data_near)
    
    assert score_near["threat_score"] > score_far["threat_score"]
