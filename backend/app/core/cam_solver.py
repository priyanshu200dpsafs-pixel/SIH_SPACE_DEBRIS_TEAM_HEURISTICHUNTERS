import math

def calculate_optimal_cam(
    target_miss_distance_m: float, 
    time_to_tca_s: float, 
    mean_motion_rad_s: float,
    current_miss_distance_m: float = 289.0,
    current_pc: float = 4.9e-6,
    relative_speed_km_s: float = 12.8
) -> dict:
    if time_to_tca_s <= 0:
        return {
            "delta_v_m_s": 0.0,
            "direction": "IN-TRACK (PROGRADE)",
            "post_cam_miss_distance_m": current_miss_distance_m,
            "fuel_mass_kg": 0.0,
            "burn_duration_s": 0.0,
            "post_cam_pc": current_pc,
            "pre_cam_miss_m": current_miss_distance_m,
            "relative_speed_km_s": relative_speed_km_s
        }

    additional_miss_needed = max(0.0, target_miss_distance_m - current_miss_distance_m)
    
    if additional_miss_needed == 0:
        dv = 0.0
    else:
        # Approximate required delta_v using simple in-track drift
        # Actual CW requires dv ≈ miss / (2 * t)
        dv = additional_miss_needed / (2.0 * time_to_tca_s)
        
    spacecraft_mass = 500.0  # kg
    isp = 300.0  # s
    g0 = 9.80665
    fuel_mass = spacecraft_mass * (1.0 - math.exp(-dv / (isp * g0)))
    
    sigma = current_miss_distance_m * 2
    post_pc = math.exp(-0.5 * (target_miss_distance_m / sigma) ** 2) * current_pc
    if post_pc < 1e-15:
        post_pc = 0.0

    return {
        "delta_v_m_s": dv,
        "direction": "IN-TRACK (PROGRADE)",
        "post_cam_miss_distance_m": target_miss_distance_m,
        "fuel_mass_kg": fuel_mass,
        "burn_duration_s": dv / 0.05,
        "post_cam_pc": post_pc,
        "pre_cam_miss_m": current_miss_distance_m,
        "relative_speed_km_s": relative_speed_km_s
    }
