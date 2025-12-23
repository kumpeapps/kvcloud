"""API endpoints for VM user management and network configuration."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.models.vm_user import VmUser, VmNetworkConfig, vm_user_ssh_keys
from app.models.user_ssh_key import UserSshKey
from app.models.ip_pool import IPAddress, IPPool


router = APIRouter(prefix="/vm-users", tags=["vm-users"])


class VmUserCreate(BaseModel):
    vm_id: int
    node_id: int
    username: str
    password: str | None = None
    shell: str = "/bin/bash"
    sudo_access: bool = True
    description: str | None = None
    ssh_key_ids: list[int] | None = None  # List of UserSshKey IDs to assign


class VmUserUpdate(BaseModel):
    username: str | None = None
    password: str | None = None
    shell: str | None = None
    sudo_access: bool | None = None
    description: str | None = None
    ssh_key_ids: list[int] | None = None


@router.post("/")
@require_permission("vm", "manage_users")
async def create_vm_user(data: VmUserCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Create a new user account for a VM."""
    vm_user = VmUser(
        vm_id=data.vm_id,
        node_id=data.node_id,
        username=data.username,
        password=data.password,
        shell=data.shell,
        sudo_access=data.sudo_access,
        description=data.description
    )
    
    # Assign SSH keys if provided
    if data.ssh_key_ids:
        for key_id in data.ssh_key_ids:
            result = await db.execute(
                select(UserSshKey).where(UserSshKey.id == key_id, UserSshKey.user_id == current_user.id)
            )
            key = result.scalar_one_or_none()
            if key:
                vm_user.ssh_keys.append(key)
    
    db.add(vm_user)
    await db.commit()
    await db.refresh(vm_user)
    return {"id": vm_user.id, "username": vm_user.username}


