import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy import select
from app.db.models import Conjunction
from app.services.conjunction_service import compute_conjunction_metrics
from app.core.config import settings
from app.db.session import async_session_maker

async def main():
    async with async_session_maker() as db:
        pair_id = "61845_61925_1787445338"
        query = select(Conjunction).where(Conjunction.id == pair_id)
        result = await db.execute(query)
        conj = result.scalar_one_or_none()
        
        metrics = compute_conjunction_metrics(conj)
        tool_result_content = (
            f"Foster 2D Pc: {metrics.foster_2d:e}, "
            f"Chan '97 Analytical Pc: {metrics.chan_analytical:e} "
            f"for pair {pair_id}."
        )
        print("Copilot Tool String: ", tool_result_content)

asyncio.run(main())
