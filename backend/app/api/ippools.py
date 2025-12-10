"""IP Pool management API endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel, validator
import ipaddress
from datetime import datetime

from app.core.database import get_db
from app.models.user import User
from app.models.ip_pool import IPPool, IPAddress, IPLog
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission

router = APIRouter(prefix="/ippools", tags=["ippools"])


# Pydantic models
class IPPoolCreate(BaseModel):
    name: str
    gateway: str
    netmask: str
    first_ip: str
    last_ip: str
    bridge: str = "vmbr0"
    vlan_tag: Optional[int] = None
    name_servers: Optional[str] = None
    routing_prefix: Optional[str] = None
    description: Optional[str] = None
    
    @validator('gateway', 'first_ip', 'last_ip')
    def validate_ip(cls, v):
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"Invalid IP address: {v}")
        return v


class IPPoolResponse(BaseModel):
    id: int
    name: str
    gateway: str
    netmask: str
    first_ip: str
    last_ip: str
    bridge: str
    vlan_tag: Optional[int]
    name_servers: Optional[str]
    is_active: bool
    routing_prefix: Optional[str]
    description: Optional[str]
    total_ips: int = 0
    allocated_ips: int = 0
    available_ips: int = 0
    created_at: datetime
    
    class Config:
        from_attributes = True


class IPAddressResponse(BaseModel):
    id: int
    pool_id: int
    ip_address: str
    is_allocated: bool
    vm_id: Optional[int]
    user_id: Optional[int]
    hostname: Optional[str]
    mac_address: Optional[str]
    allocated_at: Optional[datetime]
    notes: Optional[str]
    
    class Config:
        from_attributes = True


class IPAllocateRequest(BaseModel):
    ip_address: str
    vm_id: int
    hostname: Optional[str] = None
    mac_address: Optional[str] = None
    notes: Optional[str] = None


@router.get("/", response_model=List[IPPoolResponse])
@require_permission("ippool", "read")
async def list_ip_pools(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all IP pools with statistics."""
    result = await db.execute(select(IPPool))
    pools = result.scalars().all()
    
    pool_responses = []
    for pool in pools:
        # Count IPs
        total_query = await db.execute(
            select(func.count(IPAddress.id)).where(IPAddress.pool_id == pool.id)
        )
        total = total_query.scalar() or 0
        
        allocated_query = await db.execute(
            select(func.count(IPAddress.id)).where(
                and_(IPAddress.pool_id == pool.id, IPAddress.is_allocated == True)
            )
        )
        allocated = allocated_query.scalar() or 0
        
        pool_dict = {
            "id": pool.id,
            "name": pool.name,
            "gateway": pool.gateway,
            "netmask": pool.netmask,
            "first_ip": pool.first_ip,
            "last_ip": pool.last_ip,
            "bridge": pool.bridge,
            "vlan_tag": pool.vlan_tag,
            "name_servers": pool.name_servers,
            "is_active": pool.is_active,
            "routing_prefix": pool.routing_prefix,
            "description": pool.description,
            "total_ips": total,
            "allocated_ips": allocated,
            "available_ips": total - allocated,
            "created_at": pool.created_at
        }
        pool_responses.append(IPPoolResponse(**pool_dict))
    
    return pool_responses


