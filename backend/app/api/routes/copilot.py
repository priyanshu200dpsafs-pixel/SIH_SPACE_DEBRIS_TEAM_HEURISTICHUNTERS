from fastapi import APIRouter, Depends, HTTPException
import google.generativeai as genai
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from app.api.dependencies import get_db
from app.db.models import Conjunction, SpaceObject
from app.schemas.copilot import CopilotRequest, CopilotResponse
from app.core.config import settings
from app.core.tools import COPILOT_TOOLS, COPILOT_SYSTEM_PROMPT
from app.services.conjunction_service import compute_conjunction_metrics
import logging

logger = logging.getLogger("copilot")

router = APIRouter()

# Simple in-memory rate limiting per session for the demo
# In production, use Redis.
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
    
    # Instantiate the model with tools and system instruction
    model = genai.GenerativeModel(
        model_name="gemini-3.5-flash",
        system_instruction=COPILOT_SYSTEM_PROMPT,
        tools=COPILOT_TOOLS
    )
    
    # Convert Pydantic messages to Gemini History format
    # The last message is the prompt to send, prior ones are history
    history = []
    if len(request.messages) > 1:
        for m in request.messages[:-1]:
            role = "user" if m.role == "user" else "model"
            history.append({"role": role, "parts": [m.content]})
            
    chat = model.start_chat(history=history)
    current_prompt = request.messages[-1].content
    
    try:
        # Initial message to model
        response = await chat.send_message_async(current_prompt)
        
        # Multi-turn tool execution loop
        while True:
            # Check if there are function calls in the response
            if not response.candidates or not response.candidates[0].content.parts:
                break
                
            function_calls = [part.function_call for part in response.candidates[0].content.parts if part.function_call]
            
            if not function_calls:
                # No more tools called, we're done
                break
                
            # Process all function calls
            function_responses = []
            for func_call in function_calls:
                tool_name = func_call.name
                # convert protobuf mapping to python dict
                tool_args = {k: v for k, v in func_call.args.items()}
                
                tool_result_content = ""
                try:
                    logger.info(f"Copilot calling tool: {tool_name} with {tool_args}")
                    if tool_name == "query_conjunction_risk":
                        norad_id = int(tool_args.get("norad_id"))
                        query = (
                            select(Conjunction)
                            .options(selectinload(Conjunction.object_1), selectinload(Conjunction.object_2))
                            .where(or_(Conjunction.norad_id_1 == norad_id, Conjunction.norad_id_2 == norad_id))
                            .order_by(Conjunction.pc.desc())
                            .limit(5)
                        )
                        result = await db.execute(query)
                        conjs = result.scalars().all()
                        if not conjs:
                            tool_result_content = "No high-risk conjunctions found for this NORAD ID."
                        else:
                            output = []
                            for c in conjs:
                                output.append(
                                    f"Pair {c.id}: {c.object_1.name} vs {c.object_2.name}, "
                                    f"TCA: {c.tca}, Miss Distance: {c.min_dist_km} km, Pc: {c.pc}"
                                )
                            tool_result_content = "\n".join(output)
                            
                    elif tool_name == "calculate_cam_burn":
                        pair_id = tool_args.get("pair_id")
                        margin = tool_args.get("target_safety_margin_km")
                        tool_result_content = "Maneuver calculation not yet implemented."
                        
                    elif tool_name == "compare_pc_methods":
                        pair_id = tool_args.get("pair_id")
                        
                        query = select(Conjunction).where(Conjunction.id == pair_id)
                        result = await db.execute(query)
                        conj = result.scalar_one_or_none()
                        
                        if not conj:
                            tool_result_content = "Pair not found in tracking database."
                        else:
                            metrics = compute_conjunction_metrics(conj)
                            foster_str = metrics.foster_2d_display if metrics.foster_2d_display else f"{metrics.foster_2d:e}"
                            chan_str = metrics.chan_analytical_display if metrics.chan_analytical_display else f"{metrics.chan_analytical:e}"
                            tool_result_content = (
                                f"Foster 2D Pc: {foster_str}, "
                                f"Chan '97 Analytical Pc: {chan_str} "
                                f"for pair {pair_id}."
                            )
                        
                    else:
                        tool_result_content = f"Error: Unknown tool {tool_name}"
                except Exception as e:
                    logger.error(f"Tool execution failed: {e}", exc_info=True)
                    tool_result_content = f"Error executing tool: {str(e)}"
                    
                # Append the tool result for this function call
                function_responses.append({
                    "function_response": {
                        "name": tool_name,
                        "response": {"result": tool_result_content}
                    }
                })
                
            # Send the tool responses back to the model to continue the conversation
            if function_responses:
                response = await chat.send_message_async(function_responses)
            else:
                break
                
        # We have a final text response
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
