"""Role-Based Access Control (RBAC) implementation using Casbin."""
import casbin
from pathlib import Path
from typing import Optional


class RBACManager:
    """Manager for RBAC operations using Casbin."""
    
    def __init__(self, model_path: str, policy_path: str):
        """Initialize RBAC manager."""
        self.enforcer: Optional[casbin.Enforcer] = None
        self.model_path = model_path
        self.policy_path = policy_path
        self._initialize()
    
    def _initialize(self):
        """Initialize Casbin enforcer."""
        try:
            self.enforcer = casbin.Enforcer(self.model_path, self.policy_path)
        except Exception as e:
            print(f"Error initializing RBAC: {e}")
            self.enforcer = None
    
    def enforce(self, subject: str, object: str, action: str) -> bool:
        """Check if a subject can perform an action on an object."""
        if not self.enforcer:
            return False
        return self.enforcer.enforce(subject, object, action)
    
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


# Default RBAC instance
rbac: Optional[RBACManager] = None


def get_rbac() -> Optional[RBACManager]:
    """Get the RBAC manager instance."""
    return rbac


def init_rbac(model_path: str, policy_path: str):
    """Initialize the global RBAC manager."""
    global rbac
    rbac = RBACManager(model_path, policy_path)
