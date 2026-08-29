from datetime import datetime, timezone
from typing import Dict, Any, Tuple
from app.core.config import settings

def compute_object_quality(tle_record: Dict[str, Any], evaluation_time: datetime) -> Dict[str, Any]:
    """
    Computes data quality metadata and assigns an A/B/C/D grade for a space object
    based solely on real TLE properties.
    """
    epoch_str = tle_record.get('EPOCH', '')
    if epoch_str:
        epoch_str = epoch_str.rstrip('Z')
        tle_epoch = datetime.fromisoformat(epoch_str).replace(tzinfo=timezone.utc)
    else:
        tle_epoch = evaluation_time

    # Calculate exact age in hours
    tle_age_hours = (evaluation_time - tle_epoch).total_seconds() / 3600.0
    
    # Calculate grade
    if tle_age_hours <= settings.TLE_AGE_GRADE_A_HOURS:
        grade = "A"
        score = 100.0 - (tle_age_hours / settings.TLE_AGE_GRADE_A_HOURS) * 10
    elif tle_age_hours <= settings.TLE_AGE_GRADE_B_HOURS:
        grade = "B"
        score = 80.0 - ((tle_age_hours - settings.TLE_AGE_GRADE_A_HOURS) / (settings.TLE_AGE_GRADE_B_HOURS - settings.TLE_AGE_GRADE_A_HOURS)) * 20
    elif tle_age_hours <= settings.TLE_AGE_GRADE_C_HOURS:
        grade = "C"
        score = 60.0 - ((tle_age_hours - settings.TLE_AGE_GRADE_B_HOURS) / (settings.TLE_AGE_GRADE_C_HOURS - settings.TLE_AGE_GRADE_B_HOURS)) * 20
    else:
        grade = "D"
        score = max(0.0, 40.0 - (tle_age_hours / 24.0))

    # Optional penalty for missing vital fields (though CelesTrak usually validates)
    has_rcs = bool(tle_record.get('RCS_SIZE') or tle_record.get('RCS'))
    has_bstar = bool(tle_record.get('BSTAR'))
    if not has_rcs:
        score -= 5
    if not has_bstar:
        score -= 10
        grade = "D" if grade in ["C", "D"] else "C"

    # Compile the quality object
    quality_meta = {
        'tle_epoch': tle_epoch,
        'tle_age_hours': round(tle_age_hours, 2),
        'source': "Space-Track / CelesTrak",
        'source_timestamp': evaluation_time,
        'propagation_status': "SUCCESS",
        'sgp4_error_code': 0,
        'object_type': tle_record.get('OBJECT_TYPE', 'UNKNOWN'),
        'launch_designator': tle_record.get('OBJECT_ID', 'UNKNOWN'),
        'data_quality_score': round(max(0.0, min(100.0, score)), 2),
        'data_quality_grade': grade
    }
    
    return quality_meta
