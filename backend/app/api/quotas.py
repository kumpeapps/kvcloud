from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from ..core.database import get_db
from ..core.dependencies import get_current_user, require_permission
from ..models.user import User
from ..models.user_quota import UserQuota
from ..models.vm_assignment import VMAssignment

router = APIRouter(prefix="/quotas", tags=["quotas"])


class QuotaCreate(BaseModel):
    user_id: int
    max_vms: Optional[int] = None
    max_running_vms: Optional[int] = None
    max_cpu_per_vm: Optional[int] = None
    max_memory_per_vm: Optional[int] = None
    max_disk_per_vm: Optional[int] = None
    max_total_cpu: Optional[int] = None
    max_total_memory: Optional[int] = None
    max_total_disk: Optional[int] = None
    max_snapshots_per_vm: Optional[int] = None
    max_backups: Optional[int] = None
    max_network_interfaces_per_vm: Optional[int] = None
    max_ip_addresses: Optional[int] = None
    can_create_templates: bool = False
    can_clone_vms: bool = True
    can_use_iso_library: bool = True
    can_access_console: bool = True
    notes: Optional[str] = None


class QuotaUpdate(BaseModel):
    max_vms: Optional[int] = None
    max_running_vms: Optional[int] = None
    max_cpu_per_vm: Optional[int] = None
    max_memory_per_vm: Optional[int] = None
    max_disk_per_vm: Optional[int] = None
    max_total_cpu: Optional[int] = None
    max_total_memory: Optional[int] = None
    max_total_disk: Optional[int] = None
    max_snapshots_per_vm: Optional[int] = None
    max_backups: Optional[int] = None
    max_network_interfaces_per_vm: Optional[int] = None
    max_ip_addresses: Optional[int] = None
    can_create_templates: Optional[bool] = None
    can_clone_vms: Optional[bool] = None
    can_use_iso_library: Optional[bool] = None
    can_access_console: Optional[bool] = None
    notes: Optional[str] = None


class QuotaResponse(BaseModel):
    id: int
    user_id: int
    max_vms: Optional[int]
    max_running_vms: Optional[int]
    max_cpu_per_vm: Optional[int]
    max_memory_per_vm: Optional[int]
    max_disk_per_vm: Optional[int]
    max_total_cpu: Optional[int]
    max_total_memory: Optional[int]
    max_total_disk: Optional[int]
    max_snapshots_per_vm: Optional[int]
    max_backups: Optional[int]
    max_network_interfaces_per_vm: Optional[int]
    max_ip_addresses: Optional[int]
    can_create_templates: bool
    can_clone_vms: bool
    can_use_iso_library: bool
    can_access_console: bool
    notes: Optional[str]
    current_vms: int
    current_running_vms: int
    current_total_cpu: int
    current_total_memory: int
    current_total_disk: int
    last_usage_update: Optional[str]
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


