from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base


class VPSPlan(Base):
    __tablename__ = "vps_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(String(1024), nullable=True)

    # VM limits per instance
    cpu_cores = Column(Integer, nullable=False, default=1)
    ram_mb = Column(Integer, nullable=False, default=512)
    disk_gb = Column(Integer, nullable=False, default=10)

    # Options
    virtio = Column(Boolean, nullable=False, default=True)
    scsi = Column(Boolean, nullable=False, default=False)
    enable_vnc = Column(Boolean, nullable=False, default=False)

    # Group constraints (FKs by id stored here for simplicity)
    ip_group_id = Column(Integer, nullable=True)
    iso_group_id = Column(Integer, nullable=True)
