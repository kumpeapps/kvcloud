"""VM User model for managing users created inside VMs."""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Table, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


# Association table for VmUser and UserSshKey many-to-many relationship
vm_user_ssh_keys = Table(
    'vm_user_ssh_keys',
    Base.metadata,
    Column('vm_user_id', Integer, ForeignKey('vm_users.id', ondelete='CASCADE'), primary_key=True),
    Column('user_ssh_key_id', Integer, ForeignKey('user_ssh_keys.id', ondelete='CASCADE'), primary_key=True)
)


class VmUser(Base):
    """User account to be created inside a VM via cloud-init."""
    __tablename__ = "vm_users"

    id = Column(Integer, primary_key=True, index=True)
    vm_id = Column(Integer, nullable=False, index=True)  # Proxmox VM ID
    node_id = Column(Integer, ForeignKey("proxmox_clusters.id", ondelete="CASCADE"), nullable=False)
    username = Column(String(255), nullable=False)  # e.g., "ubuntu", "admin", "deploy"
    password = Column(String(255), nullable=True)  # Optional password (usually SSH keys preferred)
    shell = Column(String(255), default="/bin/bash")  # Login shell
    sudo_access = Column(Boolean, default=True)  # Whether user can run sudo
    description = Column(Text, nullable=True)  # e.g., "Default cloud user"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships - many-to-many with UserSshKey
    ssh_keys = relationship("UserSshKey", secondary=vm_user_ssh_keys, back_populates="vm_users")


class VmNetworkConfig(Base):
    """Network configuration for a VM (IP, gateway, DNS)."""
    __tablename__ = "vm_network_configs"

    id = Column(Integer, primary_key=True, index=True)
    vm_id = Column(Integer, nullable=False, unique=True, index=True)  # Proxmox VM ID
    node_id = Column(Integer, ForeignKey("proxmox_clusters.id", ondelete="CASCADE"), nullable=False)
    ip_address = Column(String(45), nullable=True)  # Assigned IP
    ip_pool_id = Column(Integer, ForeignKey("ip_pools.id", ondelete="SET NULL"), nullable=True)  # Which pool it came from
    gateway = Column(String(45), nullable=True)  # From IP Pool or override
    dns_servers = Column(String(255), nullable=True)  # Comma-separated, from IP Pool or override
    hostname = Column(String(255), nullable=True)  # FQDN for the VM
    domain_search = Column(String(255), nullable=True)  # Search domain for DNS
    mac_address = Column(String(17), nullable=True)  # MAC address format: XX:XX:XX:XX:XX:XX
    enable_dhcp = Column(Boolean, default=False)  # Use DHCP instead of static IP
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    ip_pool = relationship("IPPool", foreign_keys=[ip_pool_id])
    cluster = relationship("ProxmoxCluster", foreign_keys=[node_id])
