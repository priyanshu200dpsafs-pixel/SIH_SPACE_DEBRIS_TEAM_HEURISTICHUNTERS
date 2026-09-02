from pydantic import BaseModel

class CAMRequest(BaseModel):
    target_miss_distance_m: float
    hours_to_tca: float

class CAMResponse(BaseModel):
    delta_v_m_s: float
    direction: str
    post_cam_miss_distance_m: float
    fuel_mass_kg: float
    burn_duration_s: float
    post_cam_pc: float
    pre_cam_miss_m: float
    relative_speed_km_s: float
