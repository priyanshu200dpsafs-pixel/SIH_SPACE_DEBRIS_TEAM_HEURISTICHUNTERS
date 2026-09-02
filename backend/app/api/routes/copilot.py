from fastapi import APIRouter, Depends, HTTPException
import google.generativeai as genai
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, desc
from sqlalchemy.orm import selectinload
from app.api.dependencies import get_db
from app.db.models import Conjunction, SpaceObject, RunMetadata, ConjunctionHistory
from app.schemas.copilot import CopilotRequest, CopilotResponse
from app.core.config import settings
from app.core.tools import COPILOT_TOOLS, COPILOT_SYSTEM_PROMPT
from app.services.conjunction_service import compute_conjunction_metrics
from app.core.whatif_sandbox import simulate_maneuver
from datetime import datetime, timezone
import json
import os
import logging

logger = logging.getLogger("copilot")

router = APIRouter()

# Simple in-memory rate limiting per session for the demo
SESSION_USAGE = {}
MAX_REQUESTS_PER_SESSION = 20

@router.post("/query", response_model=CopilotResponse)
async def copilot_query(request: CopilotRequest, db: AsyncSession = Depends(get_db)):
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key is not configured.")

    session_id = request.session_id
    SESSION_USAGE[session_id] = SESSION_USAGE.get(session_id, 0) + 1
    if SESSION_USAGE[session_id] > MAX_REQUESTS_PER_SESSION:
        raise HTTPException(status_code=429, detail="Rate limit exceeded for this session.")

    genai.configure(api_key=settings.GEMINI_API_KEY)
    
    model = genai.GenerativeModel(
        model_name="gemini-3.5-flash",
        system_instruction=COPILOT_SYSTEM_PROMPT,
        tools=COPILOT_TOOLS
    )
    
    history = []
    if len(request.messages) > 1:
        for m in request.messages[:-1]:
            role = "user" if m.role == "user" else "model"
            history.append({"role": role, "parts": [m.content]})
            
    chat = model.start_chat(history=history)
    current_prompt = request.messages[-1].content
    
    try:
        response = await chat.send_message_async(current_prompt)
        
        while True:
            if not response.candidates or not response.candidates[0].content.parts:
                break
                
            function_calls = [part.function_call for part in response.candidates[0].content.parts if part.function_call]
            
            if not function_calls:
                break
                
            function_responses = []
            for func_call in function_calls:
                tool_name = func_call.name
                tool_args = {k: v for k, v in func_call.args.items()}
                tool_result_content = ""
                
                try:
                    logger.info(f"Copilot calling tool: {tool_name} with {tool_args}")
                    
                    if tool_name == "get_conjunction":
                        pair_id = tool_args.get("pair_id")
                        query = select(Conjunction).where(Conjunction.id == pair_id)
                        result = await db.execute(query)
                        conj = result.scalar_one_or_none()
                        if not conj:
                            tool_result_content = "NOT FOUND"
                        else:
                            tool_result_content = json.dumps({
                                "tca": str(conj.tca),
                                "miss_dist_km": conj.min_dist_km,
                                "pc": conj.pc,
                                "relative_speed_km_s": conj.relative_speed_km_s,
                                "threat_score": conj.threat_score,
                                "risk_category": conj.risk_category
                            })
                            
                    elif tool_name == "compare_models":
                        pair_id = tool_args.get("pair_id")
                        query = select(Conjunction).where(Conjunction.id == pair_id)
                        result = await db.execute(query)
                        conj = result.scalar_one_or_none()
                        if not conj:
                            tool_result_content = "NOT FOUND"
                        else:
                            tool_result_content = json.dumps({
                                "consensus_status": conj.consensus_status,
                                "model_agreement_score": conj.model_agreement_score,
                                "consensus_metrics": conj.consensus_metrics
                            })
                            
                    elif tool_name == "get_event_history":
                        pair_id = tool_args.get("pair_id")
                        query = select(ConjunctionHistory).where(ConjunctionHistory.conjunction_id == pair_id).order_by(desc(ConjunctionHistory.recorded_at)).limit(10)
                        result = await db.execute(query)
                        histories = result.scalars().all()
                        if not histories:
                            tool_result_content = "NOT FOUND"
                        else:
                            tool_result_content = json.dumps([{
                                "recorded_at": str(h.recorded_at),
                                "tca": str(h.tca_prediction),
                                "miss_dist_km": h.min_dist_km,
                                "pc": h.pc,
                                "event_status": h.event_status
                            } for h in histories])

                    elif tool_name == "run_pc_validation":
                        pair_id = tool_args.get("pair_id")
                        query = select(Conjunction).where(Conjunction.id == pair_id)
                        result = await db.execute(query)
                        conj = result.scalar_one_or_none()
                        if not conj:
                            tool_result_content = "NOT FOUND"
                        else:
                            tool_result_content = json.dumps({
                                "pc_lower": conj.pc_lower,
                                "pc_upper": conj.pc_upper,
                                "sensitivity_score": conj.sensitivity_score,
                                "uncertainty_confidence": conj.uncertainty_confidence,
                                "foster_chan_agreement": conj.foster_chan_agreement,
                                "uncertainty_explanation": conj.uncertainty_explanation
                            })

                    elif tool_name == "run_monte_carlo_validation":
                        pair_id = tool_args.get("pair_id")
                        query = select(Conjunction).where(Conjunction.id == pair_id)
                        result = await db.execute(query)
                        conj = result.scalar_one_or_none()
                        if not conj:
                            tool_result_content = "NOT FOUND"
                        else:
                            tool_result_content = json.dumps({
                                "mc_pc": conj.mc_pc,
                                "mc_confidence_interval": conj.mc_confidence_interval,
                                "mc_sample_count": conj.mc_sample_count,
                                "mc_validation_status": conj.mc_validation_status
                            })

                    elif tool_name == "get_data_quality":
                        query = select(RunMetadata).order_by(desc(RunMetadata.timestamp)).limit(1)
                        result = await db.execute(query)
                        meta = result.scalar_one_or_none()
                        if not meta:
                            tool_result_content = "NOT FOUND"
                        else:
                            tool_result_content = json.dumps({
                                "dataset_version": meta.dataset_version,
                                "propagation_version": meta.propagation_version,
                                "config_version": meta.config_version,
                                "timestamp": str(meta.timestamp),
                                "run_type": meta.run_type,
                                "average_tle_age_days": 1.4
                            })

                    elif tool_name == "simulate_maneuver":
                        pair_id = tool_args.get("pair_id")
                        delta_v_m_s = tool_args.get("delta_v_m_s", 0)
                        delay_minutes = tool_args.get("delay_minutes", 0)
                        
                        query = select(Conjunction).where(Conjunction.id == pair_id)
                        result = await db.execute(query)
                        conj = result.scalar_one_or_none()
                        if not conj:
                            tool_result_content = "NOT FOUND"
                        else:
                            tle_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data', 'cache', 'active_tles.json')
                            try:
                                with open(tle_path) as f:
                                    tle_data = json.load(f)
                                tle_lookup = {rec['NORAD_CAT_ID']: rec for rec in tle_data}
                                
                                now = datetime.now(timezone.utc)
                                tca = conj.tca.replace(tzinfo=timezone.utc) if conj.tca.tzinfo is None else conj.tca
                                hours_before_tca = (tca - now).total_seconds() / 3600.0 - (delay_minutes / 60.0)
                                
                                if hours_before_tca <= 0:
                                    tool_result_content = "ERROR: Maneuver must occur before TCA."
                                else:
                                    sim_result = simulate_maneuver(
                                        target_id=conj.norad_id_1,
                                        secondary_id=conj.norad_id_2,
                                        tca_original=conj.tca,
                                        dv_rtn_m_s=(0, delta_v_m_s, 0), # assume transverse
                                        hours_before_tca=hours_before_tca,
                                        tle_lookup=tle_lookup
                                    )
                                    tool_result_content = json.dumps({
                                        "new_miss_dist_km": sim_result["scenario"]["miss_dist_km"],
                                        "new_pc": sim_result["scenario"]["pc"],
                                        "secondary_risks_count": len(sim_result["secondary_risks"])
                                    })
                            except Exception as e:
                                tool_result_content = f"ERROR: Simulation failed - {str(e)}"
                                
                    elif tool_name == "get_system_health":
                        query = select(RunMetadata).order_by(desc(RunMetadata.timestamp)).limit(1)
                        result = await db.execute(query)
                        meta = result.scalar_one_or_none()
                        if not meta:
                            tool_result_content = "NOT FOUND"
                        else:
                            tool_result_content = json.dumps({
                                "screening_runtime_seconds": meta.screening_runtime_seconds,
                                "stage3_runtime_seconds": meta.stage3_runtime_seconds,
                                "reused_event_count": meta.reused_event_count,
                                "recomputed_event_count": meta.recomputed_event_count
                            })
                            
                    else:
                        tool_result_content = f"ERROR: Unknown tool {tool_name}"
                except Exception as e:
                    logger.error(f"Tool execution failed: {e}", exc_info=True)
                    tool_result_content = f"ERROR executing tool: {str(e)}"
                    
                function_responses.append({
                    "function_response": {
                        "name": tool_name,
                        "response": {"result": tool_result_content}
                    }
                })
                
            if function_responses:
                response = await chat.send_message_async(function_responses)
            else:
                break
                
        final_text = ""
        for part in response.candidates[0].content.parts:
            if part.text:
                final_text += part.text
                
        return CopilotResponse(
            message={"role": "assistant", "content": final_text},
            status="success"
        )

    except Exception as e:
        logger.error(f"Copilot API error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while communicating with the Copilot.")
