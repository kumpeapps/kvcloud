"""Notification management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


# Pydantic models
class NotificationCreate(BaseModel):
    """Model for creating a notification."""
    title: str
    message: str
    type: str = "info"  # info, success, warning, error
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    action_url: Optional[str] = None
    expires_at: Optional[datetime] = None


class NotificationResponse(BaseModel):
    """Model for notification API responses."""
    id: int
    user_id: int
    title: str
    message: str
    type: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    action_url: Optional[str]
    is_read: bool
    read_at: Optional[str]
    created_at: str
    expires_at: Optional[str]

    class Config:
        from_attributes = True


class NotificationStats(BaseModel):
    """Statistics about user notifications."""
    total: int
    unread: int
    by_type: dict


@router.get("/", response_model=List[NotificationResponse])
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get notifications for the current user."""
    query = select(Notification).where(Notification.user_id == current_user.id)
    
    if unread_only:
        query = query.where(Notification.is_read == False)
    
    # Order by created_at descending (newest first)
    query = query.order_by(Notification.created_at.desc())
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return [
        NotificationResponse(
            id=n.id,
            user_id=n.user_id,
            title=n.title,
            message=n.message,
            type=n.type,
            resource_type=n.resource_type,
            resource_id=n.resource_id,
            action_url=n.action_url,
            is_read=n.is_read,
            read_at=n.read_at.isoformat() if n.read_at else None,
            created_at=n.created_at.isoformat(),
            expires_at=n.expires_at.isoformat() if n.expires_at else None
        )
        for n in notifications
    ]


@router.get("/stats", response_model=NotificationStats)
async def get_notification_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get notification statistics for the current user."""
    # Count total notifications
    total_query = select(func.count()).select_from(Notification).where(
        Notification.user_id == current_user.id
    )
    total_result = await db.execute(total_query)
    total = total_result.scalar() or 0
    
    # Count unread notifications
    unread_query = select(func.count()).select_from(Notification).where(
        and_(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
    )
    unread_result = await db.execute(unread_query)
    unread = unread_result.scalar() or 0
    
    # Count by type
    type_query = select(
        Notification.type,
        func.count(Notification.id).label('count')
    ).where(
        Notification.user_id == current_user.id
    ).group_by(Notification.type)
    
    type_result = await db.execute(type_query)
    by_type = {row[0]: row[1] for row in type_result.all()}
    
    return NotificationStats(
        total=total,
        unread=unread,
        by_type=by_type
    )


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific notification."""
    query = select(Notification).where(
        and_(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    result = await db.execute(query)
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return NotificationResponse(
        id=notification.id,
        user_id=notification.user_id,
        title=notification.title,
        message=notification.message,
        type=notification.type,
        resource_type=notification.resource_type,
        resource_id=notification.resource_id,
        action_url=notification.action_url,
        is_read=notification.is_read,
        read_at=notification.read_at.isoformat() if notification.read_at else None,
        created_at=notification.created_at.isoformat(),
        expires_at=notification.expires_at.isoformat() if notification.expires_at else None
    )


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a notification as read."""
    query = select(Notification).where(
        and_(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    result = await db.execute(query)
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        await db.commit()
        await db.refresh(notification)
    
    return NotificationResponse(
        id=notification.id,
        user_id=notification.user_id,
        title=notification.title,
        message=notification.message,
        type=notification.type,
        resource_type=notification.resource_type,
        resource_id=notification.resource_id,
        action_url=notification.action_url,
        is_read=notification.is_read,
        read_at=notification.read_at.isoformat() if notification.read_at else None,
        created_at=notification.created_at.isoformat(),
        expires_at=notification.expires_at.isoformat() if notification.expires_at else None
    )


@router.post("/read-all")
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all notifications as read for the current user."""
    query = select(Notification).where(
        and_(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
    )
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    for notification in notifications:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
    
    await db.commit()
    
    return {"message": f"Marked {len(notifications)} notifications as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a specific notification."""
    query = select(Notification).where(
        and_(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    result = await db.execute(query)
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    await db.delete(notification)
    await db.commit()
    
    return {"message": "Notification deleted successfully"}


@router.delete("/")
async def delete_all_notifications(
    read_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete all notifications for the current user."""
    if read_only:
        # Delete only read notifications
        query = delete(Notification).where(
            and_(
                Notification.user_id == current_user.id,
                Notification.is_read == True
            )
        )
    else:
        # Delete all notifications
        query = delete(Notification).where(
            Notification.user_id == current_user.id
        )
    
    result = await db.execute(query)
    await db.commit()
    
    return {"message": f"Deleted {result.rowcount} notifications"}
