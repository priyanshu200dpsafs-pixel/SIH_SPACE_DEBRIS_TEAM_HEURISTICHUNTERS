from fastapi import APIRouter
import json
import os

router = APIRouter()

@router.get("")
async def get_validation_results():
    filepath = "validation/results/validation_summary.json"
    if not os.path.exists(filepath):
        return {"error": "Validation results not found. Run validation campaign first."}
    
    with open(filepath, "r") as f:
        data = json.load(f)
    return data
