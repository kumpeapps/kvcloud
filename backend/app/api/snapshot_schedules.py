from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from ..core.database import get_db
from ..core.dependencies import get_current_user, require_permission
from ..models.user import User
from ..models.snapshot_schedule import SnapshotSchedule
from croniter import croniter

router = APIRouter(prefix="/snapshot-schedules", tags=["snapshot-schedules"])


class SnapshotScheduleCreate(BaseModel):
    name: str
    vmid: int
    node_id: int
    schedule_type: str  # 'hourly', 'daily', 'weekly', 'monthly', 'custom'
    cron_expression: Optional[str] = None
    hour: Optional[int] = None
    minute: Optional[int] = 0
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    retention_count: int = 7
    retention_days: Optional[int] = None
    naming_pattern: str = "auto-{timestamp}"
    description: Optional[str] = None
    include_ram: bool = False
    is_active: bool = True


class SnapshotScheduleUpdate(BaseModel):
    name: Optional[str] = None
    schedule_type: Optional[str] = None
    cron_expression: Optional[str] = None
    hour: Optional[int] = None
    minute: Optional[int] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    retention_count: Optional[int] = None
    retention_days: Optional[int] = None
    naming_pattern: Optional[str] = None
    description: Optional[str] = None
    include_ram: Optional[bool] = None
    is_active: Optional[bool] = None


class SnapshotScheduleResponse(BaseModel):
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
    retention_count: int
    retention_days: Optional[int]
    naming_pattern: str
    description: Optional[str]
    include_ram: bool
    is_active: bool
    created_at: str
    updated_at: Optional[str]
    last_run_at: Optional[str]
    next_run_at: Optional[str]
    last_status: Optional[str]
    last_error: Optional[str]
    run_count: int

    class Config:
        from_attributes = True


