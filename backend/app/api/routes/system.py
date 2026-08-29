from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional

from app.db.database import get_db
from app.db.models import SpaceObject, Conjunction, RunMetadata, ConjunctionHistory

router = APIRouter()

class TrustMetricsResponse(BaseModel):
    data: dict
    computation: dict
    risk: dict
    validation: dict
    quality: dict

@router.get("/trust", response_model=TrustMetricsResponse)
async def get_system_trust_metrics(db: AsyncSession = Depends(get_db)):
    # ---------------------------
    # DATA METRICS
    # ---------------------------
    total_objects_query = await db.execute(select(func.count(SpaceObject.norad_id)))
    total_objects = total_objects_query.scalar() or 0

    failed_tles_query = await db.execute(select(func.count(SpaceObject.norad_id)).where(SpaceObject.sgp4_error_code != 0))
    failed_tles = failed_tles_query.scalar() or 0

    stale_tles_query = await db.execute(select(func.count(SpaceObject.norad_id)).where(SpaceObject.tle_age_hours > 24))
    stale_tles = stale_tles_query.scalar() or 0
    stale_tle_percentage = (stale_tles / total_objects * 100) if total_objects > 0 else 0.0

    sources_query = await db.execute(select(SpaceObject.source, func.count(SpaceObject.norad_id)).group_by(SpaceObject.source))
    source_distribution = {source or "UNKNOWN": count for source, count in sources_query.all()}

    # ---------------------------
    # QUALITY METRICS (Run Metadata)
    # ---------------------------
    last_full_query = await db.execute(select(RunMetadata).where(RunMetadata.run_type == "FULL").order_by(RunMetadata.timestamp.desc()).limit(1))
    last_full = last_full_query.scalar_one_or_none()
    
    last_incr_query = await db.execute(select(RunMetadata).where(RunMetadata.run_type == "INCREMENTAL").order_by(RunMetadata.timestamp.desc()).limit(1))
    last_incr = last_incr_query.scalar_one_or_none()

    latest_run_query = await db.execute(select(RunMetadata).order_by(RunMetadata.timestamp.desc()).limit(1))
    latest_run = latest_run_query.scalar_one_or_none()

    # ---------------------------
    # COMPUTATION METRICS
    # ---------------------------
    screening_runtime = latest_run.screening_runtime_seconds if latest_run and latest_run.screening_runtime_seconds else 0.0
    stage3_runtime = latest_run.stage3_runtime_seconds if latest_run and latest_run.stage3_runtime_seconds else 0.0
    candidates_refined = latest_run.recomputed_event_count if latest_run else 0

    total_conjunctions_query = await db.execute(select(func.count(Conjunction.id)))
    total_conjunctions = total_conjunctions_query.scalar() or 0

    numerical_failures_query = await db.execute(select(func.count(Conjunction.id)).where(Conjunction.tca_convergence_status != 'SUCCESS'))
    numerical_failures = numerical_failures_query.scalar() or 0

    model_disagreement_query = await db.execute(select(func.count(Conjunction.id)).where(Conjunction.consensus_status == 'HIGH_DIVERGENCE'))
    model_disagreement = model_disagreement_query.scalar() or 0

    # ---------------------------
    # RISK METRICS
    # ---------------------------
    pc_agreement_query = await db.execute(select(func.avg(Conjunction.foster_chan_agreement)))
    pc_method_agreement = pc_agreement_query.scalar() or 0.0

    cov_sensitivity_query = await db.execute(select(func.avg(Conjunction.sensitivity_score)))
    covariance_sensitivity = cov_sensitivity_query.scalar() or 0.0

    mc_validation_status_query = await db.execute(select(Conjunction.mc_validation_status, func.count(Conjunction.id)).group_by(Conjunction.mc_validation_status))
    mc_validation_status = {status or "NOT_RUN": count for status, count in mc_validation_status_query.all()}

    high_uncertainty_query = await db.execute(select(func.count(Conjunction.id)).where(Conjunction.uncertainty_confidence == 'HIGH UNCERTAINTY'))
    high_uncertainty_events = high_uncertainty_query.scalar() or 0

    # ---------------------------
    # VALIDATION METRICS
    # ---------------------------
    hist_records_query = await db.execute(select(func.count(ConjunctionHistory.id)))
    historical_records_tested = hist_records_query.scalar() or 0

    hist_agreement_query = await db.execute(select(func.avg(ConjunctionHistory.model_agreement_score)))
    hist_agreement = hist_agreement_query.scalar() or 0.0

    return TrustMetricsResponse(
        data={
            "objects_ingested": total_objects,
            "failed_tles": failed_tles,
            "stale_tle_percentage": round(stale_tle_percentage, 1),
            "source_distribution": source_distribution
        },
        computation={
            "screening_runtime_s": round(screening_runtime, 1),
            "stage3_runtime_s": round(stage3_runtime, 1),
            "candidates_refined": candidates_refined,
            "numerical_failures": numerical_failures,
            "model_disagreement_events": model_disagreement
        },
        risk={
            "pc_method_agreement_avg": round(pc_method_agreement, 3),
            "covariance_sensitivity_avg": round(covariance_sensitivity, 3),
            "mc_validation_status": mc_validation_status,
            "high_uncertainty_events": high_uncertainty_events
        },
        validation={
            "historical_records_tested": historical_records_tested,
            "correlation_score": "See Backtest Log",
            "average_model_agreement_history": round(hist_agreement, 2),
            "calibration_metrics": "Empirical Scaling applied.",
            "known_limitations": ["TLE covariance is empirical", "No maneuver detection"]
        },
        quality={
            "last_full_run": last_full.timestamp.isoformat() if last_full else None,
            "last_incremental_run": last_incr.timestamp.isoformat() if last_incr else None,
            "dataset_version": latest_run.dataset_version if latest_run else None,
            "model_version": latest_run.propagation_version if latest_run else "Unknown",
            "config_version": latest_run.config_version if latest_run else "Unknown"
        }
    )
