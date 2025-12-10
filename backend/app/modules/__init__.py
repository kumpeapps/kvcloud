"""Module system for KVCloud.

Modules are core functionality components that can be easily extended.
Each module should follow a standard structure with services, models, and API endpoints.
"""
from app.modules.base import BaseModule, ModuleManager

__all__ = ["BaseModule", "ModuleManager"]
