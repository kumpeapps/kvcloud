from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.models.vm_request import VMRequest
from app.models.vps_plan import VPSPlan
from app.models.cloud_license_plan import UserCloudLicense, CloudLicensePlan
from app.services.proxmox import ProxmoxService


router = APIRouter(prefix="/vm-requests", tags=["vm-requests"])


class CreateVMRequest(BaseModel):
    plan_id: int
    node_id: int | None = None
    cloud_init_profile_id: int | None = None
    recipe_id: int | None = None


@router.post("")
@require_permission("vm", "request")
async def create_request(data: CreateVMRequest, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    auto_approve = False
    # Check user's cloud license for self-approval
    result = await db.execute(select(UserCloudLicense).where(UserCloudLicense.user_id == current_user.id))
    license = result.scalars().first()
    if license:
        plan = await db.get(CloudLicensePlan, license.plan_id)
        if plan and plan.allow_self_approval:
            auto_approve = True

    req = VMRequest(
        user_id=current_user.id,
        plan_id=data.plan_id,
        node_id=data.node_id,
        cloud_init_profile_id=data.cloud_init_profile_id,
        recipe_id=data.recipe_id,
        status="approved" if auto_approve else "pending",
        auto_approve=auto_approve,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return {"request": {"id": req.id, "status": req.status}}


@router.get("")
@require_permission("vm", "request")
async def list_my_requests(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(VMRequest).where(VMRequest.user_id == current_user.id))
    items = [{"id": r.id, "status": r.status, "plan_id": r.plan_id} for r in result.scalars().all()]
    return {"requests": items}


@router.get("/all")
@require_permission("vm", "approve")
async def list_all_requests(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(VMRequest))
    items = [
        {
            "id": r.id,
            "status": r.status,
            "plan_id": r.plan_id,
            "user_id": r.user_id,
            "node_id": r.node_id,
            "auto_approve": r.auto_approve
        } for r in result.scalars().all()
    ]
    return {"requests": items}


@router.post("/{request_id}/approve")
@require_permission("vm", "approve")
async def approve_request(request_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    req = await db.get(VMRequest, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    req.status = "approved"
    await db.commit()
    return {"message": "Approved"}


@router.post("/{request_id}/fulfill")
@require_permission("vm", "approve")
async def fulfill_request(request_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    req = await db.get(VMRequest, request_id)
    if not req or req.status != "approved":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request not approved")

    plan = await db.get(VPSPlan, req.plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plan not found")

    # Create VM with plan limits (minimal example)
    service = ProxmoxService(db)
    node_id = req.node_id or 1
    nextid = await service.get_next_vmid(node_id)
    vm_data = {
        "vmid": nextid,
        "name": f"user-{req.user_id}-{nextid}",
        "cores": plan.cpu_cores,
        "memory": plan.ram_mb,
        "disk_size": plan.disk_gb,
        "storage": "local-lvm",
        "network_bridge": "vmbr0",
        "os_type": "l26",
    }
    try:
        await service.create_vm(node_id, vm_data)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    req.status = "fulfilled"
    await db.commit()
    return {"message": "VM created", "vmid": nextid}
