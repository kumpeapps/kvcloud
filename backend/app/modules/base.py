"""Base module class and module manager."""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from fastapi import APIRouter


class BaseModule(ABC):
    """Base class for all modules."""
    
    def __init__(self, name: str, prefix: str):
        """Initialize module.
        
        Args:
            name: Module name
            prefix: URL prefix for module routes (e.g., '/vm', '/storage')
        """
        self.name = name
        self.prefix = prefix
        self.router = APIRouter(prefix=prefix, tags=[name])
        self.enabled = True
    
    @abstractmethod
    async def initialize(self) -> bool:
        """Initialize the module. Returns True if successful."""
        pass
    
    @abstractmethod
    async def shutdown(self):
        """Cleanup when module is disabled or app shuts down."""
        pass
    
    @abstractmethod
    def register_routes(self):
        """Register module routes."""
        pass
    
    def get_router(self) -> APIRouter:
        """Get the module's router."""
        return self.router
    
    def get_metadata(self) -> Dict[str, Any]:
        """Return module metadata."""
        return {
            "name": self.name,
            "prefix": self.prefix,
            "enabled": self.enabled
        }


class ModuleManager:
    """Manager for loading and managing modules."""
    
    def __init__(self):
        """Initialize module manager."""
        self.modules: Dict[str, BaseModule] = {}
    
    def register_module(self, module: BaseModule):
        """Register a module."""
        self.modules[module.name] = module
    
    async def initialize_modules(self):
        """Initialize all registered modules."""
        for module in self.modules.values():
            try:
                if await module.initialize():
                    module.register_routes()
            except Exception as e:
                print(f"Error initializing module {module.name}: {e}")
    
    async def shutdown_modules(self):
        """Shutdown all modules."""
        for module in self.modules.values():
            try:
                await module.shutdown()
            except Exception as e:
                print(f"Error shutting down module {module.name}: {e}")
    
    def get_module(self, name: str) -> Optional[BaseModule]:
        """Get a module by name."""
        return self.modules.get(name)
    
    def get_all_modules(self) -> List[Dict[str, Any]]:
        """Get metadata for all modules."""
        return [module.get_metadata() for module in self.modules.values()]
    
    def get_all_routers(self) -> List[APIRouter]:
        """Get all routers from all modules."""
        return [module.get_router() for module in self.modules.values() if module.enabled]


# Global module manager instance
module_manager = ModuleManager()
