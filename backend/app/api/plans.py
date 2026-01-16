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


class CloudLicensePlanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    max_vms: int | None = None
    max_cpu_cores: int | None = None
    max_ram_mb: int | None = None
    max_disk_gb: int | None = None
    max_snapshots: int | None = None
    max_backups: int | None = None
    max_isos: int | None = None
    max_ips: int | None = None
    allow_self_approval: bool | None = None


class VPSPlanCreate(BaseModel):
    name: str
    description: str | None = None
    cpu_cores: int = Field(default=1, ge=1)
    cpu_sockets: int = Field(default=1, ge=1)
    cpu_type: str = "host"  # host, qemu64, etc
    ram_mb: int = Field(default=512, ge=128)
    disk_gb: int = Field(default=10, ge=1)
    disk_type: str = "virtio"  # virtio, ide, scsi
    number_of_ips: int = Field(default=1, ge=1)
    virtio: bool = True
    scsi: bool = False
    enable_vnc: bool = False
    enable_serial: bool = False
    os_template: str | None = None
    ip_group_id: int | None = None
    iso_group_id: int | None = None
    price_per_month: int | None = None  # in cents
    max_instances_per_user: int | None = None


class VPSPlanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    cpu_cores: int | None = Field(default=None, ge=1)
    cpu_sockets: int | None = Field(default=None, ge=1)
    cpu_type: str | None = None
    ram_mb: int | None = Field(default=None, ge=128)
    disk_gb: int | None = Field(default=None, ge=1)
    disk_type: str | None = None
    number_of_ips: int | None = Field(default=None, ge=1)
    virtio: bool | None = None
    scsi: bool | None = None
    enable_vnc: bool | None = None
    enable_serial: bool | None = None
    os_template: str | None = None
    ip_group_id: int | None = None
    iso_group_id: int | None = None
    price_per_month: int | None = None
    max_instances_per_user: int | None = None


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
    plans = []
    for p in result.scalars().all():
        plans.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "max_vms": p.max_vms,
            "max_cpu_cores": p.max_cpu_cores,
            "max_ram_mb": p.max_ram_mb,
            "max_disk_gb": p.max_disk_gb,
            "max_snapshots": p.max_snapshots,
            "max_backups": p.max_backups,
            "max_isos": p.max_isos,
            "max_ips": p.max_ips,
            "allow_self_approval": p.allow_self_approval,
        })
    return {"plans": plans}


@router.put("/cloud-license/{plan_id}")
@require_permission("plan", "update")
async def update_cloud_license_plan(plan_id: int, data: CloudLicensePlanUpdate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    plan = await db.get(CloudLicensePlan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cloud license plan not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(plan, field, value)
    await db.commit()
    await db.refresh(plan)
    return {"plan": {"id": plan.id, "name": plan.name}}


@router.delete("/cloud-license/{plan_id}")
@require_permission("plan", "delete")
async def delete_cloud_license_plan(plan_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    plan = await db.get(CloudLicensePlan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cloud license plan not found")
    await db.delete(plan)
    await db.commit()
    return {"message": "Plan deleted"}


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


@router.put("/vps/{plan_id}")
@require_permission("plan", "update")
async def update_vps_plan(plan_id: int, data: VPSPlanUpdate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    plan = await db.get(VPSPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VPS plan not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(plan, field, value)
    await db.commit()
    await db.refresh(plan)
    return {"plan": {"id": plan.id, "name": plan.name}}


@router.delete("/vps/{plan_id}")
@require_permission("plan", "delete")
async def delete_vps_plan(plan_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    plan = await db.get(VPSPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="VPS plan not found")
    await db.delete(plan)
    await db.commit()
    return {"message": "Plan deleted"}


@router.get("/vps")
@require_permission("plan", "read")
async def list_vps_plans(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(VPSPlan))
    plans = []
    for p in result.scalars().all():
        plans.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "cpu_cores": p.cpu_cores,
            "cpu_sockets": p.cpu_sockets,
            "cpu_type": p.cpu_type,
            "ram_mb": p.ram_mb,
            "disk_gb": p.disk_gb,
            "disk_type": p.disk_type,
            "number_of_ips": p.number_of_ips,
            "virtio": p.virtio,
            "scsi": p.scsi,
            "enable_vnc": p.enable_vnc,
            "enable_serial": p.enable_serial,
            "os_template": p.os_template,
            "ip_group_id": p.ip_group_id,
            "iso_group_id": p.iso_group_id,
            "price_per_month": p.price_per_month,
            "max_instances_per_user": p.max_instances_per_user,
        })
    return {"plans": plans}


@router.get("/os-templates")
@require_permission("plan", "read")
async def list_os_templates(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """List available OS templates for VPS plans"""
    templates = [
        {"name": "debian-11", "label": "Debian 11"},
        {"name": "debian-12", "label": "Debian 12"},
        {"name": "ubuntu-20.04", "label": "Ubuntu 20.04 LTS"},
        {"name": "ubuntu-22.04", "label": "Ubuntu 22.04 LTS"},
        {"name": "ubuntu-24.04", "label": "Ubuntu 24.04 LTS"},
        {"name": "centos-7", "label": "CentOS 7"},
        {"name": "centos-8", "label": "CentOS 8"},
        {"name": "centos-9", "label": "CentOS 9"},
        {"name": "fedora-38", "label": "Fedora 38"},
        {"name": "fedora-39", "label": "Fedora 39"},
        {"name": "almalinux-8", "label": "AlmaLinux 8"},
        {"name": "almalinux-9", "label": "AlmaLinux 9"},
    ]
    return {"templates": templates}


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