@router.post("/", response_model=IPPoolResponse)
@require_permission("ippool", "create")
async def create_ip_pool(
    pool_data: IPPoolCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new IP pool and generate IP addresses."""
    # Check for duplicate name
    existing = await db.execute(select(IPPool).where(IPPool.name == pool_data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"IP pool with name '{pool_data.name}' already exists"
        )
    
    # Create pool
    pool = IPPool(**pool_data.dict())
    db.add(pool)
    await db.flush()
    
    # Generate IP addresses in range
    try:
        first = ipaddress.ip_address(pool_data.first_ip)
        last = ipaddress.ip_address(pool_data.last_ip)
        
        if first > last:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="first_ip must be less than or equal to last_ip"
            )
        
        # Generate IPs
        current_ip = first
        ip_objects = []
        while current_ip <= last:
            ip_obj = IPAddress(
                pool_id=pool.id,
                ip_address=str(current_ip),
                is_allocated=False
            )
            ip_objects.append(ip_obj)
            current_ip += 1
            
            # Limit to prevent memory issues
            if len(ip_objects) > 10000:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="IP range too large (max 10,000 IPs)"
                )
        
        db.add_all(ip_objects)
        await db.commit()
        await db.refresh(pool)
        
        return IPPoolResponse(
            **pool.__dict__,
            total_ips=len(ip_objects),
            allocated_ips=0,
            available_ips=len(ip_objects)
        )
    
    except ValueError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid IP address format: {str(e)}"
        )


@router.get("/{pool_id}/ips", response_model=List[IPAddressResponse])
@require_permission("ippool", "read")
async def list_pool_ips(
    pool_id: int,
    allocated_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List IP addresses in a pool."""
    # Check pool exists
    pool = await db.get(IPPool, pool_id)
    if not pool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="IP pool not found"
        )
    
    query = select(IPAddress).where(IPAddress.pool_id == pool_id)
    if allocated_only:
        query = query.where(IPAddress.is_allocated == True)
    
    result = await db.execute(query.order_by(IPAddress.ip_address))
    return result.scalars().all()


@router.post("/{pool_id}/allocate", response_model=IPAddressResponse)
@require_permission("ippool", "allocate")
async def allocate_ip(
    pool_id: int,
    allocation_data: IPAllocateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Allocate an IP address to a VM."""
    # Find the IP
    result = await db.execute(
        select(IPAddress).where(
            and_(
                IPAddress.pool_id == pool_id,
                IPAddress.ip_address == allocation_data.ip_address,
                IPAddress.is_allocated == False
            )
        )
    )
    ip_obj = result.scalar_one_or_none()
    
    if not ip_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="IP address not available or not found in this pool"
        )
    
    # Allocate it
    ip_obj.is_allocated = True
    ip_obj.vm_id = allocation_data.vm_id
    ip_obj.user_id = current_user.id
    ip_obj.hostname = allocation_data.hostname
    ip_obj.mac_address = allocation_data.mac_address
    ip_obj.notes = allocation_data.notes
    ip_obj.allocated_at = datetime.utcnow()
    
    # Log the allocation
    log_entry = IPLog(
        ip_address=ip_obj.ip_address,
        pool_id=pool_id,
        user_id=current_user.id,
        vm_id=allocation_data.vm_id,
        action="allocated",
        notes=allocation_data.notes
    )
    db.add(log_entry)
    
    await db.commit()
    await db.refresh(ip_obj)
    return ip_obj


@router.post("/{pool_id}/deallocate/{ip_id}")
@require_permission("ippool", "deallocate")
async def deallocate_ip(
    pool_id: int,
    ip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deallocate (release) an IP address."""
    ip_obj = await db.get(IPAddress, ip_id)
    
    if not ip_obj or ip_obj.pool_id != pool_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="IP address not found in this pool"
        )
    
    if not ip_obj.is_allocated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="IP address is not allocated"
        )
    
    # Log the deallocation
    log_entry = IPLog(
        ip_address=ip_obj.ip_address,
        pool_id=pool_id,
        user_id=current_user.id,
        vm_id=ip_obj.vm_id,
        action="deallocated",
        notes=f"Deallocated from VM {ip_obj.vm_id}"
    )
    db.add(log_entry)
    
    # Reset IP
    ip_obj.is_allocated = False
    ip_obj.vm_id = None
    ip_obj.hostname = None
    ip_obj.mac_address = None
    ip_obj.allocated_at = None
    ip_obj.notes = None
    
    await db.commit()
    return {"message": "IP address deallocated successfully"}


@router.delete("/{pool_id}")
@require_permission("ippool", "delete")
async def delete_ip_pool(
    pool_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an IP pool and all its addresses."""
    pool = await db.get(IPPool, pool_id)
    if not pool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="IP pool not found"
        )
    
    # Check for allocated IPs
    result = await db.execute(
        select(func.count(IPAddress.id)).where(
            and_(IPAddress.pool_id == pool_id, IPAddress.is_allocated == True)
        )
    )
    allocated_count = result.scalar() or 0
    
    if allocated_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete pool with {allocated_count} allocated IP(s). Please deallocate them first."
        )
    
    await db.delete(pool)
    await db.commit()
    return {"message": "IP pool deleted successfully"}
