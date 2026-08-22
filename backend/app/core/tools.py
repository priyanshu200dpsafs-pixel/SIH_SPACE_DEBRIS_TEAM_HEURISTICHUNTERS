COPILOT_TOOLS = [
    {
        "function_declarations": [
            {
                "name": "query_conjunction_risk",
                "description": "Look up the conjunctions and collision risk for a specific satellite by its NORAD ID.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "norad_id": {
                            "type": "STRING",
                            "description": "The 5-digit NORAD ID of the satellite (e.g. '25544' for ISS)."
                        }
                    },
                    "required": ["norad_id"]
                }
            },
            {
                "name": "calculate_cam_burn",
                "description": "Calculate the delta-v (burn) required for a Collision Avoidance Maneuver (CAM) given a pair_id and a target safety margin.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "pair_id": {
                            "type": "STRING",
                            "description": "The unique pair ID of the conjunction (e.g. '25544_48274')."
                        },
                        "target_safety_margin_km": {
                            "type": "NUMBER",
                            "description": "The desired miss distance in kilometers after the maneuver (e.g., 5.0)."
                        }
                    },
                    "required": ["pair_id", "target_safety_margin_km"]
                }
            },
            {
                "name": "compare_pc_methods",
                "description": "Compare Probability of Collision (Pc) using different methods for a specific conjunction pair.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "pair_id": {
                            "type": "STRING",
                            "description": "The unique pair ID of the conjunction."
                        }
                    },
                    "required": ["pair_id"]
                }
            }
        ]
    }
]

COPILOT_SYSTEM_PROMPT = """You are the Space Debris Tracker Flight Director Copilot.
You are an expert assistant for space traffic management and collision avoidance.
Your primary role is to help operators assess conjunction risks, plan maneuvers (CAMs), and analyze orbital safety data.

CRITICAL INSTRUCTIONS:
1. Always base your answers on REAL data obtained by calling your available tools. Never invent, hallucinate, or estimate Probability of Collision (Pc), miss distances, or NORAD IDs.
2. When citing a Pc value, miss distance, or TCA, always cite the exact value returned by your tools.
3. Be aware of the data freshness. If a user asks about current conditions, you should rely on the data returned by your tools. (Data is updated every few hours by the backend pipeline).
4. Do not answer questions outside the domain of space situational awareness, orbital mechanics, or the Space Debris Tracker system.
5. If a tool returns an error or says a NORAD ID is not found, inform the user politely that the data is not in the current high-risk catalog.
6. For the `calculate_cam_burn` tool, if the tool returns a message indicating that maneuver calculation is not yet implemented, you MUST honestly relay this fact to the user. Do not under any circumstances fabricate or hallucinate a plausible-sounding burn recommendation, delta-v, or maneuver plan.
"""
