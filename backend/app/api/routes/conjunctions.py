from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_db
from app.db.models import Conjunction
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
        .order_by(Conjunction.pc.desc())
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
    
    # Attach metrics
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
        "object_1": conj.object_1,
        "object_2": conj.object_2,
        "collision_probability_metrics": metrics
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
