from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from ..core.database import Base


class BackupPlan(Base):
    """Model for scheduled automatic backups."""
    __tablename__ = "backup_plans"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    vmid = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, ForeignKey("proxmox_nodes.id"), nullable=False, index=True)
    
    # Schedule configuration
    schedule_type = Column(String, nullable=False)  # 'hourly', 'daily', 'weekly', 'monthly', 'custom'
    cron_expression = Column(String, nullable=True)
    hour = Column(Integer, nullable=True)
    minute = Column(Integer, nullable=True)
    day_of_week = Column(Integer, nullable=True)  # 0-6
    day_of_month = Column(Integer, nullable=True)  # 1-31
    
    # Backup configuration
    storage = Column(String, nullable=False)  # Where to store backups
    mode = Column(String, default="snapshot", nullable=False)  # 'snapshot', 'suspend', 'stop'
    compress = Column(String, default="zstd", nullable=False)  # Compression: 'zstd', 'gzip', 'lzo', '0' (none)
    
    # Retention policy
    retention_count = Column(Integer, default=7, nullable=False)  # Keep last N backups
    retention_days = Column(Integer, nullable=True)  # Alternative: Keep backups for N days
    
    # Notifications
    email_on_success = Column(Boolean, default=False, nullable=False)
    email_on_failure = Column(Boolean, default=True, nullable=False)
    notification_emails = Column(String, nullable=True)  # Comma-separated emails
    
    # Additional options
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Metadata
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, onupdate=func.now(), nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    last_status = Column(String, nullable=True)  # 'success', 'failed', 'running'
    last_error = Column(String, nullable=True)
    last_backup_volid = Column(String, nullable=True)  # Volume ID of last backup
    run_count = Column(Integer, default=0, nullable=False)
    success_count = Column(Integer, default=0, nullable=False)
    failure_count = Column(Integer, default=0, nullable=False)
