from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.models.cloud_license_plan import CloudLicensePlan, UserCloudLicense
from app.models.vps_plan import VPSPlan
from app.models.resource_groups import IPGroup, ISOGroup


router = APIRouter(prefix="/plans", tags=["plans"])


class CloudLicensePlanCreate(BaseModel):
    name: str
    description: str | None = None
    max_vms: int = 0
    max_cpu_cores: int = 0
    max_ram_mb: int = 0
    max_disk_gb: int = 0
    max_snapshots: int = 0
    max_backups: int = 0
    max_isos: int = 0
    max_ips: int = 0
    allow_self_approval: bool = False


class VPSPlanCreate(BaseModel):
    name: str
    description: str | None = None
    cpu_cores: int = Field(default=1, ge=1)
    ram_mb: int = Field(default=512, ge=128)
    disk_gb: int = Field(default=10, ge=1)
    virtio: bool = True
    scsi: bool = False
    enable_vnc: bool = False
    ip_group_id: int | None = None
    iso_group_id: int | None = None


class GroupCreate(BaseModel):
    name: str
    description: str | None = None
    ip_pool_id: int | None = None


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    ip_pool_id: int | None = None


class GroupResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    ip_pool_id: int | None = None


@router.post("/cloud-license")
@require_permission("plan", "create")
async def create_cloud_license_plan(data: CloudLicensePlanCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    plan = CloudLicensePlan(**data.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return {"plan": {"id": plan.id, "name": plan.name}}


@router.get("/cloud-license")
@require_permission("plan", "read")
async def list_cloud_license_plans(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(CloudLicensePlan))
    plans = [{"id": p.id, "name": p.name} for p in result.scalars().all()]
    return {"plans": plans}


@router.post("/cloud-license/assign/{user_id}/{plan_id}")
@require_permission("plan", "assign")
async def assign_cloud_license(user_id: int, plan_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    assignment = UserCloudLicense(user_id=user_id, plan_id=plan_id)
    db.add(assignment)
    await db.commit()
    return {"message": "Assigned"}


@router.post("/vps")
@require_permission("plan", "create")
async def create_vps_plan(data: VPSPlanCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    plan = VPSPlan(**data.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return {"plan": {"id": plan.id, "name": plan.name}}


@router.get("/vps")
@require_permission("plan", "read")
async def list_vps_plans(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(VPSPlan))
    plans = [{"id": p.id, "name": p.name, "cpu_cores": p.cpu_cores, "ram_mb": p.ram_mb, "disk_gb": p.disk_gb} for p in result.scalars().all()]
    return {"plans": plans}


@router.post("/groups/ip")
@require_permission("plan", "create")
async def create_ip_group(data: GroupCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    group = IPGroup(name=data.name, description=data.description, ip_pool_id=data.ip_pool_id)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return {"group": {"id": group.id, "name": group.name}}


@router.put("/groups/ip/{group_id}")
@require_permission("plan", "update")
async def update_ip_group(group_id: int, data: GroupUpdate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    group = await db.get(IPGroup, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP group not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    await db.commit()
    await db.refresh(group)
    return {"group": {"id": group.id, "name": group.name}}


@router.delete("/groups/ip/{group_id}")
@require_permission("plan", "delete")
async def delete_ip_group(group_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    group = await db.get(IPGroup, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP group not found")
    await db.delete(group)
    await db.commit()
    return {"message": "Deleted"}


@router.get("/groups/ip", response_model=dict)
@require_permission("plan", "read")
async def list_ip_groups(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(IPGroup))
    groups = [
        {
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "ip_pool_id": g.ip_pool_id,
        }
        for g in result.scalars().all()
    ]
    return {"groups": groups}


@router.post("/groups/iso")
@require_permission("plan", "create")
async def create_iso_group(data: GroupCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    group = ISOGroup(name=data.name, description=data.description)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return {"group": {"id": group.id, "name": group.name}}


@router.put("/groups/iso/{group_id}")
@require_permission("plan", "update")
async def update_iso_group(group_id: int, data: GroupUpdate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    group = await db.get(ISOGroup, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ISO group not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    await db.commit()
    await db.refresh(group)
    return {"group": {"id": group.id, "name": group.name}}


@router.delete("/groups/iso/{group_id}")
@require_permission("plan", "delete")
async def delete_iso_group(group_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    group = await db.get(ISOGroup, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ISO group not found")
    await db.delete(group)
    await db.commit()
    return {"message": "Deleted"}


@router.get("/groups/iso", response_model=dict)
@require_permission("plan", "read")
async def list_iso_groups(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(ISOGroup))
    groups = [
        {
            "id": g.id,
            "name": g.name,
            "description": g.description,
        }
        for g in result.scalars().all()
    ]
    return {"groups": groups}
