from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func
from ..core.database import Base


class AuditLog(Base):
    """Model for audit logs - tracking all user actions."""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Who performed the action
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # nullable for system/anonymous actions
    username = Column(String, nullable=False, index=True)
    
    # What action was performed
    action = Column(String, nullable=False, index=True)  # 'create', 'read', 'update', 'delete', 'start', 'stop', etc.
    resource_type = Column(String, nullable=False, index=True)  # 'vm', 'cluster', 'user', 'backup', etc.
    resource_id = Column(String, nullable=True, index=True)  # Resource identifier (e.g., vmid, user_id, etc.)
    resource_name = Column(String, nullable=True)
    
    # Request details
    endpoint = Column(String, nullable=False)  # API endpoint
    method = Column(String, nullable=False)  # HTTP method (GET, POST, PUT, DELETE)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    
    # Action details
    description = Column(String, nullable=True)  # Human-readable description
    request_data = Column(JSON, nullable=True)  # Request body/params
    response_status = Column(Integer, nullable=True)  # HTTP status code
    response_data = Column(JSON, nullable=True)  # Response summary
    
    # Success/Failure
    status = Column(String, nullable=False, default="success")  # 'success', 'failed', 'error'
    error_message = Column(String, nullable=True)
    
    # Metadata
    duration_ms = Column(Integer, nullable=True)  # Request duration in milliseconds
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    
    # Additional context
    node_id = Column(Integer, nullable=True)  # For VM operations
    cluster_id = Column(Integer, nullable=True)  # For cluster operations
    tags = Column(JSON, nullable=True)  # Additional tags for filtering
