import math

def calculate_optimal_cam(target_miss_distance_m: float, time_to_tca_s: float, mean_motion_rad_s: float) -> dict:
    """
    Calculate the optimal deterministic Collision Avoidance Maneuver (CAM)
    using the Clohessy-Wiltshire (Hill's) relative motion approximation.
    
    Equations:
    delta_y (along-track) = -3 * delta_v * time_to_tca_s
    delta_x (radial) = (2 * delta_v / n) * (1 - cos(n * t))
    """
    if time_to_tca_s <= 0:
        return {
            "required_delta_v_m_s": 0.0,
            "radial_deviation_m": 0.0,
            "along_track_deviation_m": 0.0,
            "time_to_tca_s": 0.0
        }

    # Required delta_v to achieve the along-track target distance
    # A positive delta_v (thrusting forward) increases semi-major axis,
    # decreasing orbital speed, leading to a negative along-track drift relative to the original state.
    required_delta_v_m_s = target_miss_distance_m / (-3.0 * time_to_tca_s)
    
    # Radial deviation caused by this burn at TCA
    radial_deviation_m = (2.0 * required_delta_v_m_s / mean_motion_rad_s) * (1.0 - math.cos(mean_motion_rad_s * time_to_tca_s))
    
    # By definition, the along-track deviation achieved is the target miss distance
    along_track_deviation_m = target_miss_distance_m
    
    return {
        "required_delta_v_m_s": required_delta_v_m_s,
        "radial_deviation_m": radial_deviation_m,
        "along_track_deviation_m": along_track_deviation_m,
        "time_to_tca_s": time_to_tca_s
    }
