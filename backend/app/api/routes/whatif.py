from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.dependencies import get_db
from app.db.models import Conjunction
from app.core.whatif_sandbox import simulate_maneuver, simulate_maneuver_landscape

router = APIRouter()

class ManeuverRequest(BaseModel):
    target_norad_id: int
    dv_radial_m_s: float
    dv_transverse_m_s: float
    dv_normal_m_s: float
    hours_before_tca: float

class SecondaryRisk(BaseModel):
    norad_id: int
    name: str
    tca: str
    miss_dist_km: float

class WhatIfResponse(BaseModel):
    current: dict
    scenario: dict
    secondary_risks: List[SecondaryRisk]
    decision: str
    decision_reason: str

@router.post("/conjunctions/{pair_id}/simulate", response_model=WhatIfResponse)
async def run_whatif_simulation(pair_id: str, payload: ManeuverRequest, db: AsyncSession = Depends(get_db)):
    """
    Run a hypothetical maneuver simulation (decision-support only).
    """
    # 1. Fetch current conjunction
    query = select(Conjunction).where(Conjunction.id == pair_id)
    result = await db.execute(query)
    conj = result.scalar_one_or_none()
    if not conj:
        raise HTTPException(status_code=404, detail="Conjunction not found")
        
    if payload.target_norad_id not in [conj.norad_id_1, conj.norad_id_2]:
        raise HTTPException(status_code=400, detail="Target NORAD ID is not part of this conjunction.")
        
    secondary_id = conj.norad_id_2 if payload.target_norad_id == conj.norad_id_1 else conj.norad_id_1
    
    # 2. Load TLEs (we read from the active cache for the sandbox)
    tle_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 
                            'data', 'cache', 'active_tles.json')
    try:
        with open(tle_path) as f:
            tle_data = json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load TLE catalog for simulation.")
        
    tle_lookup = {rec['NORAD_CAT_ID']: rec for rec in tle_data}
    
    if payload.target_norad_id not in tle_lookup or secondary_id not in tle_lookup:
        raise HTTPException(status_code=400, detail="Required TLEs missing from active catalog.")
        
    # 3. Run simulation
    dv_tuple = (payload.dv_radial_m_s, payload.dv_transverse_m_s, payload.dv_normal_m_s)
    
    try:
        sim_result = simulate_maneuver(
            target_id=payload.target_norad_id,
            secondary_id=secondary_id,
            tca_original=conj.tca,
            dv_rtn_m_s=dv_tuple,
            hours_before_tca=payload.hours_before_tca,
            tle_lookup=tle_lookup
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")
        
    # 4. Evaluate Decision
    current_pc = conj.pc
    new_pc = sim_result['scenario']['pc']
    secondary_risks = sim_result['secondary_risks']
    
    decision = "NEUTRAL"
    reason = "Risk is marginally reduced."
    
    if len(secondary_risks) > 0:
        decision = "NOT RECOMMENDED"
        reason = "Maneuver introduces secondary collision risks."
    elif new_pc > current_pc:
        decision = "NOT RECOMMENDED"
        reason = "Maneuver increases the primary collision probability."
    elif new_pc < current_pc / 10.0:
        decision = "IMPROVED"
        reason = "Risk reduced by more than an order of magnitude safely."
        
    # Construct response
    return {
        "current": {
            "tca": conj.tca.strftime('%Y-%m-%d %H:%M:%S UTC'),
            "miss_dist_km": conj.min_dist_km,
            "pc": current_pc
        },
        "scenario": sim_result["scenario"],
        "secondary_risks": secondary_risks,
        "decision": decision,
        "decision_reason": reason
    }

class RobustnessRequest(BaseModel):
    target_norad_id: int
    dv_radial_m_s: float
    dv_normal_m_s: float
    center_dv_transverse_m_s: float
    span_dv_transverse_m_s: float
    center_hours: float
    span_hours: float
    resolution: int = 5

@router.post("/conjunctions/{pair_id}/robustness")
async def run_whatif_robustness(pair_id: str, payload: RobustnessRequest, db: AsyncSession = Depends(get_db)):
    """
    Run a batch robustness analysis over a 2D maneuver grid.
    """
    query = select(Conjunction).where(Conjunction.id == pair_id)
    result = await db.execute(query)
    conj = result.scalar_one_or_none()
    if not conj:
        raise HTTPException(status_code=404, detail="Conjunction not found")
        
    if payload.target_norad_id not in [conj.norad_id_1, conj.norad_id_2]:
        raise HTTPException(status_code=400, detail="Target NORAD ID is not part of this conjunction.")
        
    secondary_id = conj.norad_id_2 if payload.target_norad_id == conj.norad_id_1 else conj.norad_id_1
    
    tle_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 
                            'data', 'cache', 'active_tles.json')
    try:
        with open(tle_path) as f:
            tle_data = json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load TLE catalog.")
        
    tle_lookup = {rec['NORAD_CAT_ID']: rec for rec in tle_data}
    
    if payload.target_norad_id not in tle_lookup or secondary_id not in tle_lookup:
        raise HTTPException(status_code=400, detail="Required TLEs missing.")
        
    # Cap resolution to prevent denial of service (e.g. max 7x7)
    res = min(payload.resolution, 7)
    
    try:
        landscape = simulate_maneuver_landscape(
            target_id=payload.target_norad_id,
            secondary_id=secondary_id,
            tca_original=conj.tca,
            dv_radial_m_s=payload.dv_radial_m_s,
            dv_normal_m_s=payload.dv_normal_m_s,
            center_dv_transverse_m_s=payload.center_dv_transverse_m_s,
            span_dv_transverse_m_s=payload.span_dv_transverse_m_s,
            center_hours=payload.center_hours,
            span_hours=payload.span_hours,
            resolution=res,
            tle_lookup=tle_lookup,
            current_pc=conj.pc
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Robustness analysis failed: {str(e)}")
        
    return landscape
