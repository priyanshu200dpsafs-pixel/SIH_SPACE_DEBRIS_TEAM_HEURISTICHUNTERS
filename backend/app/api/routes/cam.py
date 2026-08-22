from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.dependencies import get_db
from app.db.models import Conjunction
from app.schemas.cam import CAMRequest, CAMResponse

router = APIRouter()

@router.post("/solve", response_model=CAMResponse)
async def calculate_cam(request: CAMRequest, db: AsyncSession = Depends(get_db)):
    # 1. Fetch conjunction data
    query = select(Conjunction).where(Conjunction.id == request.pair_id)
    result = await db.execute(query)
    conj = result.scalar_one_or_none()
    
    if not conj:
        raise HTTPException(status_code=404, detail="Conjunction not found")
    
    # Option B: Maneuver calculation not yet implemented
    return CAMResponse(
        pair_id=request.pair_id,
        required_delta_v_m_s=0.0,
        burn_time_tca_minus_hours=0.0,
        new_miss_distance_km=0.0,
        new_pc=0.0,
        status="Maneuver calculation not yet implemented"
    )
