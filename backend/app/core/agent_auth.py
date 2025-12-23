"""Agent API key authentication."""
import secrets
from fastapi import Header, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.vm_assignment import VMAssignment


def generate_agent_api_key() -> str:
    """Generate a high-entropy agent API key."""
    # Generate 32 bytes (256 bits) of random data
    random_part = secrets.token_urlsafe(32)
    return f"kvcloud_agent_{random_part}"


async def verify_agent_key(
    x_agent_key: str = Header(..., description="Agent API key"),
    db: AsyncSession = Depends(get_db)
) -> VMAssignment:
    """Verify agent API key and return the VM assignment.
    
    Args:
        x_agent_key: The API key from X-Agent-Key header
        db: Database session
        
    Returns:
        VMAssignment if valid
        
    Raises:
        HTTPException: If key is invalid or not found
    """
    if not x_agent_key or not x_agent_key.startswith("kvcloud_agent_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid agent API key format"
        )
    
    # Find VM assignment by API key
    stmt = select(VMAssignment).where(VMAssignment.agent_api_key == x_agent_key)
    result = await db.execute(stmt)
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired agent API key"
        )
    
    return assignment
