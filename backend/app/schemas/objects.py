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

    # Data Quality
    tle_epoch: Optional[datetime] = None
    tle_age_hours: Optional[float] = None
    source: Optional[str] = None
    source_timestamp: Optional[datetime] = None
    propagation_status: Optional[str] = None
    sgp4_error_code: Optional[int] = None
    launch_designator: Optional[str] = None
    data_quality_score: Optional[float] = None
    data_quality_grade: Optional[str] = None

class SpaceObjectResponse(SpaceObjectBase):
    pass
    class Config:
        from_attributes = True

class PaginatedSpaceObjects(BaseModel):
    items: List[SpaceObjectResponse]
    total: int
    page: int
    size: int
