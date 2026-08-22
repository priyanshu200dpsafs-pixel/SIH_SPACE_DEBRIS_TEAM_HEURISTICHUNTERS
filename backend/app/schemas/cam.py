from pydantic import BaseModel

class CAMRequest(BaseModel):
    target_miss_distance_m: float
    hours_to_tca: float

class CAMResponse(BaseModel):
    required_delta_v_m_s: float
    radial_deviation_m: float
    along_track_deviation_m: float
    time_to_tca_s: float
