from pydantic import BaseModel
from typing import List, Optional

class Message(BaseModel):
    role: str
    content: str

class CopilotRequest(BaseModel):
    session_id: str
    messages: List[Message]
    
class CopilotResponse(BaseModel):
    message: Message
    status: str
