from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base


class VMRequest(Base):
    __tablename__ = "vm_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, nullable=True)
    plan_id = Column(Integer, nullable=False)
    cloud_init_profile_id = Column(Integer, nullable=True)
    recipe_id = Column(Integer, nullable=True)

    status = Column(String(32), nullable=False, default="pending")  # pending, approved, rejected, fulfilled
    notes = Column(String(1024), nullable=True)
    auto_approve = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    fulfilled_at = Column(DateTime(timezone=True), nullable=True)
