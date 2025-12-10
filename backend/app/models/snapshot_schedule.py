from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from ..core.database import Base


class SnapshotSchedule(Base):
    """Model for scheduled automatic snapshots."""
    __tablename__ = "snapshot_schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    vmid = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, ForeignKey("proxmox_nodes.id"), nullable=False, index=True)
    
    # Schedule configuration
    schedule_type = Column(String, nullable=False)  # 'hourly', 'daily', 'weekly', 'monthly', 'custom'
    cron_expression = Column(String, nullable=True)  # For custom schedules
    hour = Column(Integer, nullable=True)  # For daily/weekly/monthly
    minute = Column(Integer, nullable=True)
    day_of_week = Column(Integer, nullable=True)  # 0-6 for weekly (0 = Monday)
    day_of_month = Column(Integer, nullable=True)  # 1-31 for monthly
    
    # Retention policy
    retention_count = Column(Integer, default=7, nullable=False)  # Keep last N snapshots
    retention_days = Column(Integer, nullable=True)  # Alternative: Keep snapshots for N days
    
    # Naming pattern
    naming_pattern = Column(String, default="auto-{timestamp}", nullable=False)
    
    # Additional options
    description = Column(String, nullable=True)
    include_ram = Column(Boolean, default=False, nullable=False)  # Include VM RAM in snapshot
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Metadata
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, onupdate=func.now(), nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    last_status = Column(String, nullable=True)  # 'success', 'failed', 'running'
    last_error = Column(String, nullable=True)
    run_count = Column(Integer, default=0, nullable=False)
