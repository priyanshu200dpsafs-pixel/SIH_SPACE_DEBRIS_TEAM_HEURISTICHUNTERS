import pytest
import datetime
import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select, and_

from app.db.models import ConjunctionHistory
from app.db.database import Base

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

def test_history_logic():
    asyncio.run(_test_history_logic())

async def _test_history_logic():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    TestingSessionLocal = async_sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    tca = datetime.datetime.now(datetime.timezone.utc)
    id1 = 12345
    id2 = 67890
    
    async with TestingSessionLocal() as session:
        async with session.begin():
            h1 = ConjunctionHistory(
                conjunction_id=f"{id1}_{id2}_{int(tca.timestamp())}",
                norad_id_1=id1,
                norad_id_2=id2,
                tca_prediction=tca,
                min_dist_km=1.5,
                relative_speed_km_s=7.0,
                pc=1e-5,
                log10_pc=-5.0,
                recorded_at=tca - datetime.timedelta(days=1)
            )
            h2 = ConjunctionHistory(
                conjunction_id=f"{id1}_{id2}_{int(tca.timestamp()) + 10}",
                norad_id_1=id1,
                norad_id_2=id2,
                tca_prediction=tca + datetime.timedelta(seconds=10),
                min_dist_km=1.2,
                relative_speed_km_s=7.0,
                pc=2e-5,
                log10_pc=-4.7,
                recorded_at=tca - datetime.timedelta(hours=6)
            )
            h3 = ConjunctionHistory(
                conjunction_id=f"{id1}_{id2}_old",
                norad_id_1=id1,
                norad_id_2=id2,
                tca_prediction=tca - datetime.timedelta(days=2),
                min_dist_km=5.0,
                relative_speed_km_s=7.0,
                pc=1e-7,
                log10_pc=-7.0,
                recorded_at=tca - datetime.timedelta(days=7)
            )
            session.add_all([h1, h2, h3])
            
    async with TestingSessionLocal() as session:
        window_start = tca - datetime.timedelta(hours=6)
        window_end = tca + datetime.timedelta(hours=6)
        
        query = (
            select(ConjunctionHistory)
            .where(
                and_(
                    ConjunctionHistory.norad_id_1 == id1,
                    ConjunctionHistory.norad_id_2 == id2,
                    ConjunctionHistory.tca_prediction >= window_start,
                    ConjunctionHistory.tca_prediction <= window_end
                )
            )
        )
        result = await session.execute(query)
        records = result.scalars().all()
        
        assert len(records) == 2
        
    await engine.dispose()
