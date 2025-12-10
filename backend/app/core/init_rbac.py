"""Initialize default RBAC policies."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.models.casbin_rule import CasbinRule
import logging

logger = logging.getLogger(__name__)


async def init_rbac_policies(db: AsyncSession):
    """Initialize default RBAC policies in database."""
    
    # Check if policies already exist
    result = await db.execute(select(CasbinRule).limit(1))
    if result.scalar_one_or_none():
        logger.info("RBAC policies already initialized")
        return
    
    logger.info("Initializing default RBAC policies...")
    
    # Default policies
    policies = [
        # Admin - full access
        CasbinRule(ptype="p", v0="admin", v1="*", v2="*"),
        
        # User - VM operations
        CasbinRule(ptype="p", v0="user", v1="vm", v2="read"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="create"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="update"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="delete"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="start"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="stop"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="restart"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="pause"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="resume"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="shutdown"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="reset"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="console"),

        # User - VM requests workflow
        CasbinRule(ptype="p", v0="user", v1="vm", v2="request"),

        # User - Plans read
        CasbinRule(ptype="p", v0="user", v1="plan", v2="read"),

        # User - Cloud-init
        CasbinRule(ptype="p", v0="user", v1="cloudinit", v2="read"),
        CasbinRule(ptype="p", v0="user", v1="cloudinit", v2="apply"),
        
        # User - SSH key management
        CasbinRule(ptype="p", v0="user", v1="user", v2="manage_ssh_keys"),
        
        # User - VM user and network management
        CasbinRule(ptype="p", v0="user", v1="vm", v2="manage_users"),
        CasbinRule(ptype="p", v0="user", v1="vm", v2="manage_config"),
        
        # User - Snapshot operations
        CasbinRule(ptype="p", v0="user", v1="snapshot", v2="read"),
        CasbinRule(ptype="p", v0="user", v1="snapshot", v2="create"),
        CasbinRule(ptype="p", v0="user", v1="snapshot", v2="delete"),
        CasbinRule(ptype="p", v0="user", v1="snapshot", v2="rollback"),
        
        # User - Node read access
        CasbinRule(ptype="p", v0="user", v1="node", v2="read"),
        
        # User - IP pool operations
        CasbinRule(ptype="p", v0="user", v1="ippool", v2="read"),
        CasbinRule(ptype="p", v0="user", v1="ippool", v2="allocate"),
        CasbinRule(ptype="p", v0="user", v1="ippool", v2="deallocate"),
        
        # User - ISO operations
        CasbinRule(ptype="p", v0="user", v1="iso", v2="read"),
        CasbinRule(ptype="p", v0="user", v1="iso", v2="upload"),
        CasbinRule(ptype="p", v0="user", v1="iso", v2="delete"),
        
        # User - Disk operations
        CasbinRule(ptype="p", v0="user", v1="disk", v2="create"),
        CasbinRule(ptype="p", v0="user", v1="disk", v2="update"),
        CasbinRule(ptype="p", v0="user", v1="disk", v2="delete"),
        
        # User - Network operations
        CasbinRule(ptype="p", v0="user", v1="network", v2="create"),
        CasbinRule(ptype="p", v0="user", v1="network", v2="update"),
        CasbinRule(ptype="p", v0="user", v1="network", v2="delete"),
        
        # Viewer - read-only access
        CasbinRule(ptype="p", v0="viewer", v1="vm", v2="read"),
        CasbinRule(ptype="p", v0="viewer", v1="snapshot", v2="read"),
        CasbinRule(ptype="p", v0="viewer", v1="cluster", v2="read"),
        CasbinRule(ptype="p", v0="viewer", v1="node", v2="read"),
        CasbinRule(ptype="p", v0="viewer", v1="iso", v2="read"),
        CasbinRule(ptype="p", v0="viewer", v1="ippool", v2="read"),
        
        # Reseller - similar to user but can manage sub-users
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="read"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="create"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="update"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="delete"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="start"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="stop"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="restart"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="pause"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="resume"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="shutdown"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="reset"),
        CasbinRule(ptype="p", v0="reseller", v1="vm", v2="console"),
        CasbinRule(ptype="p", v0="reseller", v1="disk", v2="create"),
        CasbinRule(ptype="p", v0="reseller", v1="disk", v2="update"),
        CasbinRule(ptype="p", v0="reseller", v1="disk", v2="delete"),
        CasbinRule(ptype="p", v0="reseller", v1="network", v2="create"),
        CasbinRule(ptype="p", v0="reseller", v1="network", v2="update"),
        CasbinRule(ptype="p", v0="reseller", v1="network", v2="delete"),
        CasbinRule(ptype="p", v0="reseller", v1="iso", v2="read"),
        CasbinRule(ptype="p", v0="reseller", v1="iso", v2="upload"),
        CasbinRule(ptype="p", v0="reseller", v1="iso", v2="delete"),
        CasbinRule(ptype="p", v0="reseller", v1="user", v2="create"),
        CasbinRule(ptype="p", v0="reseller", v1="user", v2="read"),
        CasbinRule(ptype="p", v0="reseller", v1="user", v2="update"),
        CasbinRule(ptype="p", v0="reseller", v1="user", v2="delete"),
    ]
    
    for policy in policies:
        db.add(policy)
    
    await db.commit()
    logger.info(f"Initialized {len(policies)} default RBAC policies")
