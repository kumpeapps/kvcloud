"""Dependency injection utilities to avoid circular imports."""
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from functools import wraps
from typing import Callable

from app.core.database import get_db
from app.core.security import oauth2_scheme, decode_access_token
from app.models.user import User
from app.core.rbac import enforcer


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current authenticated user from token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user (must be active)."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user


def require_permission(resource: str, action: str) -> Callable:
    """
    Decorator to check if user has permission to access endpoint.
    
    Args:
        resource: Resource type (e.g., 'vm', 'cluster', 'user')
        action: Action type (e.g., 'read', 'create', 'update', 'delete')
    
    Usage:
        @router.get("/vms")
        @require_permission("vm", "read")
        async def list_vms(current_user: User = Depends(get_current_user)):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract current_user from kwargs
            current_user = kwargs.get('current_user')
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            
            # Superusers bypass all permission checks
            if current_user.is_superuser:
                return await func(*args, **kwargs)
            
            # Check permission using Casbin
            role = current_user.role if hasattr(current_user, 'role') else 'user'
            has_permission = enforcer.enforce(role, resource, action)
            
            if not has_permission:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: {resource}:{action}"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator
