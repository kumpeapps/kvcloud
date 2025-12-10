from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import rbac_manager
from app.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("/")
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all available roles with their permissions."""
    
    # Get all policies from RBAC
    policies = rbac_manager.enforcer.get_policy()
    
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
    for role in roles:
        permissions = enforcer.get_permissions_for_user(f"role:{role.name}")
        permission_strings = [f"{perm[1]}:{perm[2]}" for perm in permissions]
        
        role_responses.append(RoleResponse(
            id=role.id,
            name=role.name,
            description=role.description,
            permissions=permission_strings,
            created_at=role.created_at.isoformat() if role.created_at else "",
            updated_at=role.updated_at.isoformat() if role.updated_at else None
        ))
    
    return role_responses


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific role by ID."""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Get permissions from Casbin
    permissions = enforcer.get_permissions_for_user(f"role:{role.name}")
    permission_strings = [f"{perm[1]}:{perm[2]}" for perm in permissions]
    
    return RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=permission_strings,
        created_at=role.created_at.isoformat() if role.created_at else "",
        updated_at=role.updated_at.isoformat() if role.updated_at else None
    )


@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    role_data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new role. Requires admin privileges."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can create roles"
        )
    
    # Check if role already exists
    result = await db.execute(select(Role).where(Role.name == role_data.name))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role name already exists"
        )
    
    # Create role
    db_role = Role(
        name=role_data.name,
        description=role_data.description
    )
    
    db.add(db_role)
    await db.commit()
    await db.refresh(db_role)
    
    # Add permissions to Casbin
    role_subject = f"role:{db_role.name}"
    for permission in role_data.permissions:
        try:
            resource, action = permission.split(":")
            enforcer.add_policy(role_subject, resource, action)
        except ValueError:
            # Skip invalid permission format
            pass
    
    enforcer.save_policy()
    
    return RoleResponse(
        id=db_role.id,
        name=db_role.name,
        description=db_role.description,
        permissions=role_data.permissions,
        created_at=db_role.created_at.isoformat() if db_role.created_at else "",
        updated_at=db_role.updated_at.isoformat() if db_role.updated_at else None
    )


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    role_data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a role. Requires admin privileges."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can update roles"
        )
    
    result = await db.execute(select(Role).where(Role.id == role_id))
    db_role = result.scalar_one_or_none()
    
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    old_role_subject = f"role:{db_role.name}"
    
    # Update name if provided
    if role_data.name is not None:
        # Check if new name is already taken
        result = await db.execute(
            select(Role).where(Role.name == role_data.name, Role.id != role_id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role name already exists"
            )
        db_role.name = role_data.name
    
    if role_data.description is not None:
        db_role.description = role_data.description
    
    await db.commit()
    await db.refresh(db_role)
    
    new_role_subject = f"role:{db_role.name}"
    
    # Update permissions in Casbin if provided
    if role_data.permissions is not None:
        # Remove old permissions
        enforcer.delete_user(old_role_subject)
        
        # Add new permissions
        for permission in role_data.permissions:
            try:
                resource, action = permission.split(":")
                enforcer.add_policy(new_role_subject, resource, action)
            except ValueError:
                pass
        
        enforcer.save_policy()
    
    # Get current permissions
    permissions = enforcer.get_permissions_for_user(new_role_subject)
    permission_strings = [f"{perm[1]}:{perm[2]}" for perm in permissions]
    
    return RoleResponse(
        id=db_role.id,
        name=db_role.name,
        description=db_role.description,
        permissions=permission_strings,
        created_at=db_role.created_at.isoformat() if db_role.created_at else "",
        updated_at=db_role.updated_at.isoformat() if db_role.updated_at else None
    )


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a role. Requires admin privileges."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can delete roles"
        )
    
    result = await db.execute(select(Role).where(Role.id == role_id))
    db_role = result.scalar_one_or_none()
    
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Remove all permissions for this role from Casbin
    role_subject = f"role:{db_role.name}"
    enforcer.delete_user(role_subject)
    enforcer.save_policy()
    
    await db.delete(db_role)
    await db.commit()
    
    return None
