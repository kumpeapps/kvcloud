from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from app.core.dependencies import get_current_user
from app.models.user import User
import app.core.rbac as rbac_module

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("/")
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
                'name': role_name,
                'description': f'{role_name.capitalize()} role',
                'permissions': []
            }
        
        roles_dict[role_name]['permissions'].append(f'{resource}:{action}')
    
    return list(roles_dict.values())


@router.get("/available")
async def list_available_roles(
    current_user: User = Depends(get_current_user)
) -> List[str]:
    """List available role names."""
    return ['admin', 'user', 'viewer']
