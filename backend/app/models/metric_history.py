from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from ..core.database import Base


class MetricHistory(Base):
    """Model for storing historical metrics data from Proxmox RRD."""
    __tablename__ = "metric_history"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Resource identification
    resource_type = Column(String, nullable=False, index=True)  # 'node', 'vm', 'storage'
    resource_id = Column(String, nullable=False, index=True)  # Node name, VM ID, storage name
    node_id = Column(Integer, ForeignKey("proxmox_nodes.id"), nullable=True, index=True)
    
    # Time aggregation
    timeframe = Column(String, nullable=False, index=True)  # 'hour', 'day', 'week', 'month', 'year'
    timestamp = Column(DateTime, nullable=False, index=True)  # Time point for this metric
    
    # CPU metrics
    cpu_usage = Column(Float, nullable=True)  # CPU usage percentage
    cpu_iowait = Column(Float, nullable=True)  # CPU I/O wait percentage
    
    # Memory metrics
    memory_used = Column(Float, nullable=True)  # Memory used in bytes
    memory_total = Column(Float, nullable=True)  # Total memory in bytes
    memory_usage_percent = Column(Float, nullable=True)  # Memory usage percentage
    
    # Disk metrics
    disk_read_bytes = Column(Float, nullable=True)  # Disk read bytes/sec
    disk_write_bytes = Column(Float, nullable=True)  # Disk write bytes/sec
    disk_used = Column(Float, nullable=True)  # Disk used in bytes
    disk_total = Column(Float, nullable=True)  # Total disk in bytes
    
    # Network metrics
    network_in_bytes = Column(Float, nullable=True)  # Network in bytes/sec
    network_out_bytes = Column(Float, nullable=True)  # Network out bytes/sec
    
    # Storage-specific metrics
    storage_used = Column(Float, nullable=True)  # Storage used in bytes
    storage_total = Column(Float, nullable=True)  # Total storage in bytes
    storage_usage_percent = Column(Float, nullable=True)  # Storage usage percentage
    
    # Additional metrics as JSON for flexibility
    additional_metrics = Column(JSON, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
