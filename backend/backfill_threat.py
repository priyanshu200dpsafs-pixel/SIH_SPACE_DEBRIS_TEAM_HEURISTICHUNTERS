import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import AsyncSessionLocal
from app.db.models import Conjunction
from app.core.threat_ranking import calculate_operational_threat_score

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Conjunction))
        conjunctions = result.scalars().all()
        for c in conjunctions:
            threat_input = {
                "pc": c.pc,
                "tca": c.tca,
                "min_dist_km": c.min_dist_km,
                "relative_speed_km_s": c.relative_speed_km_s,
                "hbr_m": c.hbr_m,
                "data_quality_score": 1.0 # Approximate for existing
            }
            try:
                out = calculate_operational_threat_score(threat_input)
                c.threat_score = out["threat_score"]
                c.risk_category = out["risk_category"]
                c.threat_factors = out["threat_factors"]
                c.threat_version = out["threat_version"]
            except Exception as e:
                print(e)
        await session.commit()
        print(f"Updated {len(conjunctions)} conjunctions.")

asyncio.run(main())
