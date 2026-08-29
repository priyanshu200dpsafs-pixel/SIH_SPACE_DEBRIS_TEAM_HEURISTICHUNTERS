from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from app.api.dependencies import get_db
from app.db.models import Conjunction, ConjunctionHistory
from app.schemas.conjunctions import ConjunctionResponse, PaginatedConjunctions
from app.services.conjunction_service import compute_conjunction_metrics
from app.schemas.cam import CAMRequest, CAMResponse
from app.core.cam_solver import calculate_optimal_cam

router = APIRouter()

@router.get("", response_model=PaginatedConjunctions)
async def get_conjunctions(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    offset = (page - 1) * size
    
    total_result = await db.execute(select(func.count(Conjunction.id)))
    total = total_result.scalar_one()

    query = (
        select(Conjunction)
        .options(selectinload(Conjunction.object_1), selectinload(Conjunction.object_2))
        .order_by(Conjunction.threat_score.desc().nulls_last(), Conjunction.pc.desc())
        .offset(offset)
        .limit(size)
    )
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size
    }

@router.get("/{pair_id}", response_model=ConjunctionResponse)
async def get_conjunction(pair_id: str, db: AsyncSession = Depends(get_db)):
    query = (
        select(Conjunction)
        .options(selectinload(Conjunction.object_1), selectinload(Conjunction.object_2))
        .where(Conjunction.id == pair_id)
    )
    result = await db.execute(query)
    conj = result.scalar_one_or_none()
    if not conj:
        raise HTTPException(status_code=404, detail="Conjunction not found")
        
    metrics = compute_conjunction_metrics(conj)
    
    # Attach metrics and provenance/consensus
    conj_dict = {
        "id": conj.id,
        "norad_id_1": conj.norad_id_1,
        "norad_id_2": conj.norad_id_2,
        "tca": conj.tca,
        "min_dist_km": conj.min_dist_km,
        "relative_speed_km_s": conj.relative_speed_km_s,
        "pc": conj.pc,
        "hbr_m": conj.hbr_m,
        "last_calculated": conj.last_calculated,
        "source_tles": conj.source_tles,
        "propagation_model": conj.propagation_model,
        "stage_3_model": conj.stage_3_model,
        "tca_convergence_status": conj.tca_convergence_status,
        "refinement_tolerance": conj.refinement_tolerance,
        "pc_method": conj.pc_method,
        "covariance_model": conj.covariance_model,
        "hbr_model": conj.hbr_model,
        "filter_decisions": conj.filter_decisions,
        "model_timestamp": conj.model_timestamp,
        "consensus_status": conj.consensus_status,
        "model_agreement_score": conj.model_agreement_score,
        "consensus_metrics": conj.consensus_metrics,
        "model_agreement": conj.consensus_metrics,
        "object_1": conj.object_1,
        "object_2": conj.object_2,
        "collision_probability_metrics": metrics,
        "pc_lower": conj.pc_lower,
        "pc_upper": conj.pc_upper,
        "sensitivity_score": conj.sensitivity_score,
        "uncertainty_confidence": conj.uncertainty_confidence,
        "foster_chan_agreement": conj.foster_chan_agreement,
        "uncertainty_explanation": conj.uncertainty_explanation,
        "mc_pc": conj.mc_pc,
        "mc_confidence_interval": conj.mc_confidence_interval,
        "mc_sample_count": conj.mc_sample_count,
        "mc_validation_status": conj.mc_validation_status,
        "mc_seed": conj.mc_seed,
        "threat_score": conj.threat_score,
        "risk_category": conj.risk_category,
        "threat_factors": conj.threat_factors,
        "threat_version": conj.threat_version
    }
    return conj_dict

@router.post("/{pair_id}/cam", response_model=CAMResponse)
async def calculate_cam(pair_id: str, payload: CAMRequest, db: AsyncSession = Depends(get_db)):
    query = select(Conjunction).where(Conjunction.id == pair_id)
    result = await db.execute(query)
    conj = result.scalar_one_or_none()
    if not conj:
        raise HTTPException(status_code=404, detail="Conjunction not found")
        
    time_to_tca_s = payload.hours_to_tca * 3600.0
    mean_motion_rad_s = 0.0011  # Approx for typical LEO
    
    cam_results = calculate_optimal_cam(
        target_miss_distance_m=payload.target_miss_distance_m,
        time_to_tca_s=time_to_tca_s,
        mean_motion_rad_s=mean_motion_rad_s
    )
    
    return cam_results

@router.get("/{id1}/{id2}/history")
async def get_conjunction_history(
    id1: int,
    id2: int,
    tca: datetime,
    db: AsyncSession = Depends(get_db)
):
    """
    Fetch the historical event timeline for a given object pair near a predicted TCA.
    Because TCA drifts, we query for records within a ±6 hour window of the requested TCA.
    """
    tca_utc = tca
    if tca_utc.tzinfo is None:
        tca_utc = tca_utc.replace(tzinfo=timezone.utc)
        
    window_start = tca_utc - timedelta(hours=6)
    window_end = tca_utc + timedelta(hours=6)
    
    norad_min = min(id1, id2)
    norad_max = max(id1, id2)
    
    query = (
        select(ConjunctionHistory)
        .where(
            and_(
                ConjunctionHistory.norad_id_1 == norad_min,
                ConjunctionHistory.norad_id_2 == norad_max,
                ConjunctionHistory.tca_prediction >= window_start,
                ConjunctionHistory.tca_prediction <= window_end
            )
        )
        .order_by(ConjunctionHistory.recorded_at.asc())
    )
    
    result = await db.execute(query)
    records = result.scalars().all()
    
    return [
        {
            "id": r.id,
            "conjunction_id": r.conjunction_id,
            "norad_id_1": r.norad_id_1,
            "norad_id_2": r.norad_id_2,
            "tca_prediction": r.tca_prediction.isoformat(),
            "min_dist_km": r.min_dist_km,
            "relative_speed_km_s": r.relative_speed_km_s,
            "pc": r.pc,
            "log10_pc": r.log10_pc,
            "covariance_model": r.covariance_model,
            "tle_age_hours_1": r.tle_age_hours_1,
            "tle_age_hours_2": r.tle_age_hours_2,
            "model_agreement_score": r.model_agreement_score,
            "data_quality_score": r.data_quality_score,
            "event_status": r.event_status,
            "recorded_at": r.recorded_at.isoformat()
        }
        for r in records
    ]
