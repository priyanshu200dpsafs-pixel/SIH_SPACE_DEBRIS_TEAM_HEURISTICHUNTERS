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

class ModelAgreementMetrics(BaseModel):
    model_agreement_score: Optional[float] = None
    consensus_status: Optional[str] = None
    requires_scrutiny: Optional[bool] = False
    delta_tca_seconds: Optional[float] = None
    delta_miss_distance_km: Optional[float] = None
    delta_relative_speed_km_s: Optional[float] = None
    max_trajectory_separation_km: Optional[float] = None
    relative_velocity_angle_deg: Optional[float] = None
    sgp4_summary: Optional[dict] = None
    numerical_summary: Optional[dict] = None
    diagnostic_notes: Optional[str] = None

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

    # Provenance
    source_tles: Optional[str] = None
    propagation_model: Optional[str] = None
    stage_3_model: Optional[str] = None
    tca_convergence_status: Optional[str] = None
    refinement_tolerance: Optional[float] = None
    pc_method: Optional[str] = None
    covariance_model: Optional[str] = None
    hbr_model: Optional[str] = None
    filter_decisions: Optional[str] = None
    model_timestamp: Optional[datetime] = None

    # Multi-Model Propagation Consensus
    consensus_status: Optional[str] = None
    model_agreement_score: Optional[float] = None
    consensus_metrics: Optional[dict] = None

    # Threat Ranking
    threat_score: Optional[float] = None
    risk_category: Optional[str] = None
    threat_factors: Optional[dict] = None
    threat_version: Optional[str] = None

class ConjunctionResponse(ConjunctionBase):
    object_1: Optional[SpaceObjectResponse] = None
    object_2: Optional[SpaceObjectResponse] = None
    collision_probability_metrics: Optional[CollisionProbabilityMetrics] = None
    model_agreement: Optional[ModelAgreementMetrics] = None
    class Config:
        from_attributes = True

class PaginatedConjunctions(BaseModel):
    items: List[ConjunctionResponse]
    total: int
    page: int
    size: int
