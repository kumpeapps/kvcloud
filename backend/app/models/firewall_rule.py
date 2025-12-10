from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from ..core.database import Base


class FirewallRule(Base):
    """Model for VM firewall rules."""
    __tablename__ = "firewall_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    vmid = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, ForeignKey("proxmox_nodes.id"), nullable=False, index=True)
    
    # Rule configuration
    type = Column(String, nullable=False)  # 'in' or 'out'
    action = Column(String, nullable=False)  # 'ACCEPT', 'DROP', 'REJECT'
    enabled = Column(Boolean, default=True, nullable=False)
    
    # Network configuration
    protocol = Column(String, nullable=True)  # 'tcp', 'udp', 'icmp', 'any'
    source = Column(String, nullable=True)  # Source IP/CIDR
    dest = Column(String, nullable=True)  # Destination IP/CIDR
    sport = Column(String, nullable=True)  # Source port or range (e.g., '80' or '1000:2000')
    dport = Column(String, nullable=True)  # Destination port or range
    
    # Interface
    iface = Column(String, nullable=True)  # Network interface (e.g., 'net0')
    
    # Additional options
    comment = Column(String, nullable=True)
    log = Column(String, nullable=True)  # 'nolog', 'info', 'warning', 'err'
    macro = Column(String, nullable=True)  # Predefined macro (e.g., 'HTTP', 'HTTPS')
    
    # Position in rule list
    pos = Column(Integer, nullable=True)  # Position/order in Proxmox firewall
    
    # Metadata
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, onupdate=func.now(), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