def calculate_next_run(schedule: SnapshotSchedule) -> datetime:
    """Calculate the next run time for a schedule."""
    now = datetime.now()
    
    if schedule.schedule_type == 'custom' and schedule.cron_expression:
        cron = croniter(schedule.cron_expression, now)
        return cron.get_next(datetime)
    
    elif schedule.schedule_type == 'hourly':
        minute = schedule.minute or 0
        next_run = now.replace(minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(hours=1)
        return next_run
    
    elif schedule.schedule_type == 'daily':
        hour = schedule.hour or 0
        minute = schedule.minute or 0
        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        return next_run
    
    elif schedule.schedule_type == 'weekly':
        hour = schedule.hour or 0
        minute = schedule.minute or 0
        day_of_week = schedule.day_of_week or 0
        
        # Calculate days until target day of week
        current_day = now.weekday()
        days_ahead = day_of_week - current_day
        if days_ahead < 0 or (days_ahead == 0 and now.time() >= datetime(2000, 1, 1, hour, minute).time()):
            days_ahead += 7
        
        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days_ahead)
        return next_run
    
    elif schedule.schedule_type == 'monthly':
        hour = schedule.hour or 0
        minute = schedule.minute or 0
        day = schedule.day_of_month or 1
        
        next_run = now.replace(day=day, hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            # Move to next month
            if now.month == 12:
                next_run = next_run.replace(year=now.year + 1, month=1)
            else:
                next_run = next_run.replace(month=now.month + 1)
        return next_run
    
    return now


@router.get("/", response_model=List[SnapshotScheduleResponse])
@require_permission("snapshot", "read")
async def list_schedules(
    vmid: Optional[int] = None,
    node_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all snapshot schedules."""
    query = select(SnapshotSchedule)
    
    if vmid:
        query = query.where(SnapshotSchedule.vmid == vmid)
    if node_id:
        query = query.where(SnapshotSchedule.node_id == node_id)
    
    result = await db.execute(query.order_by(SnapshotSchedule.id))
    schedules = result.scalars().all()
    
    return [
        SnapshotScheduleResponse(
            id=s.id,
            name=s.name,
            vmid=s.vmid,
            node_id=s.node_id,
            schedule_type=s.schedule_type,
            cron_expression=s.cron_expression,
            hour=s.hour,
            minute=s.minute,
            day_of_week=s.day_of_week,
            day_of_month=s.day_of_month,
            retention_count=s.retention_count,
            retention_days=s.retention_days,
            naming_pattern=s.naming_pattern,
            description=s.description,
            include_ram=s.include_ram,
            is_active=s.is_active,
            created_at=s.created_at.isoformat() if s.created_at else "",
            updated_at=s.updated_at.isoformat() if s.updated_at else None,
            last_run_at=s.last_run_at.isoformat() if s.last_run_at else None,
            next_run_at=s.next_run_at.isoformat() if s.next_run_at else None,
            last_status=s.last_status,
            last_error=s.last_error,
            run_count=s.run_count
        )
        for s in schedules
    ]


@router.post("/", response_model=SnapshotScheduleResponse, status_code=status.HTTP_201_CREATED)
@require_permission("snapshot", "create")
async def create_schedule(
    schedule_data: SnapshotScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new snapshot schedule."""
    # Validate cron expression if custom schedule
    if schedule_data.schedule_type == 'custom' and schedule_data.cron_expression:
        try:
            croniter(schedule_data.cron_expression)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid cron expression: {str(e)}"
            )
    
    schedule = SnapshotSchedule(
        name=schedule_data.name,
        vmid=schedule_data.vmid,
        node_id=schedule_data.node_id,
        schedule_type=schedule_data.schedule_type,
        cron_expression=schedule_data.cron_expression,
        hour=schedule_data.hour,
        minute=schedule_data.minute,
        day_of_week=schedule_data.day_of_week,
        day_of_month=schedule_data.day_of_month,
        retention_count=schedule_data.retention_count,
        retention_days=schedule_data.retention_days,
        naming_pattern=schedule_data.naming_pattern,
        description=schedule_data.description,
        include_ram=schedule_data.include_ram,
        is_active=schedule_data.is_active
    )
    
    # Calculate next run time
    schedule.next_run_at = calculate_next_run(schedule)
    
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    
    return SnapshotScheduleResponse(
        id=schedule.id,
        name=schedule.name,
        vmid=schedule.vmid,
        node_id=schedule.node_id,
        schedule_type=schedule.schedule_type,
        cron_expression=schedule.cron_expression,
        hour=schedule.hour,
        minute=schedule.minute,
        day_of_week=schedule.day_of_week,
        day_of_month=schedule.day_of_month,
        retention_count=schedule.retention_count,
        retention_days=schedule.retention_days,
        naming_pattern=schedule.naming_pattern,
        description=schedule.description,
        include_ram=schedule.include_ram,
        is_active=schedule.is_active,
        created_at=schedule.created_at.isoformat() if schedule.created_at else "",
        updated_at=schedule.updated_at.isoformat() if schedule.updated_at else None,
        last_run_at=schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        next_run_at=schedule.next_run_at.isoformat() if schedule.next_run_at else None,
        last_status=schedule.last_status,
        last_error=schedule.last_error,
        run_count=schedule.run_count
    )


@router.get("/{schedule_id}", response_model=SnapshotScheduleResponse)
@require_permission("snapshot", "read")
async def get_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific snapshot schedule."""
    result = await db.execute(
        select(SnapshotSchedule).where(SnapshotSchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
    
    return SnapshotScheduleResponse(
        id=schedule.id,
        name=schedule.name,
        vmid=schedule.vmid,
        node_id=schedule.node_id,
        schedule_type=schedule.schedule_type,
        cron_expression=schedule.cron_expression,
        hour=schedule.hour,
        minute=schedule.minute,
        day_of_week=schedule.day_of_week,
        day_of_month=schedule.day_of_month,
        retention_count=schedule.retention_count,
        retention_days=schedule.retention_days,
        naming_pattern=schedule.naming_pattern,
        description=schedule.description,
        include_ram=schedule.include_ram,
        is_active=schedule.is_active,
        created_at=schedule.created_at.isoformat() if schedule.created_at else "",
        updated_at=schedule.updated_at.isoformat() if schedule.updated_at else None,
        last_run_at=schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        next_run_at=schedule.next_run_at.isoformat() if schedule.next_run_at else None,
        last_status=schedule.last_status,
        last_error=schedule.last_error,
        run_count=schedule.run_count
    )


@router.put("/{schedule_id}", response_model=SnapshotScheduleResponse)
@require_permission("snapshot", "update")
async def update_schedule(
    schedule_id: int,
    schedule_data: SnapshotScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a snapshot schedule."""
    result = await db.execute(
        select(SnapshotSchedule).where(SnapshotSchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
    
    # Update fields
    if schedule_data.name is not None:
        schedule.name = schedule_data.name
    if schedule_data.schedule_type is not None:
        schedule.schedule_type = schedule_data.schedule_type
    if schedule_data.cron_expression is not None:
        # Validate if custom
        if schedule.schedule_type == 'custom':
            try:
                croniter(schedule_data.cron_expression)
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid cron expression: {str(e)}"
                )
        schedule.cron_expression = schedule_data.cron_expression
    if schedule_data.hour is not None:
        schedule.hour = schedule_data.hour
    if schedule_data.minute is not None:
        schedule.minute = schedule_data.minute
    if schedule_data.day_of_week is not None:
        schedule.day_of_week = schedule_data.day_of_week
    if schedule_data.day_of_month is not None:
        schedule.day_of_month = schedule_data.day_of_month
    if schedule_data.retention_count is not None:
        schedule.retention_count = schedule_data.retention_count
    if schedule_data.retention_days is not None:
        schedule.retention_days = schedule_data.retention_days
    if schedule_data.naming_pattern is not None:
        schedule.naming_pattern = schedule_data.naming_pattern
    if schedule_data.description is not None:
        schedule.description = schedule_data.description
    if schedule_data.include_ram is not None:
        schedule.include_ram = schedule_data.include_ram
    if schedule_data.is_active is not None:
        schedule.is_active = schedule_data.is_active
    
    # Recalculate next run time
    schedule.next_run_at = calculate_next_run(schedule)
    
    await db.commit()
    await db.refresh(schedule)
    
    return SnapshotScheduleResponse(
        id=schedule.id,
        name=schedule.name,
        vmid=schedule.vmid,
        node_id=schedule.node_id,
        schedule_type=schedule.schedule_type,
        cron_expression=schedule.cron_expression,
        hour=schedule.hour,
        minute=schedule.minute,
        day_of_week=schedule.day_of_week,
        day_of_month=schedule.day_of_month,
        retention_count=schedule.retention_count,
        retention_days=schedule.retention_days,
        naming_pattern=schedule.naming_pattern,
        description=schedule.description,
        include_ram=schedule.include_ram,
        is_active=schedule.is_active,
        created_at=schedule.created_at.isoformat() if schedule.created_at else "",
        updated_at=schedule.updated_at.isoformat() if schedule.updated_at else None,
        last_run_at=schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        next_run_at=schedule.next_run_at.isoformat() if schedule.next_run_at else None,
        last_status=schedule.last_status,
        last_error=schedule.last_error,
        run_count=schedule.run_count
    )


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_permission("snapshot", "delete")
async def delete_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a snapshot schedule."""
    result = await db.execute(
        select(SnapshotSchedule).where(SnapshotSchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
    
    await db.delete(schedule)
    await db.commit()
    
    return None


@router.post("/{schedule_id}/run", status_code=status.HTTP_202_ACCEPTED)
@require_permission("snapshot", "create")
async def run_schedule_now(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually trigger a schedule to run immediately."""
    result = await db.execute(
        select(SnapshotSchedule).where(SnapshotSchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
    
    # This would trigger the snapshot task asynchronously
    # For now, just return accepted
    return {
        "message": "Schedule triggered successfully",
        "schedule_id": schedule_id,
        "status": "queued"
    }
