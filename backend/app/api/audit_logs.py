from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from ..core.database import get_db
from ..core.dependencies import get_current_user, require_permission
from ..models.user import User
from ..models.audit_log import AuditLog

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    username: str
    action: str
    resource_type: str
    resource_id: Optional[str]
    resource_name: Optional[str]
    endpoint: str
    method: str
    ip_address: Optional[str]
    user_agent: Optional[str]
    description: Optional[str]
    response_status: Optional[int]
    status: str
    error_message: Optional[str]
    duration_ms: Optional[int]
    created_at: str
    
    class Config:
        from_attributes = True


@router.get("/", response_model=List[AuditLogResponse])
@require_permission("audit", "read")
async def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    resource_type: Optional[str] = None,
    action: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List audit logs with filtering.
    Requires admin privileges.
    """
    query = select(AuditLog).order_by(desc(AuditLog.created_at))
    
    # Apply filters
    filters = []
    if user_id:
        filters.append(AuditLog.user_id == user_id)
    if username:
        filters.append(AuditLog.username.like(f"%{username}%"))
    if resource_type:
        filters.append(AuditLog.resource_type == resource_type)
    if action:
        filters.append(AuditLog.action == action)
    if status:
        filters.append(AuditLog.status == status)
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            filters.append(AuditLog.created_at >= start)
        except:
            pass
    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            filters.append(AuditLog.created_at <= end)
        except:
            pass
    
    if filters:
        query = query.where(and_(*filters))
    
    query = query.offset(skip).limit(limit)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return [
        AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            username=log.username,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            resource_name=log.resource_name,
            endpoint=log.endpoint,
            method=log.method,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            description=log.description,
            response_status=log.response_status,
            status=log.status,
            error_message=log.error_message,
            duration_ms=log.duration_ms,
            created_at=log.created_at.isoformat() if log.created_at else ""
        )
        for log in logs
    ]


@router.get("/{log_id}", response_model=AuditLogResponse)
@require_permission("audit", "read")
async def get_audit_log(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific audit log entry."""
    result = await db.execute(
        select(AuditLog).where(AuditLog.id == log_id)
    )
    log = result.scalar_one_or_none()
    
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit log not found"
        )
    
    return AuditLogResponse(
        id=log.id,
        user_id=log.user_id,
        username=log.username,
        action=log.action,
        resource_type=log.resource_type,
        resource_id=log.resource_id,
        resource_name=log.resource_name,
        endpoint=log.endpoint,
        method=log.method,
        ip_address=log.ip_address,
        user_agent=log.user_agent,
        description=log.description,
        response_status=log.response_status,
        status=log.status,
        error_message=log.error_message,
        duration_ms=log.duration_ms,
        created_at=log.created_at.isoformat() if log.created_at else ""
    )


@router.get("/stats/summary")
@require_permission("audit", "read")
async def get_audit_stats(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get audit log statistics for the specified number of days."""
    start_date = datetime.now() - timedelta(days=days)
    
    from sqlalchemy import func
    
    # Total actions
    total_result = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.created_at >= start_date)
    )
    total_actions = total_result.scalar() or 0
    
    # Actions by type
    actions_result = await db.execute(
        select(AuditLog.action, func.count(AuditLog.id))
        .where(AuditLog.created_at >= start_date)
        .group_by(AuditLog.action)
    )
    actions_by_type = {row[0]: row[1] for row in actions_result.fetchall()}
    
    # Actions by resource
    resources_result = await db.execute(
        select(AuditLog.resource_type, func.count(AuditLog.id))
        .where(AuditLog.created_at >= start_date)
        .group_by(AuditLog.resource_type)
    )
    actions_by_resource = {row[0]: row[1] for row in resources_result.fetchall()}
    
    # Top users
    users_result = await db.execute(
        select(AuditLog.username, func.count(AuditLog.id))
        .where(AuditLog.created_at >= start_date)
        .group_by(AuditLog.username)
        .order_by(desc(func.count(AuditLog.id)))
        .limit(10)
    )
    top_users = [{"username": row[0], "count": row[1]} for row in users_result.fetchall()]
    
    # Failed actions
    failed_result = await db.execute(
        select(func.count(AuditLog.id))
        .where(and_(AuditLog.created_at >= start_date, AuditLog.status == "failed"))
    )
    failed_actions = failed_result.scalar() or 0
    
    return {
        "period_days": days,
        "start_date": start_date.isoformat(),
        "total_actions": total_actions,
        "failed_actions": failed_actions,
        "success_rate": round((total_actions - failed_actions) / total_actions * 100, 2) if total_actions > 0 else 100.0,
        "actions_by_type": actions_by_type,
        "actions_by_resource": actions_by_resource,
        "top_users": top_users
    }


@router.delete("/cleanup")
@require_permission("audit", "delete")
async def cleanup_old_logs(
    days: int = Query(90, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete audit logs older than specified days.
    Requires admin privileges.
    """
    cutoff_date = datetime.now() - timedelta(days=days)
    
    result = await db.execute(
        select(AuditLog).where(AuditLog.created_at < cutoff_date)
    )
    logs = result.scalars().all()
    count = len(logs)
    
    for log in logs:
        await db.delete(log)
    
    await db.commit()
    
    return {
        "message": f"Deleted {count} audit logs older than {days} days",
        "deleted_count": count,
        "cutoff_date": cutoff_date.isoformat()
    }
