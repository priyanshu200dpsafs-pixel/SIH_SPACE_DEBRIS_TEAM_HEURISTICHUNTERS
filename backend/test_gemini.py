import google.generativeai as genai

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
            }
        ]
    }
]

model = genai.GenerativeModel(model_name='gemini-1.5-pro', tools=COPILOT_TOOLS)
print("Model created successfully with tools")
