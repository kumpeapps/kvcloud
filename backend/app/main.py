"""Main FastAPI application."""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.rbac import init_rbac
from app.plugins.base import plugin_manager
from app.modules.base import module_manager
from app.api import auth, clusters, vms


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    await init_db()
    
    # Initialize RBAC
    rbac_model_path = Path(__file__).parent / "core" / "rbac_model.conf"
    rbac_policy_path = Path(__file__).parent / "core" / "rbac_policy.csv"
    init_rbac(str(rbac_model_path), str(rbac_policy_path))
    
    # Load plugins
    plugins_path = Path(__file__).parent / "plugins"
    await plugin_manager.load_plugins(plugins_path)
    
    # Initialize modules
    await module_manager.initialize_modules()
    
    yield
    
    # Shutdown
    await plugin_manager.shutdown_plugins()
    await module_manager.shutdown_modules()
    await close_db()


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="Virtual cloud panel for managing VMs on Proxmox clusters",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(auth.router)
app.include_router(clusters.router)
app.include_router(vms.router)

# Register module routers
for router in module_manager.get_all_routers():
    app.include_router(router)

# Register plugin routers
for router in plugin_manager.get_all_routes():
    app.include_router(router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": "0.1.0",
        "description": "Virtual cloud panel for managing VMs on Proxmox clusters"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/plugins")
async def list_plugins():
    """List all loaded plugins."""
    return {"plugins": plugin_manager.get_all_plugins()}


@app.get("/modules")
async def list_modules():
    """List all registered modules."""
    return {"modules": module_manager.get_all_modules()}
