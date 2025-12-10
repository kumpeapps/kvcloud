"""IP Pool and IP address models for IP management."""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class IPPool(Base):
    """IP address pool."""
    __tablename__ = "ip_pools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    gateway = Column(String(45), nullable=False)  # IPv4 or IPv6
    netmask = Column(String(45), nullable=False)  # e.g., 255.255.255.0 or /24
    first_ip = Column(String(45), nullable=False)
    last_ip = Column(String(45), nullable=False)
    bridge = Column(String(50), nullable=False, default="vmbr0")  # Proxmox bridge
    vlan_tag = Column(Integer, nullable=True)  # Optional VLAN tag
    name_servers = Column(String(255), nullable=True)  # Comma-separated DNS servers
    is_active = Column(Boolean, default=True)
    routing_prefix = Column(String(50), nullable=True)  # For IPv6
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    ips = relationship("IPAddress", back_populates="pool", cascade="all, delete-orphan")


class IPAddress(Base):
    """Individual IP address."""
    __tablename__ = "ip_addresses"

    id = Column(Integer, primary_key=True, index=True)
    pool_id = Column(Integer, ForeignKey("ip_pools.id", ondelete="CASCADE"), nullable=False)
    ip_address = Column(String(45), unique=True, nullable=False, index=True)
    is_allocated = Column(Boolean, default=False)
    vm_id = Column(Integer, nullable=True)  # VMID if assigned to a VM
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    hostname = Column(String(255), nullable=True)
    mac_address = Column(String(17), nullable=True)  # MAC address format: XX:XX:XX:XX:XX:XX
    allocated_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    pool = relationship("IPPool", back_populates="ips")
    user = relationship("User", foreign_keys=[user_id])


class IPLog(Base):
    """IP allocation/deallocation history."""
    __tablename__ = "ip_logs"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), nullable=False, index=True)
    pool_id = Column(Integer, ForeignKey("ip_pools.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    vm_id = Column(Integer, nullable=True)
    action = Column(String(20), nullable=False)  # allocated, deallocated, reserved, released
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    pool = relationship("IPPool")
    user = relationship("User")
