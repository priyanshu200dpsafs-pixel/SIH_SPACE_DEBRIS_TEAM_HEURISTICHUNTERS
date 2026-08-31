from fastapi import APIRouter, Depends
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from app.db.database import get_db
from app.db.models import RunMetadata

router = APIRouter()

# Simple global to hold last refresh state (would normally be in Redis or DB)
LAST_REFRESH_TIME = None

from app.core.config import settings
from datetime import timedelta
import logging

logger = logging.getLogger("health")

@router.get("/")
async def health_check(db: AsyncSession = Depends(get_db)):
    now_utc = datetime.now(timezone.utc)
    interval_hours = getattr(settings, "REFRESH_INTERVAL_HOURS", 4)
    
    stats = None
    last_sync_dt = None
    last_full_ts = None

    try:
        # Get latest run stats
        result = await db.execute(select(RunMetadata).order_by(desc(RunMetadata.timestamp)).limit(1))
        latest_run = result.scalar_one_or_none()
        
        # Get last full run specifically
        result_full = await db.execute(select(RunMetadata).where(RunMetadata.run_type == "FULL").order_by(desc(RunMetadata.timestamp)).limit(1))
        last_full = result_full.scalar_one_or_none()

        if latest_run:
            last_sync_dt = latest_run.timestamp
            stats = {
                "run_id": latest_run.run_id,
                "run_type": latest_run.run_type,
                "dataset_version": latest_run.dataset_version,
                "changed_object_count": latest_run.changed_object_count,
                "recomputed_event_count": latest_run.recomputed_event_count,
                "reused_event_count": latest_run.reused_event_count,
                "timestamp": latest_run.timestamp.isoformat() if latest_run.timestamp else None
            }
        
        if last_full and last_full.timestamp:
            last_full_ts = last_full.timestamp.isoformat()

    except Exception as e:
        logger.warning(f"Health check DB query failed (non-fatal): {e}")
        # Continue with fallback values — don't crash the endpoint
    
    # Determine reference last sync time
    if last_sync_dt:
        ref_sync = last_sync_dt
    elif LAST_REFRESH_TIME:
        try:
            ref_sync = datetime.fromisoformat(LAST_REFRESH_TIME)
        except Exception:
            ref_sync = now_utc
    else:
        # No pipeline has ever run — use server startup time as baseline
        ref_sync = now_utc

    if ref_sync.tzinfo is None:
        ref_sync = ref_sync.replace(tzinfo=timezone.utc)
        
    next_sync_dt = ref_sync + timedelta(hours=interval_hours)
    # If next sync is already past, compute next future interval
    while next_sync_dt < now_utc:
        next_sync_dt += timedelta(hours=interval_hours)
        
    seconds_until_next = max(0, int((next_sync_dt - now_utc).total_seconds()))

    return {
        "status": "healthy",
        "timestamp": now_utc.isoformat(),
        "last_pipeline_run": ref_sync.isoformat(),
        "last_full_run_timestamp": last_full_ts,
        "refresh_interval_hours": interval_hours,
        "next_pipeline_run": next_sync_dt.isoformat(),
        "seconds_until_next_run": seconds_until_next,
        "latest_run_stats": stats
    }

