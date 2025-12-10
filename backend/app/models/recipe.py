from sqlalchemy import Column, Integer, String, Text
from app.core.database import Base


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(String(1024), nullable=True)
    # Script or playbook content (shell/cloud-init compatible)
    content = Column(Text, nullable=False)
