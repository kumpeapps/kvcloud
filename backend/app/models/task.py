"""Task model for tracking long-running operations."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, JSON, ForeignKey, Text, Index
from sqlalchemy.sql import func
from ..core.database import Base


class Task(Base):
    """Model for tracking long-running asynchronous operations."""
    
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Task identification
    upid = Column(String(255), nullable=True, unique=True, index=True)  # Proxmox UPID for background tasks
    task_type = Column(String(50), nullable=False, index=True)  # backup, clone, migration, restore, upload, etc.
    status = Column(String(20), nullable=False, default="pending", index=True)  # pending, running, completed, failed, cancelled
    
    # User and resource info
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    username = Column(String(255), nullable=False)
    
    # Resource being operated on
    resource_type = Column(String(50), nullable=True)  # vm, backup, iso, node, etc.
    resource_id = Column(String(255), nullable=True, index=True)
    resource_name = Column(String(255), nullable=True)
    
    # Task operation details
    operation = Column(String(255), nullable=False)  # e.g., "Create Backup", "Clone VM", "Upload ISO"
    description = Column(Text, nullable=True)  # Detailed description
    
    # Progress tracking
    progress = Column(Integer, default=0)  # 0-100 percentage
    progress_details = Column(JSON, nullable=True)  # Additional progress info: {"current": 5, "total": 10}
    
    # Timing
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration_ms = Column(Float, nullable=True)  # Total duration in milliseconds
    
    # Results
    result = Column(JSON, nullable=True)  # Result data (e.g., backup ID, cloned VM ID)
    error_message = Column(Text, nullable=True)
    error_details = Column(JSON, nullable=True)
    
    # Context
    node_id = Column(Integer, nullable=True)  # Proxmox node
    cluster_id = Column(Integer, nullable=True)  # Cluster context
    parameters = Column(JSON, nullable=True)  # Task parameters (backup mode, compression, etc.)
    
    # Additional metadata
    ip_address = Column(String(45), nullable=True)  # Client IP that initiated the task
    tags = Column(JSON, nullable=True)  # Custom tags for categorization
    
    __table_args__ = (
        Index('idx_user_tasks', 'user_id', 'created_at'),
        Index('idx_status_created', 'status', 'created_at'),
        Index('idx_resource_task', 'resource_type', 'resource_id'),
    )
    
    def __repr__(self):
        return f"<Task(id={self.id}, type={self.task_type}, status={self.status}, progress={self.progress}%)>"
