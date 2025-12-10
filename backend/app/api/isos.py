"""ISO image management API endpoints."""
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, HttpUrl

from app.core.database import get_db
from app.models.user import User
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.services.proxmox import ProxmoxService

router = APIRouter(prefix="/isos", tags=["isos"])


class ISOResponse(BaseModel):
    volid: str
    storage: str
    format: str
    size: int
    name: str


class StorageResponse(BaseModel):
    storage: str
    type: str
    content: str
    active: bool
    avail: int
    used: int
    total: int


class ISOUploadRequest(BaseModel):
    node_id: int
    storage: str
    filename: str
    url: HttpUrl


@router.get("/nodes/{node_id}", response_model=List[ISOResponse])
@require_permission("iso", "read")
async def list_node_isos(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all ISO images on a specific node."""
    service = ProxmoxService(db)
    
    try:
        isos = await service.list_isos(node_id)
        return isos
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list ISOs: {str(e)}"
        )


@router.get("/nodes/{node_id}/storages", response_model=List[StorageResponse])
@require_permission("iso", "read")
async def list_node_storages(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List storage options available on a node."""
    service = ProxmoxService(db)
    
    try:
        storages = await service.list_storages(node_id)
        return storages
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list storages: {str(e)}"
        )


@router.post("/upload")
@require_permission("iso", "upload")
async def upload_iso_from_url(
    upload_data: ISOUploadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload an ISO image from URL to Proxmox storage.
    
    This starts a background download task. The ISO will be downloaded
    directly to the Proxmox node storage. Large files may take several minutes.
    Use the task status endpoint to monitor progress.
    """
    service = ProxmoxService(db)
    
    try:
        task_upid = await service.upload_iso(
            node_id=upload_data.node_id,
            storage=upload_data.storage,
            filename=upload_data.filename,
            url=str(upload_data.url)
        )
        return {
            "message": "ISO download started successfully",
            "task_upid": task_upid,
            "note": "This is a background task. Use GET /isos/task/{node_id}/{upid} to check progress."
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start ISO upload: {str(e)}"
        )


@router.get("/task/{node_id}/{upid:path}")
@require_permission("iso", "read")
async def get_iso_upload_task_status(
    node_id: int,
    upid: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check the status of an ISO upload/download task.
    
    Returns task status information including whether it's running,
    completed successfully, or failed with an error.
    """
    service = ProxmoxService(db)
    
    try:
        status = await service.get_task_status(node_id, upid)
        return status
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task status: {str(e)}"
        )


@router.delete("/nodes/{node_id}/storage/{storage}/iso/{volid:path}")
@require_permission("iso", "delete")
async def delete_iso(
    node_id: int,
    storage: str,
    volid: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an ISO image from storage.
    
    The volid should be URL-encoded as it contains special characters
    like colons and slashes (e.g., 'local:iso/filename.iso').
    """
    service = ProxmoxService(db)
    
    try:
        await service.delete_iso(node_id, storage, volid)
        return {"message": "ISO deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete ISO: {str(e)}"
        )
