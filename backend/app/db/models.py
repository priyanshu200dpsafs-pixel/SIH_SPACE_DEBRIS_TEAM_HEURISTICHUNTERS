from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Index, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.db.database import Base

class RunMetadata(Base):
    __tablename__ = "run_metadata"
    
    run_id = Column(String, primary_key=True)
    run_type = Column(String) # "FULL" or "INCREMENTAL"
    dataset_version = Column(String)
    propagation_version = Column(String)
    config_version = Column(String)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    changed_object_count = Column(Integer, default=0)
    recomputed_event_count = Column(Integer, default=0)
    reused_event_count = Column(Integer, default=0)
    
    screening_runtime_seconds = Column(Float, default=0.0)
    stage3_runtime_seconds = Column(Float, default=0.0)

class SpaceObject(Base):
    __tablename__ = "space_objects"

    norad_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    object_type = Column(String, nullable=True)
    rcs_class = Column(String, nullable=True) # E.g., 'SMALL', 'MEDIUM', 'LARGE'
    bstar = Column(Float, nullable=True)
    last_updated = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Quality & Provenance Fields
    tle_epoch = Column(DateTime(timezone=True), nullable=True)
    tle_age_hours = Column(Float, nullable=True)
    source = Column(String, nullable=True)
    source_timestamp = Column(DateTime(timezone=True), nullable=True)
    propagation_status = Column(String, nullable=True)
    sgp4_error_code = Column(Integer, nullable=True)
    launch_designator = Column(String, nullable=True)
    data_quality_score = Column(Float, nullable=True)
    data_quality_grade = Column(String, nullable=True)

    # Relationships (optional for now, but useful for ORM)
    conjunctions_as_1 = relationship("Conjunction", foreign_keys="Conjunction.norad_id_1", back_populates="object_1")
    conjunctions_as_2 = relationship("Conjunction", foreign_keys="Conjunction.norad_id_2", back_populates="object_2")

class Conjunction(Base):
    __tablename__ = "conjunctions"

    id = Column(String, primary_key=True, index=True) # E.g. pair_id: "25544_48274"
    norad_id_1 = Column(Integer, ForeignKey("space_objects.norad_id"), index=True)
    norad_id_2 = Column(Integer, ForeignKey("space_objects.norad_id"), index=True)
    tca = Column(DateTime(timezone=True), index=True)
    min_dist_km = Column(Float)
    relative_speed_km_s = Column(Float)
    pc = Column(Float, index=True) # Index on Pc is good for ordering high-risk
    hbr_m = Column(Float)
    last_calculated = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Provenance & Quality Fields
    source_tles = Column(String, nullable=True) # e.g. "NORAD_123, NORAD_456"
    propagation_model = Column(String, nullable=True)
    stage_3_model = Column(String, nullable=True)
    tca_convergence_status = Column(String, nullable=True)
    refinement_tolerance = Column(Float, nullable=True)
    pc_method = Column(String, nullable=True)
    covariance_model = Column(String, nullable=True)
    hbr_model = Column(String, nullable=True)
    filter_decisions = Column(String, nullable=True)
    model_timestamp = Column(DateTime(timezone=True), nullable=True)

    # Formal Risk Estimation Fields
    pc_lower = Column(Float, nullable=True)
    pc_upper = Column(Float, nullable=True)
    sensitivity_score = Column(Float, nullable=True)
    uncertainty_confidence = Column(String, nullable=True)
    foster_chan_agreement = Column(Float, nullable=True)
    uncertainty_explanation = Column(String, nullable=True)

    # Multi-Model Propagation Consensus Fields
    consensus_status = Column(String, nullable=True) # HIGH_AGREEMENT, MODERATE_AGREEMENT, HIGH_DIVERGENCE
    model_agreement_score = Column(Float, nullable=True)
    consensus_metrics = Column(JSON, nullable=True)

    # Monte Carlo Pc Validation Fields
    mc_pc = Column(Float, nullable=True)
    mc_confidence_interval = Column(String, nullable=True)
    mc_sample_count = Column(Integer, nullable=True)
    mc_validation_status = Column(String, nullable=True)
    mc_seed = Column(Integer, nullable=True)

    # Reproducibility Fields
    run_id = Column(String, ForeignKey("run_metadata.run_id"), nullable=True, index=True)
    dataset_version = Column(String, nullable=True)
    propagation_version = Column(String, nullable=True)
    config_version = Column(String, nullable=True)

    # Operational Threat Ranking Layer
    threat_score = Column(Float, nullable=True) # 0-100 scale
    risk_category = Column(String(50), nullable=True) # CRITICAL, HIGH, MODERATE, LOW
    threat_factors = Column(JSON, nullable=True)
    threat_version = Column(String(50), nullable=True)

    object_1 = relationship("SpaceObject", foreign_keys=[norad_id_1], back_populates="conjunctions_as_1")
    object_2 = relationship("SpaceObject", foreign_keys=[norad_id_2], back_populates="conjunctions_as_2")

    # Add a composite index on (norad_id_1, norad_id_2) to quickly find specific pairs
    __table_args__ = (
        Index("idx_conjunction_pair", "norad_id_1", "norad_id_2"),
    )

class ConjunctionHistory(Base):
    __tablename__ = "conjunction_history"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    conjunction_id = Column(String, index=True) # e.g. "25544_48274"
    norad_id_1 = Column(Integer, index=True)
    norad_id_2 = Column(Integer, index=True)
    
    tca_prediction = Column(DateTime(timezone=True), index=True)
    min_dist_km = Column(Float)
    relative_speed_km_s = Column(Float)
    pc = Column(Float)
    log10_pc = Column(Float)
    covariance_model = Column(String, nullable=True)
    tle_age_hours_1 = Column(Float, nullable=True)
    tle_age_hours_2 = Column(Float, nullable=True)
    model_agreement_score = Column(Float, nullable=True)
    data_quality_score = Column(Float, nullable=True)
    event_status = Column(String, nullable=True)
    
    recorded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    
    __table_args__ = (
        Index("idx_history_pair", "norad_id_1", "norad_id_2"),
    )
