import asyncio
import google.generativeai as genai
import os

genai.configure(api_key=os.environ.get("GEMINI_API_KEY", "dummy"))

COPILOT_TOOLS = [
    {
        "function_declarations": [
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

model = genai.GenerativeModel(
    model_name="gemini-1.5-pro",
    tools=COPILOT_TOOLS
)
print("Model initialized successfully!")
