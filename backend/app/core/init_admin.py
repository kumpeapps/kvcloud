"""Initialize admin user on startup."""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.core.security import get_password_hash
from app.core.config import settings

logger = logging.getLogger(__name__)


async def init_admin_user(db: AsyncSession) -> None:
    """Create initial admin user if it doesn't exist."""
    try:
        # Check if any superuser exists
        result = await db.execute(
            select(User).where(User.is_superuser == True)
        )
        existing_admin = result.scalar_one_or_none()
        
        if existing_admin:
            logger.info(f"Admin user already exists: {existing_admin.username}")
            return
        
        # Create admin user
        admin_user = User(
            username=settings.INITIAL_ADMIN_USERNAME,
            email=settings.INITIAL_ADMIN_EMAIL,
            hashed_password=get_password_hash(settings.INITIAL_ADMIN_PASSWORD),
            full_name=settings.INITIAL_ADMIN_FULL_NAME,
            is_active=True,
            is_superuser=True,
        )
        
        db.add(admin_user)
        await db.commit()
        await db.refresh(admin_user)
        
        logger.info(f"✓ Initial admin user created: {admin_user.username}")
        logger.warning(
            f"⚠ Default admin credentials - "
            f"Username: {settings.INITIAL_ADMIN_USERNAME}, "
            f"Password: {settings.INITIAL_ADMIN_PASSWORD}"
        )
        logger.warning("⚠ Please change the default password immediately!")
        
    except Exception as e:
        logger.error(f"Error creating admin user: {e}")
        await db.rollback()
        raise