@router.get("/user/{user_id}", response_model=QuotaResponse)
@require_permission("quota", "read")
async def get_user_quota(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get quota for a specific user."""
    # Users can view their own quota, admins can view any
    if user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this user's quota"
        )
    
    result = await db.execute(
        select(UserQuota).where(UserQuota.user_id == user_id)
    )
    quota = result.scalar_one_or_none()
    
    if not quota:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quota not found for this user"
        )
    
    return QuotaResponse(
        id=quota.id,
        user_id=quota.user_id,
        max_vms=quota.max_vms,
        max_running_vms=quota.max_running_vms,
        max_cpu_per_vm=quota.max_cpu_per_vm,
        max_memory_per_vm=quota.max_memory_per_vm,
        max_disk_per_vm=quota.max_disk_per_vm,
        max_total_cpu=quota.max_total_cpu,
        max_total_memory=quota.max_total_memory,
        max_total_disk=quota.max_total_disk,
        max_snapshots_per_vm=quota.max_snapshots_per_vm,
        max_backups=quota.max_backups,
        max_network_interfaces_per_vm=quota.max_network_interfaces_per_vm,
        max_ip_addresses=quota.max_ip_addresses,
        can_create_templates=quota.can_create_templates,
        can_clone_vms=quota.can_clone_vms,
        can_use_iso_library=quota.can_use_iso_library,
        can_access_console=quota.can_access_console,
        notes=quota.notes,
        current_vms=quota.current_vms,
        current_running_vms=quota.current_running_vms,
        current_total_cpu=quota.current_total_cpu,
        current_total_memory=quota.current_total_memory,
        current_total_disk=quota.current_total_disk,
        last_usage_update=quota.last_usage_update.isoformat() if quota.last_usage_update else None,
        created_at=quota.created_at.isoformat() if quota.created_at else "",
        updated_at=quota.updated_at.isoformat() if quota.updated_at else None
    )


@router.post("/", response_model=QuotaResponse, status_code=status.HTTP_201_CREATED)
@require_permission("quota", "create")
async def create_quota(
    quota_data: QuotaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a quota for a user (admin only)."""
    # Check if user exists
    user_result = await db.execute(
        select(User).where(User.id == quota_data.user_id)
    )
    if not user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if quota already exists
    existing_result = await db.execute(
        select(UserQuota).where(UserQuota.user_id == quota_data.user_id)
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quota already exists for this user"
        )
    
    quota = UserQuota(
        user_id=quota_data.user_id,
        max_vms=quota_data.max_vms,
        max_running_vms=quota_data.max_running_vms,
        max_cpu_per_vm=quota_data.max_cpu_per_vm,
        max_memory_per_vm=quota_data.max_memory_per_vm,
        max_disk_per_vm=quota_data.max_disk_per_vm,
        max_total_cpu=quota_data.max_total_cpu,
        max_total_memory=quota_data.max_total_memory,
        max_total_disk=quota_data.max_total_disk,
        max_snapshots_per_vm=quota_data.max_snapshots_per_vm,
        max_backups=quota_data.max_backups,
        max_network_interfaces_per_vm=quota_data.max_network_interfaces_per_vm,
        max_ip_addresses=quota_data.max_ip_addresses,
        can_create_templates=quota_data.can_create_templates,
        can_clone_vms=quota_data.can_clone_vms,
        can_use_iso_library=quota_data.can_use_iso_library,
        can_access_console=quota_data.can_access_console,
        notes=quota_data.notes
    )
    
    db.add(quota)
    await db.commit()
    await db.refresh(quota)
    
    return QuotaResponse(
        id=quota.id,
        user_id=quota.user_id,
        max_vms=quota.max_vms,
        max_running_vms=quota.max_running_vms,
        max_cpu_per_vm=quota.max_cpu_per_vm,
        max_memory_per_vm=quota.max_memory_per_vm,
        max_disk_per_vm=quota.max_disk_per_vm,
        max_total_cpu=quota.max_total_cpu,
        max_total_memory=quota.max_total_memory,
        max_total_disk=quota.max_total_disk,
        max_snapshots_per_vm=quota.max_snapshots_per_vm,
        max_backups=quota.max_backups,
        max_network_interfaces_per_vm=quota.max_network_interfaces_per_vm,
        max_ip_addresses=quota.max_ip_addresses,
        can_create_templates=quota.can_create_templates,
        can_clone_vms=quota.can_clone_vms,
        can_use_iso_library=quota.can_use_iso_library,
        can_access_console=quota.can_access_console,
        notes=quota.notes,
        current_vms=quota.current_vms,
        current_running_vms=quota.current_running_vms,
        current_total_cpu=quota.current_total_cpu,
        current_total_memory=quota.current_total_memory,
        current_total_disk=quota.current_total_disk,
        last_usage_update=quota.last_usage_update.isoformat() if quota.last_usage_update else None,
        created_at=quota.created_at.isoformat() if quota.created_at else "",
        updated_at=quota.updated_at.isoformat() if quota.updated_at else None
    )


@router.put("/user/{user_id}", response_model=QuotaResponse)
@require_permission("quota", "update")
async def update_quota(
    user_id: int,
    quota_data: QuotaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a user's quota (admin only)."""
    result = await db.execute(
        select(UserQuota).where(UserQuota.user_id == user_id)
    )
    quota = result.scalar_one_or_none()
    
    if not quota:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quota not found for this user"
        )
    
    # Update fields
    if quota_data.max_vms is not None:
        quota.max_vms = quota_data.max_vms
    if quota_data.max_running_vms is not None:
        quota.max_running_vms = quota_data.max_running_vms
    if quota_data.max_cpu_per_vm is not None:
        quota.max_cpu_per_vm = quota_data.max_cpu_per_vm
    if quota_data.max_memory_per_vm is not None:
        quota.max_memory_per_vm = quota_data.max_memory_per_vm
    if quota_data.max_disk_per_vm is not None:
        quota.max_disk_per_vm = quota_data.max_disk_per_vm
    if quota_data.max_total_cpu is not None:
        quota.max_total_cpu = quota_data.max_total_cpu
    if quota_data.max_total_memory is not None:
        quota.max_total_memory = quota_data.max_total_memory
    if quota_data.max_total_disk is not None:
        quota.max_total_disk = quota_data.max_total_disk
    if quota_data.max_snapshots_per_vm is not None:
        quota.max_snapshots_per_vm = quota_data.max_snapshots_per_vm
    if quota_data.max_backups is not None:
        quota.max_backups = quota_data.max_backups
    if quota_data.max_network_interfaces_per_vm is not None:
        quota.max_network_interfaces_per_vm = quota_data.max_network_interfaces_per_vm
    if quota_data.max_ip_addresses is not None:
        quota.max_ip_addresses = quota_data.max_ip_addresses
    if quota_data.can_create_templates is not None:
        quota.can_create_templates = quota_data.can_create_templates
    if quota_data.can_clone_vms is not None:
        quota.can_clone_vms = quota_data.can_clone_vms
    if quota_data.can_use_iso_library is not None:
        quota.can_use_iso_library = quota_data.can_use_iso_library
    if quota_data.can_access_console is not None:
        quota.can_access_console = quota_data.can_access_console
    if quota_data.notes is not None:
        quota.notes = quota_data.notes
    
    await db.commit()
    await db.refresh(quota)
    
    return QuotaResponse(
        id=quota.id,
        user_id=quota.user_id,
        max_vms=quota.max_vms,
        max_running_vms=quota.max_running_vms,
        max_cpu_per_vm=quota.max_cpu_per_vm,
        max_memory_per_vm=quota.max_memory_per_vm,
        max_disk_per_vm=quota.max_disk_per_vm,
        max_total_cpu=quota.max_total_cpu,
        max_total_memory=quota.max_total_memory,
        max_total_disk=quota.max_total_disk,
        max_snapshots_per_vm=quota.max_snapshots_per_vm,
        max_backups=quota.max_backups,
        max_network_interfaces_per_vm=quota.max_network_interfaces_per_vm,
        max_ip_addresses=quota.max_ip_addresses,
        can_create_templates=quota.can_create_templates,
        can_clone_vms=quota.can_clone_vms,
        can_use_iso_library=quota.can_use_iso_library,
        can_access_console=quota.can_access_console,
        notes=quota.notes,
        current_vms=quota.current_vms,
        current_running_vms=quota.current_running_vms,
        current_total_cpu=quota.current_total_cpu,
        current_total_memory=quota.current_total_memory,
        current_total_disk=quota.current_total_disk,
        last_usage_update=quota.last_usage_update.isoformat() if quota.last_usage_update else None,
        created_at=quota.created_at.isoformat() if quota.created_at else "",
        updated_at=quota.updated_at.isoformat() if quota.updated_at else None
    )


@router.delete("/user/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_permission("quota", "delete")
async def delete_quota(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a user's quota (admin only)."""
    result = await db.execute(
        select(UserQuota).where(UserQuota.user_id == user_id)
    )
    quota = result.scalar_one_or_none()
    
    if not quota:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quota not found for this user"
        )
    
    await db.delete(quota)
    await db.commit()
    
    return None


@router.post("/user/{user_id}/refresh")
@require_permission("quota", "read")
async def refresh_quota_usage(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Refresh the current usage statistics for a user's quota."""
    result = await db.execute(
        select(UserQuota).where(UserQuota.user_id == user_id)
    )
    quota = result.scalar_one_or_none()
    
    if not quota:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quota not found for this user"
        )
    
    # Count user's VMs
    vm_result = await db.execute(
        select(VMAssignment).where(VMAssignment.user_id == user_id)
    )
    vms = vm_result.scalars().all()
    
    quota.current_vms = len(vms)
    quota.last_usage_update = datetime.now()
    
    # Note: For accurate CPU/memory/disk totals, would need to query Proxmox
    # This is a simplified version
    
    await db.commit()
    await db.refresh(quota)
    
    return {
        "message": "Usage statistics refreshed",
        "current_vms": quota.current_vms,
        "last_update": quota.last_usage_update.isoformat()
    }
