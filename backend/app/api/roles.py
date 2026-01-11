from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
from pydantic import BaseModel
import hashlib
from app.core.dependencies import get_current_user, require_permission
from app.models.user import User
import app.core.rbac as rbac_module

router = APIRouter(prefix="/roles", tags=["roles"])


class CreateRoleRequest(BaseModel):
    """Request model for creating a role."""
    name: str
    description: str = ""
    permissions: List[str] = []  # List of "resource:action" strings


class UpdateRoleRequest(BaseModel):
    """Request model for updating a role."""
    name: str
    description: str = ""
    permissions: List[str] = []  # List of "resource:action" strings


def generate_role_id(role_name: str) -> int:
    """Generate a consistent numeric ID from role name."""
    hash_bytes = hashlib.md5(role_name.encode()).digest()
    return int.from_bytes(hash_bytes[:4], byteorder='big') & 0x7FFFFFFF


@router.get("/")
@require_permission("role", "read")
async def list_roles(
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all available roles with their permissions from RBAC policies."""
    
    # Get enforcer from the module (not as a direct import)
    enforcer = rbac_module.enforcer
    
    if not enforcer:
        return []
    
    policies = enforcer.get_policy()
    
    # Organize by role
    roles_dict = {}
    for policy in policies:
        role_name = policy[0]
        resource = policy[1]
        action = policy[2]
        
        if role_name not in roles_dict:
            roles_dict[role_name] = {
                'id': generate_role_id(role_name),
                'name': role_name,
                'description': f'{role_name.capitalize()} role',
                'permissions': [],
                'created_at': '',
                'updated_at': ''
            }
        
        roles_dict[role_name]['permissions'].append(f'{resource}:{action}')
    
    return list(roles_dict.values())


@router.get("/available")
@require_permission("role", "read")
async def list_available_roles(
    current_user: User = Depends(get_current_user)
) -> List[str]:
    """List available role names."""
    return ['admin', 'user', 'viewer']


@router.post("/")
@require_permission("role", "create")
async def create_role(
    role_data: CreateRoleRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new custom role with specified permissions."""
    
    enforcer = rbac_module.enforcer
    if not enforcer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RBAC system not available"
        )
    
    # Check if role already exists
    existing_policies = enforcer.get_filtered_policy(0, role_data.name)
    if existing_policies:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role '{role_data.name}' already exists"
        )
    
    # Add permissions for the new role
    for permission in role_data.permissions:
        try:
            resource, action = permission.split(':', 1)
            enforcer.add_policy(role_data.name, resource, action)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid permission format: {permission}. Expected 'resource:action'"
            )
    
    # Save policies to database
    enforcer.save_policy()
    
    return {
        'id': generate_role_id(role_data.name),
        'name': role_data.name,
        'description': role_data.description,
        'permissions': role_data.permissions,
        'created_at': '',
        'updated_at': ''
    }


@router.put("/{role_name}")
@require_permission("role", "update")
async def update_role(
    role_name: str,
    role_data: UpdateRoleRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Update an existing role's permissions."""
    
    # Prevent modification of built-in roles
    if role_name in ['admin', 'user', 'viewer']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot modify built-in role '{role_name}'"
        )
    
    enforcer = rbac_module.enforcer
    if not enforcer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RBAC system not available"
        )
    
    # Remove all existing permissions for this role
    enforcer.remove_filtered_policy(0, role_name)
    
    # Add new permissions
    for permission in role_data.permissions:
        try:
            resource, action = permission.split(':', 1)
            enforcer.add_policy(role_name, resource, action)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid permission format: {permission}. Expected 'resource:action'"
            )
    
    # Save policies to database
    enforcer.save_policy()
    
    return {
        'id': generate_role_id(role_name),
        'name': role_name,
        'description': role_data.description,
        'permissions': role_data.permissions,
        'created_at': '',
        'updated_at': ''
    }


@router.delete("/{role_name}")
@require_permission("role", "delete")
async def delete_role(
    role_name: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """Delete a custom role."""
    
    # Prevent deletion of built-in roles
    if role_name in ['admin', 'user', 'viewer']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot delete built-in role '{role_name}'"
        )
    
    enforcer = rbac_module.enforcer
    if not enforcer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RBAC system not available"
        )
    
    # Remove all policies for this role
    enforcer.remove_filtered_policy(0, role_name)
    
    # Save policies to database
    enforcer.save_policy()
    
    return {'message': f"Role '{role_name}' deleted successfully"}
