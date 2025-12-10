from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.core.database import get_db
from app.core.rbac import require_permission
from app.models.user import User
from app.services.proxmox import ProxmoxService

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


class SnapshotResponse(BaseModel):
    """Snapshot information response model."""
    name: str = Field(..., description="Snapshot name")
    description: Optional[str] = Field(None, description="Snapshot description")
    snaptime: Optional[int] = Field(None, description="Snapshot creation timestamp")
    vmstate: Optional[int] = Field(None, description="Whether VM state (RAM) is included")
    parent: Optional[str] = Field(None, description="Parent snapshot name")


class SnapshotCreateRequest(BaseModel):
    """Request model for creating a snapshot."""
    snapname: str = Field(..., description="Snapshot name", min_length=1, max_length=40)
    description: Optional[str] = Field(None, description="Snapshot description", max_length=255)
    vmstate: Optional[bool] = Field(False, description="Include VM RAM state")


class SnapshotRollbackRequest(BaseModel):
    """Request model for rolling back to a snapshot."""
    snapname: str = Field(..., description="Snapshot name to rollback to")


@router.get("/nodes/{node_id}/vms/{vmid}")
@require_permission("snapshot", "read")
async def list_snapshots(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[SnapshotResponse]:
    """List all snapshots for a VM."""
    proxmox_service = ProxmoxService(db)
    try:
        snapshots = await proxmox_service.list_snapshots(node_id, vmid)
        
        return [
            SnapshotResponse(
                name=snap.get('name', ''),
                description=snap.get('description'),
                snaptime=snap.get('snaptime'),
                vmstate=snap.get('vmstate'),
                parent=snap.get('parent')
            )
            for snap in snapshots
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list snapshots: {str(e)}"
        )


@router.post("/nodes/{node_id}/vms/{vmid}", status_code=status.HTTP_201_CREATED)
@require_permission("snapshot", "create")
async def create_snapshot(
    node_id: int,
    vmid: int,
    request: SnapshotCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """Create a new snapshot for a VM."""
    proxmox_service = ProxmoxService(db)
    try:
        task_id = await proxmox_service.create_snapshot(
            node_id=node_id,
            vmid=vmid,
            snapname=request.snapname,
            description=request.description,
            vmstate=request.vmstate
        )
        
        return {
            "message": f"Snapshot '{request.snapname}' created successfully",
            "task_id": task_id,
            "snapname": request.snapname
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create snapshot: {str(e)}"
        )


@router.delete("/nodes/{node_id}/vms/{vmid}/{snapname}", status_code=status.HTTP_200_OK)
@require_permission("snapshot", "delete")
async def delete_snapshot(
    node_id: int,
    vmid: int,
    snapname: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """Delete a VM snapshot."""
    proxmox_service = ProxmoxService(db)
    try:
        success = await proxmox_service.delete_snapshot(node_id, vmid, snapname)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete snapshot"
            )
        
        return {
            "message": f"Snapshot '{snapname}' deleted successfully",
            "snapname": snapname
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete snapshot: {str(e)}"
        )


@router.post("/nodes/{node_id}/vms/{vmid}/{snapname}/rollback")
@require_permission("snapshot", "restore")
async def rollback_snapshot(
    node_id: int,
    vmid: int,
    snapname: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """Rollback VM to a snapshot."""
    proxmox_service = ProxmoxService(db)
    try:
        task_id = await proxmox_service.rollback_snapshot(node_id, vmid, snapname)
        
        return {
            "message": f"Rolling back to snapshot '{snapname}'",
            "task_id": task_id,
            "snapname": snapname
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rollback snapshot: {str(e)}"
        )
