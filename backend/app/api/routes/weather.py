from fastapi import APIRouter
import os
import json

router = APIRouter()

@router.get("")
async def get_space_weather():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    cache_path = os.path.join(current_dir, "..", "..", "data", "cache", "space_weather.json")
    
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r") as f:
                data = json.load(f)
            return data
        except Exception:
            pass
            
    return {"f107": 150.0, "ap": 15.0}
