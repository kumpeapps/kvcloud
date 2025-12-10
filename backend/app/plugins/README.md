# KVCloud Plugins

This directory contains plugins that extend KVCloud's functionality.

## Plugin Structure

Each plugin should be in its own directory with the following structure:

```
plugin_name/
├── __init__.py       # Must export Plugin class
├── plugin.py         # Main plugin implementation
├── models.py         # Optional: Database models
├── services.py       # Optional: Business logic
└── api.py           # Optional: Additional API routes
```

## Creating a Plugin

1. Create a new directory for your plugin
2. Create `plugin.py` with a class that extends `BasePlugin`
3. Implement required methods: `initialize()`, `shutdown()`, `get_routes()`
4. Export the Plugin class in `__init__.py`

## Example Plugin

See `example_plugin/` for a complete example.

To enable the example plugin, uncomment the import in `example_plugin/__init__.py`.

## Plugin Lifecycle

1. **Discovery**: Plugins are discovered at application startup
2. **Initialization**: `initialize()` is called for each plugin
3. **Route Registration**: Routes from `get_routes()` are registered
4. **Runtime**: Plugin is active and handles requests
5. **Shutdown**: `shutdown()` is called when app stops

## Best Practices

- Handle errors gracefully in `initialize()`
- Clean up resources in `shutdown()`
- Use proper HTTP status codes in routes
- Add authentication/authorization checks where needed
- Document your plugin's configuration requirements
- Include tests for your plugin functionality

## Plugin API Reference

### BasePlugin Methods

#### `async def initialize() -> bool`
Called when the plugin is loaded. Return `True` if successful, `False` to disable the plugin.

#### `async def shutdown()`
Called when the application is shutting down. Clean up resources here.

#### `def get_routes() -> List[APIRouter]`
Return a list of FastAPI routers to be registered with the application.

#### `def get_metadata() -> Dict[str, Any]`
Return plugin metadata (name, version, description, enabled status).

## Available to Plugins

Plugins have access to:
- Database sessions via dependency injection
- Authentication/authorization utilities
- Configuration settings
- All core application services
- FastAPI features (dependency injection, background tasks, etc.)

## Plugin Examples

### Simple Plugin
```python
from app.plugins.base import BasePlugin
from fastapi import APIRouter

class Plugin(BasePlugin):
    async def initialize(self) -> bool:
        return True
    
    async def shutdown(self):
        pass
    
    def get_routes(self):
        router = APIRouter(prefix="/my-plugin")
        
        @router.get("/")
        async def index():
            return {"message": "Hello"}
        
        return [router]
```

### Plugin with Database
```python
from app.plugins.base import BasePlugin
from app.core.database import get_db
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

class Plugin(BasePlugin):
    async def initialize(self) -> bool:
        # Create tables, etc.
        return True
    
    def get_routes(self):
        router = APIRouter(prefix="/my-plugin")
        
        @router.get("/data")
        async def get_data(db: AsyncSession = Depends(get_db)):
            # Query database
            return {"data": []}
        
        return [router]
```
