"""Role-Based Access Control (RBAC) implementation using Casbin."""
import casbin
import casbin_sqlalchemy_adapter
from pathlib import Path
from typing import Optional
from functools import wraps
from fastapi import HTTPException, status


class RBACManager:
    """Manager for RBAC operations using Casbin."""
    
    def __init__(self, model_path: str, database_url: str):
        """Initialize RBAC manager with database adapter."""
        self.enforcer: Optional[casbin.Enforcer] = None
        self.model_path = model_path
        self.database_url = database_url
        self._initialize()
    
    def _initialize(self):
        """Initialize Casbin enforcer with database adapter."""
        try:
            # Convert async database URL to sync for Casbin
            sync_url = self.database_url.replace("+aiosqlite", "")
            adapter = casbin_sqlalchemy_adapter.Adapter(sync_url)
            self.enforcer = casbin.Enforcer(self.model_path, adapter)
            self.enforcer.load_policy()
        except Exception as e:
            print(f"Error initializing RBAC: {e}")
            import traceback
            traceback.print_exc()
            self.enforcer = None
    
    def enforce(self, subject: str, object: str, action: str) -> bool:
        """Check if a subject can perform an action on an object."""
        if not self.enforcer:
            return False
        return self.enforcer.enforce(subject, object, action)
    
    def check_permission(self, user_role: str, resource: str, action: str) -> bool:
        """Check if a role has permission for resource:action."""
        if not self.enforcer:
            return False
        return self.enforcer.enforce(user_role, resource, action)
    
    def add_role_for_user(self, user: str, role: str) -> bool:
        """Add a role to a user."""
        if not self.enforcer:
            return False
        return self.enforcer.add_role_for_user(user, role)
    
    def add_policy(self, subject: str, object: str, action: str) -> bool:
        """Add a policy."""
        if not self.enforcer:
            return False
        return self.enforcer.add_policy(subject, object, action)
    
    def remove_role_for_user(self, user: str, role: str) -> bool:
        """Remove a role from a user."""
        if not self.enforcer:
            return False
        return self.enforcer.delete_role_for_user(user, role)
    
    def get_roles_for_user(self, user: str) -> list:
        """Get all roles for a user."""
        if not self.enforcer:
            return []
        return self.enforcer.get_roles_for_user(user)
    
    def get_users_for_role(self, role: str) -> list:
        """Get all users with a specific role."""
        if not self.enforcer:
            return []
        return self.enforcer.get_users_for_role(role)
    
    def get_permissions_for_user(self, user: str) -> list:
        """Get all permissions for a user."""
        if not self.enforcer:
            return []
        return self.enforcer.get_permissions_for_user(user)


# Default RBAC instance
rbac: Optional[RBACManager] = None
enforcer: Optional[casbin.Enforcer] = None  # Direct access to Casbin enforcer


def get_rbac() -> Optional[RBACManager]:
    """Get the RBAC manager instance."""
    return rbac


def init_rbac(model_path: str, database_url: str):
    """Initialize the global RBAC manager with database adapter."""
    global rbac, enforcer
    rbac = RBACManager(model_path, database_url)
    if rbac and rbac.enforcer:
        enforcer = rbac.enforcer


def require_permission(resource: str, action: str):
    """
    Decorator to enforce permission check on API endpoints.
    
    Usage:
        @require_permission("vm", "create")
        async def create_vm(...):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract current_user from kwargs
            current_user = kwargs.get('current_user')
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            
            # Superusers bypass all checks
            if current_user.is_superuser:
                return await func(*args, **kwargs)
            
            # Get user's role (simplified - assumes single role per user)
            user_role = getattr(current_user, 'role', 'user')
            
            # Check permission using RBAC
            if rbac and rbac.check_permission(user_role, resource, action):
                return await func(*args, **kwargs)
            
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {resource}:{action}"
            )
        return wrapper
    return decorator
