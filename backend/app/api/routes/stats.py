from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.api.dependencies import get_db
from app.db.models import Conjunction

router = APIRouter()

@router.get("")
async def get_stats(db: AsyncSession = Depends(get_db)):
    # Get total conjunctions
    total_result = await db.execute(select(func.count(Conjunction.id)))
    total = total_result.scalar_one()

    # Get critical conjunctions (pc >= 1e-4)
    critical_result = await db.execute(select(func.count(Conjunction.id)).where(Conjunction.pc >= 1e-4))
    critical = critical_result.scalar_one()

    return {
        "total_conjunctions": total,
        "critical_conjunctions": critical
    }
