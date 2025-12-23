"""VM assignment model for tracking VM ownership and permissions."""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import json


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
    
    # Provisioning automation fields
    provision_pending = Column(Boolean, default=False)  # True if reprovision needed
    pending_provision_config = Column(Text, nullable=True)  # JSON config for pending provision
    agent_installed = Column(Boolean, default=False)  # True if kvcloud-agent is installed
    agent_api_key = Column(String(128), nullable=True, unique=True, index=True)  # API key for agent authentication
    last_agent_checkin = Column(DateTime(timezone=True), nullable=True)  # Last time agent checked in
    docker_compose_files = Column(Text, nullable=True)  # JSON array of compose files for this VM
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", backref="vm_assignments")
    node = relationship("ProxmoxNode", backref="vm_assignments")
    ip_pool = relationship("IPPool")
    
    def set_pending_provision(self, config: dict):
        """Set provision as pending with given configuration."""
        self.provision_pending = True
        self.pending_provision_config = json.dumps(config)
    
    def get_pending_provision_config(self) -> dict:
        """Get pending provision configuration as dict."""
        if not self.pending_provision_config:
            return {}
        try:
            return json.loads(self.pending_provision_config)
        except json.JSONDecodeError:
            return {}
    
    def clear_pending_provision(self):
        """Clear pending provision state."""
        self.provision_pending = False
        self.pending_provision_config = None

    # Compose file helpers
    def get_compose_files(self) -> list:
        if not self.docker_compose_files:
            return []
        try:
            return json.loads(self.docker_compose_files)
        except json.JSONDecodeError:
            return []

    def set_compose_files(self, files: list):
        self.docker_compose_files = json.dumps(files)

    def add_compose_file(self, entry: dict):
        files = self.get_compose_files()
        files.append(entry)
        self.set_compose_files(files)
