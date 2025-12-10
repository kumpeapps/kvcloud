"""User SSH Key model for managing SSH keys per user."""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class UserSshKey(Base):
    """SSH key stored per user account."""
    __tablename__ = "user_ssh_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)  # e.g., "home-laptop", "work-desktop"
    public_key = Column(Text, nullable=False)  # The actual SSH public key
    fingerprint = Column(String(255), nullable=True)  # SSH key fingerprint for identification
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    vm_users = relationship("VmUser", secondary="vm_user_ssh_keys", back_populates="ssh_keys")
