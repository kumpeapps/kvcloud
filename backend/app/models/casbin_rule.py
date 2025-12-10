"""Casbin rule model for database policy storage."""
from sqlalchemy import Column, Integer, String
from app.models.user import Base


class CasbinRule(Base):
    """Casbin rule model for storing policies in the database."""
    
    __tablename__ = "casbin_rule"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    ptype = Column(String(255), nullable=False)
    v0 = Column(String(255))
    v1 = Column(String(255))
    v2 = Column(String(255))
    v3 = Column(String(255))
    v4 = Column(String(255))
    v5 = Column(String(255))
    
    def __repr__(self):
        return f"<CasbinRule(id={self.id}, ptype='{self.ptype}')>"
