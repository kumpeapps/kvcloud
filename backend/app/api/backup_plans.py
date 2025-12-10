from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from ..core.database import get_db
from ..core.dependencies import get_current_user, require_permission
from ..models.user import User
from ..models.backup_plan import BackupPlan
from croniter import croniter

router = APIRouter(prefix="/backup-plans", tags=["backup-plans"])


class BackupPlanCreate(BaseModel):
    name: str
    vmid: int
    node_id: int
    schedule_type: str  # 'hourly', 'daily', 'weekly', 'monthly', 'custom'
    cron_expression: Optional[str] = None
    hour: Optional[int] = None
    minute: Optional[int] = 0
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    storage: str
    mode: str = "snapshot"  # 'snapshot', 'suspend', 'stop'
    compress: str = "zstd"  # 'zstd', 'gzip', 'lzo', '0' (none)
    retention_count: int = 7
    retention_days: Optional[int] = None
    email_on_success: bool = False
    email_on_failure: bool = True
    notification_emails: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class BackupPlanUpdate(BaseModel):
    name: Optional[str] = None
    schedule_type: Optional[str] = None
    cron_expression: Optional[str] = None
    hour: Optional[int] = None
    minute: Optional[int] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    storage: Optional[str] = None
    mode: Optional[str] = None
    compress: Optional[str] = None
    retention_count: Optional[int] = None
    retention_days: Optional[int] = None
    email_on_success: Optional[bool] = None
    email_on_failure: Optional[bool] = None
    notification_emails: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class BackupPlanResponse(BaseModel):
    id: int
    name: str
    vmid: int
    node_id: int
    schedule_type: str
    cron_expression: Optional[str]
    hour: Optional[int]
    minute: Optional[int]
    day_of_week: Optional[int]
    day_of_month: Optional[int]
    storage: str
    mode: str
    compress: str
    retention_count: int
    retention_days: Optional[int]
    email_on_success: bool
    email_on_failure: bool
    notification_emails: Optional[str]
    description: Optional[str]
    is_active: bool
    created_at: str
    updated_at: Optional[str]
    last_run_at: Optional[str]
    next_run_at: Optional[str]
    last_status: Optional[str]
    last_error: Optional[str]
    last_backup_volid: Optional[str]
    run_count: int
    success_count: int
    failure_count: int

    class Config:
        from_attributes = True


