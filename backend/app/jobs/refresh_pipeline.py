import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.config import settings
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, or_
import time

# We will import the actual pipeline logic from our core modules
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app.core.fetch_data import fetch_latest_tles
from app.core.space_weather import get_live_solar_weather
from app.core.stage4_pc import run_stage4_full_pipeline
from app.db.database import AsyncSessionLocal
from app.db.models import SpaceObject, Conjunction, RunMetadata, ConjunctionHistory
from app.services.quality_service import compute_object_quality
from app.core.threat_ranking import calculate_operational_threat_score
import app.api.routes.health as health_route

logger = logging.getLogger("refresh_pipeline")

async def refresh_conjunction_data():
    logger.info("Starting scheduled pipeline refresh...")
    try:
        # Step 1: Fetch live data from CelesTrak (with crash-proof cache fallback)
        # This overwrites the local cache file active_tles.json for the pipeline to use
        tle_data, changed_ids, dataset_version = fetch_latest_tles()
        if not tle_data:
            logger.error("Data ingestion failed and no cache available. Aborting refresh.")
            return
            
        if len(changed_ids) == 0:
            logger.info("No TLEs changed since last run. Skipping recomputation to save compute.")
            # Record an incremental run with 0 changes anyway
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    run_id = f"RUN_{int(time.time())}"
                    run_meta = RunMetadata(
                        run_id=run_id,
                        run_type="INCREMENTAL",
                        dataset_version=dataset_version,
                        propagation_version="SGP4-1.4_DOP853",
                        config_version="1.0",
                        changed_object_count=0,
                        recomputed_event_count=0,
                        reused_event_count=0
                    )
                    session.add(run_meta)
            health_route.LAST_REFRESH_TIME = datetime.now(timezone.utc).isoformat()
            return
            
        # Determine if we can do an incremental run
        is_incremental = len(changed_ids) < 5000
        run_type_str = "INCREMENTAL" if is_incremental else "FULL"
        logger.info(f"Detected {len(changed_ids)} changed objects. Triggering {run_type_str} recomputation.")

        # Step 2: Fetch live space weather data
        logger.info("Fetching live space weather data for atmospheric drag model...")
        sw = get_live_solar_weather()
        f107 = sw['f107']
        ap = sw['ap']

        # Step 3 & 4: Run full physics pipeline completely in-memory
        # This prevents locking the production database during intensive numerical integration
        logger.info("Running SGP4/KD-Tree screening and DOP853 numerical integration...")
        bt, results, screening_time, stage3_time = run_stage4_full_pipeline(
            max_refine_candidates=250, 
            f107=f107, 
            ap=ap,
            changed_ids=changed_ids if is_incremental else None
        )
        
        run_id = f"RUN_{int(time.time())}"
        
        # Step 4: ONLY open the DB transaction when we have the 100% computed final array
        async with AsyncSessionLocal() as session:
            async with session.begin(): # This starts the transaction
                reused_event_count = 0
                
                if not is_incremental:
                    # Clear old data
                    await session.execute(delete(Conjunction))
                    await session.execute(delete(SpaceObject))
                else:
                    # Clear ONLY conjunctions involving the changed objects
                    await session.execute(
                        delete(Conjunction).where(
                            or_(
                                Conjunction.norad_id_1.in_(changed_ids),
                                Conjunction.norad_id_2.in_(changed_ids)
                            )
                        )
                    )
                    # For SpaceObjects, if it's incremental, we could delete just the changed ones
                    # or rely on UPSERT (merge). We will delete the changed ones and insert new.
                    await session.execute(
                        delete(SpaceObject).where(SpaceObject.norad_id.in_(changed_ids))
                    )
                    
                    # Optional: We could query how many conjunctions remain to log reused_event_count
                    # But for now, we just proceed.
                
                # We need to insert the unique SpaceObjects first, then Conjunctions.
                objects_dict = {}
                eval_time = datetime.now(timezone.utc)
                tle_lookup = {rec['NORAD_CAT_ID']: rec for rec in tle_data}
                
                for r in results:
                    # Populating objects from conjunction results
                    for id_key, name_key in [('id1', 'name1'), ('id2', 'name2')]:
                        obj_id = r[id_key]
                        if obj_id not in objects_dict:
                            rec = tle_lookup.get(obj_id, {})
                            quality_meta = compute_object_quality(rec, eval_time)
                            objects_dict[obj_id] = SpaceObject(
                                norad_id=obj_id,
                                name=r[name_key],
                                object_type=quality_meta['object_type'],
                                launch_designator=quality_meta['launch_designator'],
                                tle_epoch=quality_meta['tle_epoch'],
                                tle_age_hours=quality_meta['tle_age_hours'],
                                source=quality_meta['source'],
                                source_timestamp=quality_meta['source_timestamp'],
                                propagation_status=quality_meta['propagation_status'],
                                sgp4_error_code=quality_meta['sgp4_error_code'],
                                data_quality_score=quality_meta['data_quality_score'],
                                data_quality_grade=quality_meta['data_quality_grade'],
                            )
                
                # Add all unique objects
                session.add_all(objects_dict.values())
                
                # Add all conjunctions
                for r in results:
                    tca_dt = datetime.strptime(r['refined_tca'], '%Y-%m-%d %H:%M:%S UTC').replace(tzinfo=timezone.utc)
                    pair_id = f"{min(r['id1'], r['id2'])}_{max(r['id1'], r['id2'])}_{int(tca_dt.timestamp())}"
                    # Compute Threat Score
                    avg_q_score = 1.0 # Default if TLE missing
                    obj1_rec = tle_lookup.get(r['id1'], {})
                    obj2_rec = tle_lookup.get(r['id2'], {})
                    if obj1_rec and obj2_rec:
                        q1 = compute_object_quality(obj1_rec, eval_time)
                        q2 = compute_object_quality(obj2_rec, eval_time)
                        avg_q_score = (q1['data_quality_score'] + q2['data_quality_score']) / 2.0
                        
                    threat_input = {
                        "pc": r['pc'],
                        "tca": tca_dt,
                        "min_dist_km": r['refined_min_dist_km'],
                        "relative_speed_km_s": r['relative_speed_km_s'],
                        "hbr_m": r['hbr_m'],
                        "data_quality_score": avg_q_score
                    }
                    threat_output = calculate_operational_threat_score(threat_input)

                    conj = Conjunction(
                        id=pair_id,
                        norad_id_1=r['id1'],
                        norad_id_2=r['id2'],
                        tca=tca_dt,
                        min_dist_km=r['refined_min_dist_km'],
                        relative_speed_km_s=r['relative_speed_km_s'],
                        pc=r['pc'],
                        hbr_m=r['hbr_m'],
                        source_tles=f"{r['id1']},{r['id2']}",
                        propagation_model=r.get('propagation_model'),
                        stage_3_model=r.get('stage_3_model'),
                        tca_convergence_status=r.get('tca_convergence_status'),
                        refinement_tolerance=r.get('refinement_tolerance'),
                        pc_method=r.get('pc_method'),
                        covariance_model=r.get('covariance_model'),
                        hbr_model=r.get('hbr_model'),
                        filter_decisions="None (Passed all)",
                        model_timestamp=eval_time,
                        consensus_status=r.get('consensus_status'),
                        model_agreement_score=r.get('model_agreement_score'),
                        consensus_metrics=r.get('consensus_metrics'),
                        run_id=run_id,
                        dataset_version=dataset_version,
                        propagation_version="SGP4-1.4_DOP853",
                        config_version="1.0",
                        pc_lower=r.get('pc_lower'),
                        pc_upper=r.get('pc_upper'),
                        sensitivity_score=r.get('sensitivity_score'),
                        uncertainty_confidence=r.get('uncertainty_confidence'),
                        foster_chan_agreement=r.get('foster_chan_agreement'),
                        uncertainty_explanation=r.get('uncertainty_explanation'),
                        # Monte Carlo Validation
                        mc_pc=r.get('mc_pc'),
                        mc_confidence_interval=r.get('mc_confidence_interval'),
                        mc_sample_count=r.get('mc_sample_count'),
                        mc_validation_status=r.get('mc_validation_status'),
                        mc_seed=r.get('mc_seed'),
                        # Threat Ranking
                        threat_score=threat_output["threat_score"],
                        risk_category=threat_output["risk_category"],
                        threat_factors=threat_output["threat_factors"],
                        threat_version=threat_output["threat_version"]
                    )
                    session.add(conj)
                    
                    import math
                    
                    hist = ConjunctionHistory(
                        conjunction_id=pair_id,
                        norad_id_1=min(r['id1'], r['id2']),
                        norad_id_2=max(r['id1'], r['id2']),
                        tca_prediction=tca_dt,
                        min_dist_km=r['refined_min_dist_km'],
                        relative_speed_km_s=r['relative_speed_km_s'],
                        pc=r['pc'],
                        log10_pc=math.log10(r['pc']) if r['pc'] > 0 else -100.0,
                        covariance_model=r.get('covariance_model'),
                        tle_age_hours_1=q1['tle_age_hours'] if obj1_rec else None,
                        tle_age_hours_2=q2['tle_age_hours'] if obj2_rec else None,
                        model_agreement_score=r.get('model_agreement_score'),
                        data_quality_score=avg_q_score,
                        event_status=r.get('consensus_status') or "NOMINAL",
                        recorded_at=eval_time
                    )
                    session.add(hist)
                    
                # Save Run Metadata
                run_meta = RunMetadata(
                    run_id=run_id,
                    run_type=run_type_str,
                    dataset_version=dataset_version,
                    propagation_version="SGP4-1.4_DOP853",
                    config_version="1.0",
                    changed_object_count=len(changed_ids),
                    recomputed_event_count=len(results),
                    reused_event_count=reused_event_count,
                    screening_runtime_seconds=screening_time,
                    stage3_runtime_seconds=stage3_time
                )
                session.add(run_meta)
            
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
