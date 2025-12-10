"""API endpoints for user SSH key management."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.models.user_ssh_key import UserSshKey


router = APIRouter(prefix="/ssh-keys", tags=["ssh-keys"])


class UserSshKeyCreate(BaseModel):
    name: str
    public_key: str
    fingerprint: str | None = None


class UserSshKeyResponse(BaseModel):
    id: int
    name: str
    fingerprint: str | None = None
    is_active: bool


@router.post("/my-keys")
@require_permission("user", "manage_ssh_keys")
async def create_ssh_key(data: UserSshKeyCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Create a new SSH key for the current user."""
    key = UserSshKey(
        user_id=current_user.id,
        name=data.name,
        public_key=data.public_key,
        fingerprint=data.fingerprint
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    return {"id": key.id, "name": key.name, "fingerprint": key.fingerprint}


@router.get("/my-keys")
@require_permission("user", "manage_ssh_keys")
async def list_my_ssh_keys(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """List all SSH keys for the current user."""
    result = await db.execute(
        select(UserSshKey).where(UserSshKey.user_id == current_user.id).order_by(UserSshKey.created_at.desc())
    )
    keys = result.scalars().all()
    return {
        "keys": [
            {
                "id": k.id,
                "name": k.name,
                "fingerprint": k.fingerprint,
                "is_active": k.is_active,
                "created_at": k.created_at.isoformat() if k.created_at else None
            }
            for k in keys
        ]
    }


@router.put("/my-keys/{key_id}")
@require_permission("user", "manage_ssh_keys")
async def update_ssh_key(key_id: int, data: UserSshKeyCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Update an SSH key (for current user only)."""
    result = await db.execute(
        select(UserSshKey).where(UserSshKey.id == key_id, UserSshKey.user_id == current_user.id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSH key not found")
    
    key.name = data.name
    key.public_key = data.public_key
    if data.fingerprint:
        key.fingerprint = data.fingerprint
    
    db.add(key)
    await db.commit()
    return {"message": "SSH key updated"}


@router.delete("/my-keys/{key_id}")
@require_permission("user", "manage_ssh_keys")
async def delete_ssh_key(key_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Delete an SSH key (for current user only)."""
    result = await db.execute(
        select(UserSshKey).where(UserSshKey.id == key_id, UserSshKey.user_id == current_user.id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSH key not found")
    
    await db.delete(key)
    await db.commit()
    return {"message": "SSH key deleted"}


@router.patch("/my-keys/{key_id}/toggle")
@require_permission("user", "manage_ssh_keys")
async def toggle_ssh_key(key_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Toggle SSH key active/inactive status."""
    result = await db.execute(
        select(UserSshKey).where(UserSshKey.id == key_id, UserSshKey.user_id == current_user.id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSH key not found")
    
    key.is_active = not key.is_active
    db.add(key)
    await db.commit()
    return {"is_active": key.is_active}
