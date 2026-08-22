from fastapi import APIRouter, Depends, HTTPException, Header
from app.core.config import settings
from app.jobs.refresh_pipeline import refresh_conjunction_data
from pydantic import BaseModel
import asyncio

router = APIRouter()

class TriggerResponse(BaseModel):
    message: str

async def verify_admin_key(x_admin_key: str = Header(...)):
    if x_admin_key != settings.ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

@router.post("/trigger-refresh", response_model=TriggerResponse, dependencies=[Depends(verify_admin_key)])
async def trigger_refresh():
    # Run it as a background task to not block the HTTP response
    asyncio.create_task(refresh_conjunction_data())
    return {"message": "Pipeline refresh triggered successfully in the background."}
