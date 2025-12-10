from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from ..core.database import Base


class UserQuota(Base):
    """Model for user resource quotas."""
    __tablename__ = "user_quotas"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    
    # VM quotas
    max_vms = Column(Integer, nullable=True)  # Maximum number of VMs
    max_running_vms = Column(Integer, nullable=True)  # Maximum running VMs simultaneously
    
    # Resource quotas per VM
    max_cpu_per_vm = Column(Integer, nullable=True)  # Maximum CPU cores per VM
    max_memory_per_vm = Column(Integer, nullable=True)  # Maximum memory (MB) per VM
    max_disk_per_vm = Column(Integer, nullable=True)  # Maximum disk (GB) per VM
    
    # Total resource quotas
    max_total_cpu = Column(Integer, nullable=True)  # Total CPU cores across all VMs
    max_total_memory = Column(Integer, nullable=True)  # Total memory (MB) across all VMs
    max_total_disk = Column(Integer, nullable=True)  # Total disk (GB) across all VMs
    
    # Storage quotas
    max_snapshots_per_vm = Column(Integer, nullable=True)  # Maximum snapshots per VM
    max_backups = Column(Integer, nullable=True)  # Maximum backups
    
    # Network quotas
    max_network_interfaces_per_vm = Column(Integer, nullable=True)  # Max NICs per VM
    max_ip_addresses = Column(Integer, nullable=True)  # Max allocated IPs
    
    # Feature flags
    can_create_templates = Column(Boolean, default=False, nullable=False)
    can_clone_vms = Column(Boolean, default=True, nullable=False)
    can_use_iso_library = Column(Boolean, default=True, nullable=False)
    can_access_console = Column(Boolean, default=True, nullable=False)
    
    # Metadata
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, onupdate=func.now(), nullable=True)
    notes = Column(String, nullable=True)
    
    # Current usage (cached for performance)
    current_vms = Column(Integer, default=0, nullable=False)
    current_running_vms = Column(Integer, default=0, nullable=False)
    current_total_cpu = Column(Integer, default=0, nullable=False)
    current_total_memory = Column(Integer, default=0, nullable=False)
    current_total_disk = Column(Integer, default=0, nullable=False)
    last_usage_update = Column(DateTime, nullable=True)
