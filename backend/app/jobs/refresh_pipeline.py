import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.config import settings
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete

# We will import the actual pipeline logic from our core modules
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app.core.fetch_data import fetch_latest_tles
from app.core.space_weather import get_live_solar_weather
from app.core.stage4_pc import run_stage4_full_pipeline
from app.db.database import AsyncSessionLocal
from app.db.models import SpaceObject, Conjunction
import app.api.routes.health as health_route

logger = logging.getLogger("refresh_pipeline")

async def refresh_conjunction_data():
    logger.info("Starting scheduled pipeline refresh...")
    try:
        # Step 1: Fetch live data from CelesTrak (with crash-proof cache fallback)
        # This overwrites the local cache file active_tles.json for the pipeline to use
        tle_data = fetch_latest_tles()
        if not tle_data:
            logger.error("Data ingestion failed and no cache available. Aborting refresh.")
            return

        # Step 2: Fetch live space weather data
        logger.info("Fetching live space weather data for atmospheric drag model...")
        sw = get_live_solar_weather()
        f107 = sw['f107']
        ap = sw['ap']

        # Step 3 & 4: Run full physics pipeline completely in-memory
        # This prevents locking the production database during intensive numerical integration
        logger.info("Running SGP4/KD-Tree screening and DOP853 numerical integration...")
        bt, results = run_stage4_full_pipeline(max_refine_candidates=250, f107=f107, ap=ap)
        
        # Step 4: ONLY open the DB transaction when we have the 100% computed final array
        async with AsyncSessionLocal() as session:
            async with session.begin(): # This starts the transaction
                # Clear old data (or we could UPSERT, but clearing is safer for a full refresh)
                await session.execute(delete(Conjunction))
                await session.execute(delete(SpaceObject))
                
                # We need to insert the unique SpaceObjects first, then Conjunctions.
                objects_dict = {}
                for r in results:
                    # Populating objects from conjunction results
                    if r['id1'] not in objects_dict:
                        objects_dict[r['id1']] = SpaceObject(
                            norad_id=r['id1'],
                            name=r['name1'],
                        )
                    if r['id2'] not in objects_dict:
                        objects_dict[r['id2']] = SpaceObject(
                            norad_id=r['id2'],
                            name=r['name2'],
                        )
                
                # Add all unique objects
                session.add_all(objects_dict.values())
                
                # Add all conjunctions
                for r in results:
                    tca_dt = datetime.strptime(r['refined_tca'], '%Y-%m-%d %H:%M:%S UTC').replace(tzinfo=timezone.utc)
                    pair_id = f"{min(r['id1'], r['id2'])}_{max(r['id1'], r['id2'])}_{int(tca_dt.timestamp())}"
                    conj = Conjunction(
                        id=pair_id,
                        norad_id_1=r['id1'],
                        norad_id_2=r['id2'],
                        tca=tca_dt,
                        min_dist_km=r['refined_min_dist_km'],
                        relative_speed_km_s=r['relative_speed_km_s'],
                        pc=r['pc'],
                        hbr_m=r['hbr_m'],
                    )
                    session.add(conj)
            
        logger.info(f"Pipeline refresh complete. Inserted {len(results)} conjunctions safely.")
        
        # Update global health timestamp
        health_route.LAST_REFRESH_TIME = datetime.now(timezone.utc).isoformat()
        
    except Exception as e:
        logger.error(f"Pipeline refresh failed: {e}", exc_info=True)
        # Previous data remains serving since transaction was rolled back automatically

def setup_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    # Enforce US Space Command 6-hour update tempo
    scheduler.add_job(
        refresh_conjunction_data, 
        'interval', 
        hours=6,
        id='pipeline_refresh_job'
    )
    return scheduler

if __name__ == "__main__":
    import asyncio
    logging.basicConfig(level=logging.INFO)
    asyncio.run(refresh_conjunction_data())
