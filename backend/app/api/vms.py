"""Virtual machine management endpoints."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.api.auth import get_current_user
from app.services.proxmox import ProxmoxService

router = APIRouter(prefix="/vms", tags=["virtual-machines"])


@router.get("/node/{node_id}")
async def list_vms(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all VMs on a node."""
    service = ProxmoxService(db)
    vms = await service.list_vms(node_id)
    return {"vms": vms}


@router.get("/node/{node_id}/vm/{vmid}/status")
async def get_vm_status(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get VM status."""
    service = ProxmoxService(db)
    status = await service.get_vm_status(node_id, vmid)
    if not status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM not found"
        )
    return status


@router.post("/node/{node_id}/vm/{vmid}/start")
async def start_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Start a VM."""
    service = ProxmoxService(db)
    success = await service.start_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to start VM"
        )
    return {"message": "VM start command sent"}


@router.post("/node/{node_id}/vm/{vmid}/stop")
async def stop_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Stop a VM."""
    service = ProxmoxService(db)
    success = await service.stop_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to stop VM"
        )
    return {"message": "VM stop command sent"}


@router.post("/node/{node_id}/vm/{vmid}/restart")
async def restart_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Restart a VM."""
    service = ProxmoxService(db)
    success = await service.restart_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to restart VM"
        )
    return {"message": "VM restart command sent"}
