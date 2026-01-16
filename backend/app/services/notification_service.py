"""Notification service for creating and managing notifications."""
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import Optional, List

from app.models.notification import Notification
from app.models.user import User


class NotificationService:
    """Service for creating notifications."""
    
    @staticmethod
    async def create_notification(
        db: AsyncSession,
        user_id: int,
        title: str,
        message: str,
        type: str = "info",
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        action_url: Optional[str] = None,
        expires_in_days: Optional[int] = None
    ) -> Notification:
        """
        Create a notification for a user.
        
        Args:
            db: Database session
            user_id: ID of the user to notify
            title: Notification title
            message: Notification message
            type: Notification type (info, success, warning, error)
            resource_type: Type of resource related to notification
            resource_id: ID of the resource
            action_url: Optional URL for action button
            expires_in_days: Days until notification expires (None = never)
        
        Returns:
            Created notification
        """
        expires_at = None
        if expires_in_days:
            expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
        
        notification = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            resource_type=resource_type,
            resource_id=resource_id,
            action_url=action_url,
            expires_at=expires_at
        )
        
        db.add(notification)
        await db.commit()
        await db.refresh(notification)
        
        return notification
    
    @staticmethod
    async def create_vm_notification(
        db: AsyncSession,
        user_id: int,
        action: str,
        vm_id: int,
        vm_name: str,
        success: bool = True,
        error_message: Optional[str] = None
    ) -> Notification:
        """Create a VM-related notification."""
        if success:
            title = f"VM {action.capitalize()} Successful"
            message = f"VM '{vm_name}' (ID: {vm_id}) has been {action}d successfully."
            ntype = "success"
        else:
            title = f"VM {action.capitalize()} Failed"
            message = f"Failed to {action} VM '{vm_name}' (ID: {vm_id})."
            if error_message:
                message += f" Error: {error_message}"
            ntype = "error"
        
        return await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            title=title,
            message=message,
            type=ntype,
            resource_type="vm",
            resource_id=str(vm_id),
            action_url=f"/vms/{vm_id}",
            expires_in_days=7
        )
    
    @staticmethod
    async def create_backup_notification(
        db: AsyncSession,
        user_id: int,
        vm_id: int,
        vm_name: str,
        success: bool = True,
        error_message: Optional[str] = None
    ) -> Notification:
        """Create a backup-related notification."""
        if success:
            title = "Backup Completed"
            message = f"Backup of VM '{vm_name}' (ID: {vm_id}) completed successfully."
            ntype = "success"
        else:
            title = "Backup Failed"
            message = f"Backup of VM '{vm_name}' (ID: {vm_id}) failed."
            if error_message:
                message += f" Error: {error_message}"
            ntype = "error"
        
        return await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            title=title,
            message=message,
            type=ntype,
            resource_type="backup",
            resource_id=str(vm_id),
            action_url=f"/vms/{vm_id}",
            expires_in_days=30
        )
    
    @staticmethod
    async def create_snapshot_notification(
        db: AsyncSession,
        user_id: int,
        vm_id: int,
        vm_name: str,
        snapshot_name: str,
        action: str = "create",
        success: bool = True,
        error_message: Optional[str] = None
    ) -> Notification:
        """Create a snapshot-related notification."""
        if success:
            title = f"Snapshot {action.capitalize()}d"
            message = f"Snapshot '{snapshot_name}' of VM '{vm_name}' has been {action}d."
            ntype = "success"
        else:
            title = f"Snapshot {action.capitalize()} Failed"
            message = f"Failed to {action} snapshot '{snapshot_name}' of VM '{vm_name}'."
            if error_message:
                message += f" Error: {error_message}"
            ntype = "error"
        
        return await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            title=title,
            message=message,
            type=ntype,
            resource_type="snapshot",
            resource_id=str(vm_id),
            action_url=f"/snapshots?vmid={vm_id}",
            expires_in_days=7
        )
    
    @staticmethod
    async def create_task_notification(
        db: AsyncSession,
        user_id: int,
        task_name: str,
        task_id: str,
        status: str,
        error_message: Optional[str] = None
    ) -> Notification:
        """Create a task completion notification."""
        if status == "completed":
            title = "Task Completed"
            message = f"Task '{task_name}' has completed successfully."
            ntype = "success"
        elif status == "failed":
            title = "Task Failed"
            message = f"Task '{task_name}' has failed."
            if error_message:
                message += f" Error: {error_message}"
            ntype = "error"
        else:
            title = "Task Update"
            message = f"Task '{task_name}' status: {status}"
            ntype = "info"
        
        return await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            title=title,
            message=message,
            type=ntype,
            resource_type="task",
            resource_id=task_id,
            action_url=f"/tasks",
            expires_in_days=3
        )
    
    @staticmethod
    async def cleanup_expired_notifications(db: AsyncSession) -> int:
        """Delete expired notifications. Returns count of deleted notifications."""
        from sqlalchemy import delete
        
        query = delete(Notification).where(
            Notification.expires_at < datetime.utcnow()
        )
        result = await db.execute(query)
        await db.commit()
        
        return result.rowcount
