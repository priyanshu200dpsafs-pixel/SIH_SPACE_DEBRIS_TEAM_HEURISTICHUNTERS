from fastapi import APIRouter
from datetime import datetime, timezone

router = APIRouter()

# Simple global to hold last refresh state (would normally be in Redis or DB)
LAST_REFRESH_TIME = None

@router.get("/")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "last_pipeline_run": LAST_REFRESH_TIME
    }
