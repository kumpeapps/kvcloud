from sqlalchemy import Column, Integer, String
from app.core.database import Base


class IPGroup(Base):
    __tablename__ = "ip_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(String(1024), nullable=True)
    # Optionally bind to existing IP pool by id
    ip_pool_id = Column(Integer, nullable=True)


class ISOGroup(Base):
    __tablename__ = "iso_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(String(1024), nullable=True)
    # Storage or tag scoping can be added later
