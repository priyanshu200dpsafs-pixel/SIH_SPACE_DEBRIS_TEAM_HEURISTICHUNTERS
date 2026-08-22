from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.db.database import Base

class SpaceObject(Base):
    __tablename__ = "space_objects"

    norad_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    object_type = Column(String, nullable=True)
    rcs_class = Column(String, nullable=True) # E.g., 'SMALL', 'MEDIUM', 'LARGE'
    bstar = Column(Float, nullable=True)
    last_updated = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships (optional for now, but useful for ORM)
    conjunctions_as_1 = relationship("Conjunction", foreign_keys="Conjunction.norad_id_1", back_populates="object_1")
    conjunctions_as_2 = relationship("Conjunction", foreign_keys="Conjunction.norad_id_2", back_populates="object_2")

class Conjunction(Base):
    __tablename__ = "conjunctions"

    id = Column(String, primary_key=True, index=True) # E.g. pair_id: "25544_48274"
    norad_id_1 = Column(Integer, ForeignKey("space_objects.norad_id"), index=True)
    norad_id_2 = Column(Integer, ForeignKey("space_objects.norad_id"), index=True)
    tca = Column(DateTime(timezone=True), index=True)
    min_dist_km = Column(Float)
    relative_speed_km_s = Column(Float)
    pc = Column(Float, index=True) # Index on Pc is good for ordering high-risk
    hbr_m = Column(Float)
    last_calculated = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    object_1 = relationship("SpaceObject", foreign_keys=[norad_id_1], back_populates="conjunctions_as_1")
    object_2 = relationship("SpaceObject", foreign_keys=[norad_id_2], back_populates="conjunctions_as_2")

    # Add a composite index on (norad_id_1, norad_id_2) to quickly find specific pairs
    __table_args__ = (
        Index("idx_conjunction_pair", "norad_id_1", "norad_id_2"),
    )
