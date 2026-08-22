from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.objects import SpaceObjectResponse

class CollisionProbabilityMetrics(BaseModel):
    foster_2d: Optional[float]                  # Linear Pc; None when < 1e-15
    foster_2d_log10: float                      # True log10(Pc), always present
    foster_2d_display: str                      # Human-readable display string
    chan_analytical: Optional[float]             # Linear Pc; None when < 1e-15
    chan_analytical_log10: float                 # True log10(Pc), always present
    chan_analytical_display: str                 # Human-readable display string
    divergence_percentage: float
    algorithm_consensus_verified: bool
    requires_manual_review: bool

class ConjunctionBase(BaseModel):
    id: str
    norad_id_1: int
    norad_id_2: int
    tca: datetime
    min_dist_km: float
    relative_speed_km_s: float
    pc: float
    hbr_m: float
    last_calculated: datetime

class ConjunctionResponse(ConjunctionBase):
    object_1: Optional[SpaceObjectResponse] = None
    object_2: Optional[SpaceObjectResponse] = None
    collision_probability_metrics: Optional[CollisionProbabilityMetrics] = None
    class Config:
        from_attributes = True

class PaginatedConjunctions(BaseModel):
    items: List[ConjunctionResponse]
    total: int
    page: int
    size: int
