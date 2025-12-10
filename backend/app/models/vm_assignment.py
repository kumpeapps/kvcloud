"""VM assignment model for tracking VM ownership and permissions."""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class VMAssignment(Base):
    """VM Assignment model for tracking VM ownership."""
    
    __tablename__ = "vm_assignments"
    
    id = Column(Integer, primary_key=True, index=True)
    vmid = Column(Integer, index=True, nullable=False)  # Proxmox VM ID
    node_id = Column(Integer, ForeignKey("proxmox_nodes.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255))  # VM name (cached for performance)
    is_owner = Column(Boolean, default=True)  # True if creator, False if just assigned
    is_locked = Column(Boolean, default=False)  # True if VM is locked for changes
    lock_reason = Column(String(500), nullable=True)  # Reason why VM is locked
    template_vmid = Column(Integer, nullable=True)  # Source template VMID if cloned
    ip_pool_id = Column(Integer, ForeignKey("ip_pools.id"), nullable=True)  # Associated IP pool
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", backref="vm_assignments")
    node = relationship("ProxmoxNode", backref="vm_assignments")
    ip_pool = relationship("IPPool")
