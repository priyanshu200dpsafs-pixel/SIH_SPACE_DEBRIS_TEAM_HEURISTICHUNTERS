import asyncio
from datetime import datetime, timedelta, timezone
from app.db.database import AsyncSessionLocal
from app.db.models import SpaceObject, Conjunction
from app.core.threat_ranking import calculate_operational_threat_score
import random

async def seed():
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # Seed Objects
            for i in range(1, 11):
                session.add(SpaceObject(
                    norad_id=i, name=f"SAT-{i}", object_type="PAYLOAD",
                    data_quality_score=random.uniform(0.7, 1.0)
                ))
            
            # Seed Conjunctions
            tca_base = datetime.now(timezone.utc)
            for i in range(1, 6):
                tca = tca_base + timedelta(hours=random.uniform(2, 48))
                pc = 10 ** random.uniform(-6, -3)
                min_dist = random.uniform(0.1, 5.0)
                rel_vel = random.uniform(5.0, 15.0)
                hbr = random.uniform(1.0, 20.0)
                
                threat_in = {
                    "pc": pc, "tca": tca, "min_dist_km": min_dist,
                    "relative_speed_km_s": rel_vel, "hbr_m": hbr, "data_quality_score": 0.9
                }
                out = calculate_operational_threat_score(threat_in)
                
                session.add(Conjunction(
                    id=f"{i}_{i+5}", norad_id_1=i, norad_id_2=i+5,
                    tca=tca, min_dist_km=min_dist, relative_speed_km_s=rel_vel,
                    pc=pc, hbr_m=hbr,
                    threat_score=out["threat_score"], risk_category=out["risk_category"],
                    threat_factors=out["threat_factors"], threat_version=out["threat_version"]
                ))
        print("Database seeded with 5 conjunctions.")

asyncio.run(seed())