def calculate_next_backup_run(plan: BackupPlan) -> datetime:
    """Calculate the next run time for a backup plan."""
    now = datetime.now()
    
    if plan.schedule_type == 'custom' and plan.cron_expression:
        cron = croniter(plan.cron_expression, now)
        return cron.get_next(datetime)
    
    elif plan.schedule_type == 'hourly':
        minute = plan.minute or 0
        next_run = now.replace(minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(hours=1)
        return next_run
    
    elif plan.schedule_type == 'daily':
        hour = plan.hour or 0
        minute = plan.minute or 0
        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        return next_run
    
    elif plan.schedule_type == 'weekly':
        hour = plan.hour or 0
        minute = plan.minute or 0
        day_of_week = plan.day_of_week or 0
        
        current_day = now.weekday()
        days_ahead = day_of_week - current_day
        if days_ahead < 0 or (days_ahead == 0 and now.time() >= datetime(2000, 1, 1, hour, minute).time()):
            days_ahead += 7
        
        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days_ahead)
        return next_run
    
    elif plan.schedule_type == 'monthly':
        hour = plan.hour or 0
        minute = plan.minute or 0
        day = plan.day_of_month or 1
        
        next_run = now.replace(day=day, hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            if now.month == 12:
                next_run = next_run.replace(year=now.year + 1, month=1)
            else:
                next_run = next_run.replace(month=now.month + 1)
        return next_run
    
    return now


@router.get("/", response_model=List[BackupPlanResponse])
@require_permission("backup", "read")
async def list_backup_plans(
    vmid: Optional[int] = None,
    node_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all backup plans."""
    query = select(BackupPlan)
    
    if vmid:
        query = query.where(BackupPlan.vmid == vmid)
    if node_id:
        query = query.where(BackupPlan.node_id == node_id)
    
    result = await db.execute(query.order_by(BackupPlan.id))
    plans = result.scalars().all()
    
    return [
        BackupPlanResponse(
            id=p.id,
            name=p.name,
            vmid=p.vmid,
            node_id=p.node_id,
            schedule_type=p.schedule_type,
            cron_expression=p.cron_expression,
            hour=p.hour,
            minute=p.minute,
            day_of_week=p.day_of_week,
            day_of_month=p.day_of_month,
            storage=p.storage,
            mode=p.mode,
            compress=p.compress,
            retention_count=p.retention_count,
            retention_days=p.retention_days,
            email_on_success=p.email_on_success,
            email_on_failure=p.email_on_failure,
            notification_emails=p.notification_emails,
            description=p.description,
            is_active=p.is_active,
            created_at=p.created_at.isoformat() if p.created_at else "",
            updated_at=p.updated_at.isoformat() if p.updated_at else None,
            last_run_at=p.last_run_at.isoformat() if p.last_run_at else None,
            next_run_at=p.next_run_at.isoformat() if p.next_run_at else None,
            last_status=p.last_status,
            last_error=p.last_error,
            last_backup_volid=p.last_backup_volid,
            run_count=p.run_count,
            success_count=p.success_count,
            failure_count=p.failure_count
        )
        for p in plans
    ]


@router.post("/", response_model=BackupPlanResponse, status_code=status.HTTP_201_CREATED)
@require_permission("backup", "create")
async def create_backup_plan(
    plan_data: BackupPlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new backup plan."""
    # Validate cron expression if custom schedule
    if plan_data.schedule_type == 'custom' and plan_data.cron_expression:
        try:
            croniter(plan_data.cron_expression)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid cron expression: {str(e)}"
            )
    
    plan = BackupPlan(
        name=plan_data.name,
        vmid=plan_data.vmid,
        node_id=plan_data.node_id,
        schedule_type=plan_data.schedule_type,
        cron_expression=plan_data.cron_expression,
        hour=plan_data.hour,
        minute=plan_data.minute,
        day_of_week=plan_data.day_of_week,
        day_of_month=plan_data.day_of_month,
        storage=plan_data.storage,
        mode=plan_data.mode,
        compress=plan_data.compress,
        retention_count=plan_data.retention_count,
        retention_days=plan_data.retention_days,
        email_on_success=plan_data.email_on_success,
        email_on_failure=plan_data.email_on_failure,
        notification_emails=plan_data.notification_emails,
        description=plan_data.description,
        is_active=plan_data.is_active
    )
    
    # Calculate next run time
    plan.next_run_at = calculate_next_backup_run(plan)
    
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    
    return BackupPlanResponse(
        id=plan.id,
        name=plan.name,
        vmid=plan.vmid,
        node_id=plan.node_id,
        schedule_type=plan.schedule_type,
        cron_expression=plan.cron_expression,
        hour=plan.hour,
        minute=plan.minute,
        day_of_week=plan.day_of_week,
        day_of_month=plan.day_of_month,
        storage=plan.storage,
        mode=plan.mode,
        compress=plan.compress,
        retention_count=plan.retention_count,
        retention_days=plan.retention_days,
        email_on_success=plan.email_on_success,
        email_on_failure=plan.email_on_failure,
        notification_emails=plan.notification_emails,
        description=plan.description,
        is_active=plan.is_active,
        created_at=plan.created_at.isoformat() if plan.created_at else "",
        updated_at=plan.updated_at.isoformat() if plan.updated_at else None,
        last_run_at=plan.last_run_at.isoformat() if plan.last_run_at else None,
        next_run_at=plan.next_run_at.isoformat() if plan.next_run_at else None,
        last_status=plan.last_status,
        last_error=plan.last_error,
        last_backup_volid=plan.last_backup_volid,
        run_count=plan.run_count,
        success_count=plan.success_count,
        failure_count=plan.failure_count
    )


@router.get("/{plan_id}", response_model=BackupPlanResponse)
@require_permission("backup", "read")
async def get_backup_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific backup plan."""
    result = await db.execute(
        select(BackupPlan).where(BackupPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup plan not found"
        )
    
    return BackupPlanResponse(
        id=plan.id,
        name=plan.name,
        vmid=plan.vmid,
        node_id=plan.node_id,
        schedule_type=plan.schedule_type,
        cron_expression=plan.cron_expression,
        hour=plan.hour,
        minute=plan.minute,
        day_of_week=plan.day_of_week,
        day_of_month=plan.day_of_month,
        storage=plan.storage,
        mode=plan.mode,
        compress=plan.compress,
        retention_count=plan.retention_count,
        retention_days=plan.retention_days,
        email_on_success=plan.email_on_success,
        email_on_failure=plan.email_on_failure,
        notification_emails=plan.notification_emails,
        description=plan.description,
        is_active=plan.is_active,
        created_at=plan.created_at.isoformat() if plan.created_at else "",
        updated_at=plan.updated_at.isoformat() if plan.updated_at else None,
        last_run_at=plan.last_run_at.isoformat() if plan.last_run_at else None,
        next_run_at=plan.next_run_at.isoformat() if plan.next_run_at else None,
        last_status=plan.last_status,
        last_error=plan.last_error,
        last_backup_volid=plan.last_backup_volid,
        run_count=plan.run_count,
        success_count=plan.success_count,
        failure_count=plan.failure_count
    )


@router.put("/{plan_id}", response_model=BackupPlanResponse)
@require_permission("backup", "update")
async def update_backup_plan(
    plan_id: int,
    plan_data: BackupPlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a backup plan."""
    result = await db.execute(
        select(BackupPlan).where(BackupPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup plan not found"
        )
    
    # Update fields
    if plan_data.name is not None:
        plan.name = plan_data.name
    if plan_data.schedule_type is not None:
        plan.schedule_type = plan_data.schedule_type
    if plan_data.cron_expression is not None:
        if plan.schedule_type == 'custom':
            try:
                croniter(plan_data.cron_expression)
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid cron expression: {str(e)}"
                )
        plan.cron_expression = plan_data.cron_expression
    if plan_data.hour is not None:
        plan.hour = plan_data.hour
    if plan_data.minute is not None:
        plan.minute = plan_data.minute
    if plan_data.day_of_week is not None:
        plan.day_of_week = plan_data.day_of_week
    if plan_data.day_of_month is not None:
        plan.day_of_month = plan_data.day_of_month
    if plan_data.storage is not None:
        plan.storage = plan_data.storage
    if plan_data.mode is not None:
        plan.mode = plan_data.mode
    if plan_data.compress is not None:
        plan.compress = plan_data.compress
    if plan_data.retention_count is not None:
        plan.retention_count = plan_data.retention_count
    if plan_data.retention_days is not None:
        plan.retention_days = plan_data.retention_days
    if plan_data.email_on_success is not None:
        plan.email_on_success = plan_data.email_on_success
    if plan_data.email_on_failure is not None:
        plan.email_on_failure = plan_data.email_on_failure
    if plan_data.notification_emails is not None:
        plan.notification_emails = plan_data.notification_emails
    if plan_data.description is not None:
        plan.description = plan_data.description
    if plan_data.is_active is not None:
        plan.is_active = plan_data.is_active
    
    # Recalculate next run time
    plan.next_run_at = calculate_next_backup_run(plan)
    
    await db.commit()
    await db.refresh(plan)
    
    return BackupPlanResponse(
        id=plan.id,
        name=plan.name,
        vmid=plan.vmid,
        node_id=plan.node_id,
        schedule_type=plan.schedule_type,
        cron_expression=plan.cron_expression,
        hour=plan.hour,
        minute=plan.minute,
        day_of_week=plan.day_of_week,
        day_of_month=plan.day_of_month,
        storage=plan.storage,
        mode=plan.mode,
        compress=plan.compress,
        retention_count=plan.retention_count,
        retention_days=plan.retention_days,
        email_on_success=plan.email_on_success,
        email_on_failure=plan.email_on_failure,
        notification_emails=plan.notification_emails,
        description=plan.description,
        is_active=plan.is_active,
        created_at=plan.created_at.isoformat() if plan.created_at else "",
        updated_at=plan.updated_at.isoformat() if plan.updated_at else None,
        last_run_at=plan.last_run_at.isoformat() if plan.last_run_at else None,
        next_run_at=plan.next_run_at.isoformat() if plan.next_run_at else None,
        last_status=plan.last_status,
        last_error=plan.last_error,
        last_backup_volid=plan.last_backup_volid,
        run_count=plan.run_count,
        success_count=plan.success_count,
        failure_count=plan.failure_count
    )


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_permission("backup", "delete")
async def delete_backup_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a backup plan."""
    result = await db.execute(
        select(BackupPlan).where(BackupPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup plan not found"
        )
    
    await db.delete(plan)
    await db.commit()
    
    return None


@router.post("/{plan_id}/run", status_code=status.HTTP_202_ACCEPTED)
@require_permission("backup", "create")
async def run_backup_plan_now(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually trigger a backup plan to run immediately."""
    result = await db.execute(
        select(BackupPlan).where(BackupPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Backup plan not found"
        )
    
    # This would trigger the backup task asynchronously
    # For now, just return accepted
    return {
        "message": "Backup plan triggered successfully",
        "plan_id": plan_id,
        "status": "queued"
    }
