"""Main FastAPI application."""
from contextlib import asynccontextmanager
from pathlib import Path
import subprocess
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db, close_db, get_db
from app.core.rbac import init_rbac
from app.core.init_admin import init_admin_user
from app.core.init_rbac import init_rbac_policies
from app.core.audit_middleware import AuditMiddleware
from app.plugins.base import plugin_manager
from app.modules.base import module_manager
from app.api import auth, clusters, vms, users, roles, ippools, isos, snapshots, metrics, console, vnc_proxy, backups, snapshot_schedules, audit_logs, quotas, backup_plans, firewall, metric_history, plans, vm_requests, cloud_init, ssh_keys, vm_users, cloud_images, provision, templates, tasks, agent

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("========== KVCLOUD STARTUP ==========")
    logger.info(f"Database URL: {settings.DATABASE_URL}")
    logger.info("Running Alembic migrations...")
    
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            check=True,
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent
        )
        logger.info("✓ Migrations completed successfully")
        if result.stdout:
            logger.info(f"Migration output: {result.stdout}")
    except subprocess.CalledProcessError as e:
        logger.error(f"✗ Migration failed: {e}")
        logger.error(f"STDOUT: {e.stdout if hasattr(e, 'stdout') else 'N/A'}")
        logger.error(f"STDERR: {e.stderr if hasattr(e, 'stderr') else 'N/A'}")
        # Continue anyway - database might already be up to date
    except FileNotFoundError as e:
        logger.error(f"✗ Alembic not found: {e}")
        logger.error("Make sure alembic is installed: pip install alembic")
    
    logger.info("Initializing database...")
    await init_db()
    logger.info("✓ Database initialized")
    
    # Initialize admin user and RBAC policies
    logger.info("Initializing admin user and RBAC policies...")
    async for db in get_db():
        await init_admin_user(db)
        await init_rbac_policies(db)
        break
    logger.info("✓ Admin user and RBAC policies initialized")
    
    # Initialize RBAC with database adapter
    logger.info("Initializing RBAC...")
    rbac_model_path = Path(__file__).parent / "core" / "rbac_model.conf"
    init_rbac(str(rbac_model_path), settings.DATABASE_URL)
    logger.info("✓ RBAC initialized")
    
    # Load plugins
    logger.info("Loading plugins...")
    plugins_path = Path(__file__).parent / "plugins"
    await plugin_manager.load_plugins(plugins_path)
    logger.info("✓ Plugins loaded")
    
    # Initialize modules
    logger.info("Initializing modules...")
    await module_manager.initialize_modules()
    logger.info("✓ Modules initialized")
    logger.info("========== KVCLOUD READY ==========")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    await plugin_manager.shutdown_plugins()
    await module_manager.shutdown_modules()
    await close_db()
    logger.info("✓ Shutdown complete")


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

# Add audit logging middleware
app.add_middleware(AuditMiddleware, log_read_operations=True)

# Register API routers
app.include_router(auth.router)
app.include_router(clusters.router)
app.include_router(vms.router)
app.include_router(users.router)
app.include_router(roles.router)
app.include_router(ippools.router)
app.include_router(isos.router)
app.include_router(snapshots.router)
app.include_router(snapshot_schedules.router)
app.include_router(audit_logs.router)
app.include_router(quotas.router)
app.include_router(backup_plans.router)
app.include_router(firewall.router)
app.include_router(metrics.router)
app.include_router(metric_history.router)
app.include_router(console.router)
app.include_router(vnc_proxy.router)
app.include_router(backups.router)
app.include_router(plans.router)
app.include_router(vm_requests.router)
app.include_router(cloud_init.router)
app.include_router(ssh_keys.router)
app.include_router(vm_users.router)
app.include_router(cloud_images.router)
app.include_router(provision.router)
app.include_router(templates.router)
app.include_router(tasks.router)
app.include_router(agent.router)

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
