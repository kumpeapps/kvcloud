from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class CloudLicensePlan(Base):
    __tablename__ = "cloud_license_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(String(1024), nullable=True)

    # Overall quotas
    max_vms = Column(Integer, nullable=False, default=0)
    max_cpu_cores = Column(Integer, nullable=False, default=0)
    max_ram_mb = Column(Integer, nullable=False, default=0)
    max_disk_gb = Column(Integer, nullable=False, default=0)

    # Feature limits
    max_snapshots = Column(Integer, nullable=False, default=0)
    max_backups = Column(Integer, nullable=False, default=0)
    max_isos = Column(Integer, nullable=False, default=0)
    max_ips = Column(Integer, nullable=False, default=0)

    # Self-approval permission
    allow_self_approval = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class UserCloudLicense(Base):
    __tablename__ = "user_cloud_licenses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    plan_id = Column(Integer, nullable=False, index=True)
    # Optional: per-user overrides
    overrides_json = Column(String(4000), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
