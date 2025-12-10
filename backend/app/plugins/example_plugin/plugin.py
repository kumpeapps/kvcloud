"""Example plugin implementation."""
from app.plugins.base import BasePlugin
from fastapi import APIRouter


class Plugin(BasePlugin):
    """Example plugin demonstrating the plugin system."""
    
    def __init__(self):
        """Initialize the example plugin."""
        super().__init__()
        self.name = "ExamplePlugin"
        self.version = "1.0.0"
        self.description = "An example plugin demonstrating KVCloud's extensibility"
    
    async def initialize(self) -> bool:
        """Initialize the plugin."""
        print(f"Initializing {self.name} v{self.version}")
        # Add initialization logic here
        # e.g., database setup, external API connections, etc.
        return True
    
    async def shutdown(self):
        """Cleanup when plugin is disabled or app shuts down."""
        print(f"Shutting down {self.name}")
        # Add cleanup logic here
        # e.g., close connections, save state, etc.
    
    def get_routes(self):
        """Return list of FastAPI routes to register."""
        router = APIRouter(prefix="/example", tags=["example-plugin"])
        
        @router.get("/")
        async def plugin_root():
            """Example plugin root endpoint."""
            return {
                "plugin": self.name,
                "version": self.version,
                "description": self.description,
                "message": "Hello from the example plugin!"
            }
        
        @router.get("/status")
        async def plugin_status():
            """Example plugin status endpoint."""
            return {
                "plugin": self.name,
                "enabled": self.enabled,
                "status": "operational"
            }
        
        return [router]