@router.get("/vm/{vm_id}")
@require_permission("vm", "read")
async def list_vm_users(vm_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """List all users for a specific VM."""
    result = await db.execute(select(VmUser).where(VmUser.vm_id == vm_id))
    users = result.scalars().all()
    
    response = []
    for user in users:
        ssh_keys = []
        for key in user.ssh_keys:
            ssh_keys.append({
                "id": key.id,
                "name": key.name,
                "fingerprint": key.fingerprint
            })
        
        response.append({
            "id": user.id,
            "username": user.username,
            "shell": user.shell,
            "sudo_access": user.sudo_access,
            "description": user.description,
            "is_active": user.is_active,
            "ssh_keys": ssh_keys,
            "created_at": user.created_at.isoformat() if user.created_at else None
        })
    
    return {"users": response}


@router.put("/{user_id}")
@require_permission("vm", "manage_users")
async def update_vm_user(user_id: int, data: VmUserUpdate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Update a VM user account."""
    result = await db.execute(select(VmUser).where(VmUser.id == user_id))
    vm_user = result.scalar_one_or_none()
    if not vm_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM user not found")
    
    # Track if changes require reprovisioning
    reprovision_needed = False
    
    if data.username is not None:
        vm_user.username = data.username
    if data.password is not None:
        vm_user.password = data.password
        reprovision_needed = True  # Password change requires reprovision
    if data.shell is not None:
        vm_user.shell = data.shell
    if data.sudo_access is not None:
        vm_user.sudo_access = data.sudo_access
    if data.description is not None:
        vm_user.description = data.description
    
    # Update SSH keys if provided
    if data.ssh_key_ids is not None:
        vm_user.ssh_keys.clear()
        for key_id in data.ssh_key_ids:
            result = await db.execute(
                select(UserSshKey).where(UserSshKey.id == key_id, UserSshKey.user_id == current_user.id)
            )
            key = result.scalar_one_or_none()
            if key:
                vm_user.ssh_keys.append(key)
        reprovision_needed = True  # SSH key change requires reprovision
    
    db.add(vm_user)
    await db.commit()
    
    # Trigger reprovision if credentials changed
    if reprovision_needed:
        from app.models.vm_assignment import VMAssignment
        stmt = select(VMAssignment).where(VMAssignment.vmid == vm_user.vm_id)
        result = await db.execute(stmt)
        assignment = result.scalar_one_or_none()
        
        if assignment and assignment.agent_installed:
            # Build provision config for user update
            ssh_keys = [key.public_key for key in vm_user.ssh_keys]
            provision_config = {
                "default_user": vm_user.username,
                "default_password": vm_user.password if data.password else None,
                "ssh_authorized_keys": ssh_keys if ssh_keys else None,
                "ssh_pwauth": True,
            }
            
            assignment.provision_pending = True
            assignment.set_pending_provision(provision_config)
            await db.commit()
            print(f"[Auto-Reprovision] User credentials changed for VM {vm_user.vm_id}, reprovision queued")
    
    return {"message": "VM user updated"}


@router.delete("/{user_id}")
@require_permission("vm", "manage_users")
async def delete_vm_user(user_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Delete a VM user account."""
    result = await db.execute(select(VmUser).where(VmUser.id == user_id))
    vm_user = result.scalar_one_or_none()
    if not vm_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VM user not found")
    
    await db.delete(vm_user)
    await db.commit()
    return {"message": "VM user deleted"}


class VmNetworkConfigCreate(BaseModel):
    vm_id: int
    node_id: int
    ip_address: str | None = None
    ip_pool_id: int | None = None
    gateway: str | None = None
    dns_servers: str | None = None
    hostname: str | None = None
    domain_search: str | None = None
    mac_address: str | None = None
    enable_dhcp: bool = False


@router.post("/network")
@require_permission("vm", "manage_config")
async def set_vm_network_config(data: VmNetworkConfigCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Set or update network configuration for a VM."""
    # Check if config already exists
    result = await db.execute(select(VmNetworkConfig).where(VmNetworkConfig.vm_id == data.vm_id))
    config = result.scalar_one_or_none()
    
    # Track if we're making changes that require reprovisioning
    reprovision_needed = False
    
    if config:
        # Update existing - check if critical fields changed
        if data.ip_address is not None and config.ip_address != data.ip_address:
            config.ip_address = data.ip_address
            reprovision_needed = True
        if data.ip_pool_id is not None:
            config.ip_pool_id = data.ip_pool_id
        if data.gateway is not None and config.gateway != data.gateway:
            config.gateway = data.gateway
            reprovision_needed = True
        if data.dns_servers is not None and config.dns_servers != data.dns_servers:
            config.dns_servers = data.dns_servers
            reprovision_needed = True
        if data.hostname is not None and config.hostname != data.hostname:
            config.hostname = data.hostname
            reprovision_needed = True
        if data.domain_search is not None:
            config.domain_search = data.domain_search
        if data.mac_address is not None:
            config.mac_address = data.mac_address
        config.enable_dhcp = data.enable_dhcp
    else:
        # Create new - will need provisioning
        config = VmNetworkConfig(**data.model_dump())
        reprovision_needed = True
    
    db.add(config)
    await db.commit()
    await db.refresh(config)
    
    # Trigger reprovision if network config changed
    if reprovision_needed:
        from app.models.vm_assignment import VMAssignment
        stmt = select(VMAssignment).where(VMAssignment.vmid == data.vm_id)
        result = await db.execute(stmt)
        assignment = result.scalar_one_or_none()
        
        if assignment and assignment.agent_installed:
            # Build provision config (simplified version for network-only changes)
            provision_config = {
                "hostname": config.hostname,
                "network_yaml": None,  # Will be generated by agent
                "write_network": True,
            }
            
            assignment.set_pending_provision(provision_config)
            await db.commit()
            print(f"[Auto-Reprovision] Network config changed for VM {data.vm_id}, reprovision queued")
    
    return {"id": config.id, "vm_id": config.vm_id}


@router.get("/network/{vm_id}")
@require_permission("vm", "read")
async def get_vm_network_config(vm_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Get network configuration for a VM.
    
    First checks vm_network_configs table. If not found, fallback to checking
    ip_addresses table and derive config from the IP pool.
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Getting network config for VM {vm_id}")
    
    # First, try to get from vm_network_configs table
    result = await db.execute(select(VmNetworkConfig).where(VmNetworkConfig.vm_id == vm_id))
    config = result.scalar_one_or_none()
    
    if config:
        config_dict = {
            "id": config.id,
            "vm_id": config.vm_id,
            "ip_address": config.ip_address,
            "ip_pool_id": config.ip_pool_id,
            "gateway": config.gateway,
            "dns_servers": config.dns_servers,
            "hostname": config.hostname,
            "domain_search": config.domain_search,
            "mac_address": config.mac_address,
            "enable_dhcp": config.enable_dhcp
        }
        logger.info(f"Found vm_network_config for VM {vm_id}: {config_dict}")
        return {"config": config_dict}
    
    # Fallback: check if there's an allocated IP in ip_addresses table
    logger.info(f"No vm_network_config found for VM {vm_id}, checking ip_addresses table")
    # Choose the most recently allocated IP as the primary fallback
    result = await db.execute(
        select(IPAddress)
        .where(IPAddress.vm_id == vm_id, IPAddress.is_allocated == True)
        .order_by(IPAddress.allocated_at.desc())
    )
    ip_address = result.scalar_one_or_none()
    
    if not ip_address:
        logger.info(f"No allocated IP found for VM {vm_id}")
        return {"config": None}
    
    # Fetch the pool to get gateway and DNS settings
    result = await db.execute(select(IPPool).where(IPPool.id == ip_address.pool_id))
    pool = result.scalar_one_or_none()
    
    if not pool:
        logger.warning(f"IP address found but pool {ip_address.pool_id} not found")
        return {"config": None}
    
    # Construct a derived config from the IP allocation and pool
    config_dict = {
        "id": None,  # Not persisted in vm_network_configs
        "vm_id": vm_id,
        "ip_address": ip_address.ip_address,
        "ip_pool_id": pool.id,
        "gateway": pool.gateway,
        "dns_servers": pool.name_servers,
        "hostname": ip_address.hostname or "",
        "domain_search": pool.name_servers,  # Use name_servers from pool as domain search fallback
        "mac_address": ip_address.mac_address or "",
        "enable_dhcp": False  # Static IP from allocation
    }
    logger.info(f"Derived network config from IP allocation for VM {vm_id}: {config_dict}")
    
    return {"config": config_dict}
