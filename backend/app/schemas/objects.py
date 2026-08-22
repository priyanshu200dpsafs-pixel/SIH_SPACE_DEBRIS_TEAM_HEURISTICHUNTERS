from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class SpaceObjectBase(BaseModel):
    norad_id: int
    name: str
    object_type: Optional[str] = None
    rcs_class: Optional[str] = None
    bstar: Optional[float] = None
    last_updated: datetime

class SpaceObjectResponse(SpaceObjectBase):
    pass
    class Config:
        from_attributes = True

class PaginatedSpaceObjects(BaseModel):
    items: List[SpaceObjectResponse]
    total: int
    page: int
    size: int
