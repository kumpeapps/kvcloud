"""Backup API endpoints for VM backup operations."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Optional, List

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.models.user import User
from app.services.proxmox import ProxmoxService
from app.services.notification_service import NotificationService


router = APIRouter(prefix="/backups", tags=["Backups"])


class BackupCreateRequest(BaseModel):
    """Request model for creating a backup."""
    storage: str = Field(default="local", description="Storage location for backup")
    mode: str = Field(default="snapshot", description="Backup mode: snapshot, suspend, or stop")
    compress: str = Field(default="zstd", description="Compression: none, lzo, gzip, or zstd")
    notes: Optional[str] = Field(default=None, description="Optional backup notes")


class BackupCreateResponse(BaseModel):
    """Response model for backup creation."""
    upid: str
    node: str
    vmid: int
    storage: str
    mode: str
    compress: str
    message: str = "Backup task started"


class BackupInfo(BaseModel):
    """Backup information model."""
    volid: str
    format: str
    size: int
    ctime: int
    vmid: Optional[int]
    storage: str
    notes: str = ""


class BackupRestoreRequest(BaseModel):
    """Request model for restoring a backup."""
    target_vmid: int = Field(description="Target VM ID for restore")
    storage: Optional[str] = Field(default=None, description="Target storage for restored VM")


class BackupRestoreResponse(BaseModel):
    """Response model for backup restore."""
    upid: str
    node: str
    vmid: int
    archive: str
    message: str = "Restore task started"


@router.post("/node/{node_id}/vm/{vmid}", response_model=BackupCreateResponse)
@require_permission("backup", "create")
async def create_vm_backup(
    node_id: int,
    vmid: int,
    backup_req: BackupCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> BackupCreateResponse:
    """
    Create a backup of a VM.
    
    Args:
        node_id: Node ID where the VM is running
        vmid: VM ID to backup
        backup_req: Backup configuration
    
    Returns:
        BackupCreateResponse with task information
    """
    proxmox_service = ProxmoxService(db)
    
    try:
        result = await proxmox_service.create_backup(
            node_id=node_id,
            vmid=vmid,
            storage=backup_req.storage,
            mode=backup_req.mode,
            compress=backup_req.compress,
            notes=backup_req.notes
        )
        
        # Create notification
        try:
            await NotificationService.create_backup_notification(
                db=db,
                user_id=current_user.id,
                vm_id=vmid,
                action="started",
                type="info",
                details=f"Backup task started for VM {vmid} on storage '{backup_req.storage}'"
            )
        except Exception as e:
            print(f"Failed to create notification: {e}")
        
        return BackupCreateResponse(**result)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create backup: {str(e)}"
        )


@router.get("/node/{node_id}", response_model=List[BackupInfo])
@require_permission("backup", "read")
async def list_node_backups(
    node_id: int,
    vmid: Optional[int] = None,
    storage: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[BackupInfo]:
    """
    List all backups on a node, optionally filtered by VM ID and/or storage.
    
    Args:
        node_id: Node ID
        vmid: Optional VM ID to filter backups
        storage: Optional storage location to filter
    
    Returns:
        List of backup information
    """
    proxmox_service = ProxmoxService(db)
    
    try:
        backups = await proxmox_service.list_backups(
            node_id=node_id,
            vmid=vmid,
            storage=storage
        )
        
        return [BackupInfo(**backup) for backup in backups]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list backups: {str(e)}"
        )


@router.get("/node/{node_id}/vm/{vmid}", response_model=List[BackupInfo])
@require_permission("backup", "read")
async def list_vm_backups(
    node_id: int,
    vmid: int,
    storage: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[BackupInfo]:
    """
    List all backups for a specific VM.
    
    Args:
        node_id: Node ID
        vmid: VM ID
        storage: Optional storage location to filter
    
    Returns:
        List of backup information for the VM
    """
    proxmox_service = ProxmoxService(db)
    
    try:
        backups = await proxmox_service.list_backups(
            node_id=node_id,
            vmid=vmid,
            storage=storage
        )
        
        return [BackupInfo(**backup) for backup in backups]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list VM backups: {str(e)}"
        )


@router.post("/node/{node_id}/restore", response_model=BackupRestoreResponse)
@require_permission("backup", "restore")
async def restore_vm_backup(
    node_id: int,
    volid: str,
    restore_req: BackupRestoreRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> BackupRestoreResponse:
    """
    Restore a VM from a backup.
    
    Args:
        node_id: Node ID
        volid: Backup volume ID
        restore_req: Restore configuration
    
    Returns:
        BackupRestoreResponse with task information
    """
    proxmox_service = ProxmoxService(db)
    
    try:
        result = await proxmox_service.restore_backup(
            node_id=node_id,
            vmid=restore_req.target_vmid,
            volid=volid,
            storage=restore_req.storage
        )
        
        return BackupRestoreResponse(**result)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to restore backup: {str(e)}"
        )


@router.delete("/node/{node_id}")
@require_permission("backup", "delete")
async def delete_vm_backup(
    node_id: int,
    volid: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a backup.
    
    Args:
        node_id: Node ID
        volid: Backup volume ID to delete
    
    Returns:
        Success message
    """
    proxmox_service = ProxmoxService(db)
    
    try:
        await proxmox_service.delete_backup(node_id=node_id, volid=volid)
        
        return {"message": "Backup deleted successfully", "volid": volid}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete backup: {str(e)}"
        )
