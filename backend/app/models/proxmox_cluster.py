"""Proxmox cluster and node models."""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ProxmoxCluster(Base):
    """Proxmox cluster model."""
    
    __tablename__ = "proxmox_clusters"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    nodes = relationship("ProxmoxNode", back_populates="cluster", cascade="all, delete-orphan")


class ProxmoxNode(Base):
    """Proxmox node model."""
    
    __tablename__ = "proxmox_nodes"
    
    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("proxmox_clusters.id"), nullable=False)
    name = Column(String(100), nullable=False)
    host = Column(String(255), nullable=False)
    port = Column(Integer, default=8006)
    username = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)  # Should be encrypted
    ssh_username = Column(String(100), default="root")
    ssh_password = Column(String(255), nullable=True)  # For SSH access (cloud image downloads)
    verify_ssl = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    cluster = relationship("ProxmoxCluster", back_populates="nodes")
