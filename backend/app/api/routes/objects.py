from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from typing import Optional

from app.api.dependencies import get_db
from app.db.models import SpaceObject, Conjunction
from app.schemas.objects import SpaceObjectResponse, PaginatedSpaceObjects
from app.schemas.conjunctions import ConjunctionResponse, PaginatedConjunctions

router = APIRouter()

@router.get("", response_model=PaginatedSpaceObjects)
async def get_objects(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    offset = (page - 1) * size
    
    # Count total
    total_result = await db.execute(select(func.count(SpaceObject.norad_id)))
    total = total_result.scalar_one()

    # Get page
    query = select(SpaceObject).order_by(SpaceObject.norad_id).offset(offset).limit(size)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size
    }

@router.get("/{norad_id}", response_model=SpaceObjectResponse)
async def get_object(norad_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpaceObject).where(SpaceObject.norad_id == norad_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Space object not found")
    return obj

@router.get("/{norad_id}/conjunctions", response_model=PaginatedConjunctions)
async def get_object_conjunctions(
    norad_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    # Verify object exists
    obj_check = await db.execute(select(SpaceObject.norad_id).where(SpaceObject.norad_id == norad_id))
    if not obj_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Space object not found")

    offset = (page - 1) * size
    
    # Count total
    count_query = select(func.count(Conjunction.id)).where(
        or_(Conjunction.norad_id_1 == norad_id, Conjunction.norad_id_2 == norad_id)
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Get page
    query = (
        select(Conjunction)
        .options(selectinload(Conjunction.object_1), selectinload(Conjunction.object_2))
        .where(or_(Conjunction.norad_id_1 == norad_id, Conjunction.norad_id_2 == norad_id))
        .order_by(Conjunction.pc.desc()) # Order by highest risk
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
