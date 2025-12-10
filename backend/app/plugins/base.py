"""Base plugin class and plugin manager."""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
import importlib
import pkgutil
from pathlib import Path


class BasePlugin(ABC):
    """Base class for all plugins."""
    
    def __init__(self):
        """Initialize plugin."""
        self.name: str = self.__class__.__name__
        self.version: str = "0.1.0"
        self.description: str = ""
        self.enabled: bool = True
    
    @abstractmethod
    async def initialize(self) -> bool:
        """Initialize the plugin. Returns True if successful."""
        pass
    
    @abstractmethod
    async def shutdown(self):
        """Cleanup when plugin is disabled or app shuts down."""
        pass
    
    def get_routes(self) -> List[Any]:
        """Return list of FastAPI routes to register."""
        return []
    
    def get_metadata(self) -> Dict[str, Any]:
        """Return plugin metadata."""
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "enabled": self.enabled
        }


class PluginManager:
    """Manager for loading and managing plugins."""
    
    def __init__(self):
        """Initialize plugin manager."""
        self.plugins: Dict[str, BasePlugin] = {}
        self.plugins_path: Optional[Path] = None
    
    def set_plugins_path(self, path: Path):
        """Set the path where plugins are located."""
        self.plugins_path = path
    
    async def load_plugins(self, plugins_dir: Optional[Path] = None):
        """Dynamically load all plugins from plugins directory."""
        if plugins_dir:
            self.plugins_path = plugins_dir
        
        if not self.plugins_path or not self.plugins_path.exists():
            return
        
        # Discover and load plugins
        for finder, name, ispkg in pkgutil.iter_modules([str(self.plugins_path)]):
            if ispkg:
                try:
                    module = importlib.import_module(f"app.plugins.{name}")
                    # Look for Plugin class in module
                    if hasattr(module, "Plugin"):
                        plugin_class = getattr(module, "Plugin")
                        if issubclass(plugin_class, BasePlugin):
                            plugin = plugin_class()
                            if await plugin.initialize():
                                self.plugins[plugin.name] = plugin
                except Exception as e:
                    print(f"Error loading plugin {name}: {e}")
    
    async def shutdown_plugins(self):
        """Shutdown all plugins."""
        for plugin in self.plugins.values():
            try:
                await plugin.shutdown()
            except Exception as e:
                print(f"Error shutting down plugin {plugin.name}: {e}")
    
    def get_plugin(self, name: str) -> Optional[BasePlugin]:
        """Get a plugin by name."""
        return self.plugins.get(name)
    
    def get_all_plugins(self) -> List[Dict[str, Any]]:
        """Get metadata for all plugins."""
        return [plugin.get_metadata() for plugin in self.plugins.values()]
    
    def get_all_routes(self) -> List[Any]:
        """Get all routes from all plugins."""
        routes = []
        for plugin in self.plugins.values():
            if plugin.enabled:
                routes.extend(plugin.get_routes())
        return routes


# Global plugin manager instance
plugin_manager = PluginManager()
