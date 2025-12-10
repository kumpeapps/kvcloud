# KVCloud

**KVCloud** is a modern virtual cloud management panel for Proxmox clusters, similar to Virtualizor. It provides comprehensive VM lifecycle management with a feature-rich Angular interface, powerful FastAPI backend, and enterprise-grade RBAC support.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11-blue.svg)
![Angular](https://img.shields.io/badge/angular-17-red.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green.svg)

## ✨ Features

### Virtual Machine Management
- **Complete VM Lifecycle**: Create, start, stop, restart, pause, resume, and delete VMs
- **VM Configuration**: Edit CPU, memory, name, and description on-the-fly
- **Snapshot Management**: Create, delete, and rollback VM snapshots
- **VM Cloning**: Clone VMs with custom IDs and names
- **Template Conversion**: Convert VMs to templates for rapid deployment
- **Real-time Monitoring**: Live CPU and memory usage charts with auto-refresh
- **VM Creation Wizard**: Intuitive multi-step wizard with ISO/template selection

### User & Access Management
- **RBAC Compliant**: Full role-based access control using Casbin
- **User Management**: Create, update, and delete users with role assignment
- **JWT Authentication**: Secure token-based authentication
- **Permission System**: Granular permissions (vm:create, vm:delete, etc.)
- **19 Predefined Permissions**: Covering all VM, user, and cluster operations

### Dashboard & Monitoring
- **Real-time Statistics**: Live VM counts, cluster status, and resource usage
- **Resource Charts**: CPU, memory, disk, and network utilization graphs
- **Quick Actions**: One-click access to common operations
- **Activity Logs**: Track user actions and system events

### Modern UI/UX
- **Angular 17**: Standalone components with Signals API
- **Material Design**: Consistent, beautiful UI with Angular Material 17
- **Responsive Layout**: Mobile-optimized interface
- **Dark Theme**: Toggle between light and dark themes
- **Breadcrumb Navigation**: Easy hierarchical navigation
- **Empty States**: Helpful guidance when no data exists
- **Loading Indicators**: Skeleton screens and spinners
- **Global Error Handling**: User-friendly error messages

### Architecture
- **Plugin System**: Drop-in plugin support for easy extensibility
- **Modular Design**: Well-structured modules for feature additions
- **Async Operations**: Non-blocking I/O with asyncio and async SQLAlchemy
- **Database Agnostic**: PostgreSQL, MySQL, or SQLite via SQLAlchemy
- **Docker Ready**: Separate containers with hot reload in dev mode

## 🏗️ Architecture

### Backend (Python/FastAPI)
- **FastAPI**: Modern, fast web framework for building APIs
- **SQLAlchemy**: ORM with async support for database operations
- **Casbin**: RBAC authorization library
- **Proxmoxer**: Python wrapper for Proxmox API
- **JWT**: Token-based authentication

### Frontend (Angular)
- **Angular 17**: Modern Angular with standalone components
- **TypeScript**: Type-safe development
- **Responsive Design**: Mobile-friendly interface
- **Lazy Loading**: Optimized routing with feature modules

### Database
- **PostgreSQL**: Production-recommended database
- **MySQL**: Alternative database option
- **SQLite**: Development/testing option

## 📋 Prerequisites

- **Docker & Docker Compose** 20.10+ (recommended for quick start)
- **Proxmox VE** 7.0+ cluster with API access
- *For manual setup*: Python 3.11+, Node.js 18+, npm 9+

## 🚀 Quick Start

### Using Docker Compose (Recommended)

1. **Clone the repository**
```bash
git clone https://github.com/kumpeapps/kvcloud.git
cd kvcloud
```

2. **Configure environment**
```bash
# Copy example environment file
cp backend/.env.example backend/.env

# Edit backend/.env and set:
# - SECRET_KEY and JWT_SECRET_KEY (generate with: openssl rand -hex 32)
# - DATABASE_URL (default SQLite works for testing)
# - CORS_ORIGINS (add your frontend URL)
```

3. **Start the services**
```bash
# Development mode (hot reload, SQLite)
docker-compose -f docker-compose.dev.yml up -d

# Production mode (PostgreSQL)
docker-compose up -d
```

4. **Access the application**
- **Frontend**: http://localhost:4200 (dev) or http://localhost (prod)
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

5. **Login with default credentials**
- **Username**: `admin`
- **Password**: `admin123` (dev) / `changeme` (prod)
- ⚠️ **Change immediately after first login!**

### Initial Configuration

After logging in:

1. **Add Proxmox Cluster**
   - Navigate to **Clusters** → **Add Cluster**
   - Enter cluster name, Proxmox host, username, and password
   - Test connection before saving

2. **Add Cluster Nodes**
   - Select your cluster → **Add Node**
   - Enter node name and hostname/IP
   - Nodes will appear in VM creation wizard

3. **Create Users** (Admin only)
   - Navigate to **Users** → **Create User**
   - Assign roles: `admin`, `user`, or `viewer`
   - Set username, password, email, and full name

4. **Create Your First VM**
   - Navigate to **Virtual Machines** → **Create VM**
   - Follow the wizard: select node, configure resources, choose OS
   - VM will be created and ready to start

### Manual Setup

#### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm start

# Build for production
npm run build
```

## 🔧 Configuration

### Environment Variables

Backend configuration in `backend/.env`:

```bash
# Application
APP_NAME=KVCloud
DEBUG=False  # Set to True for development
SECRET_KEY=your-secret-key-here  # Generate with: openssl rand -hex 32

# Database (choose one)
DATABASE_URL=sqlite+aiosqlite:///./kvcloud.db  # Development
# DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/kvcloud  # Production
# DATABASE_URL=mysql+aiomysql://user:pass@localhost:3306/kvcloud

# JWT Authentication
JWT_SECRET_KEY=your-jwt-secret-here  # Generate with: openssl rand -hex 32
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30  # Token expiry time

# CORS (add your frontend URLs)
CORS_ORIGINS=http://localhost:4200,http://localhost,https://yourdomain.com
```

### Frontend Configuration

Edit `frontend/src/environments/environment.ts` (dev) or `environment.prod.ts` (prod):

```typescript
export const environment = {
  production: false,  // true for production
  apiUrl: 'http://localhost:8000'  // Backend API URL
};
```

### Database Migrations

Migrations are automatic via Alembic on container startup. For manual migrations:

```bash
# Inside backend container or with local Python env
alembic upgrade head  # Apply all migrations
alembic revision --autogenerate -m "Description"  # Create new migration
```

## 📚 API Documentation

Interactive API documentation is available at:
- **Swagger UI**: http://localhost:8000/docs (recommended)
- **ReDoc**: http://localhost:8000/redoc

### Authentication

All API requests (except `/auth/token` and `/auth/register`) require JWT authentication:

```bash
# Login to get token
curl -X POST http://localhost:8000/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123"

# Use token in subsequent requests
curl -X GET http://localhost:8000/auth/me \
  -H "Authorization: Bearer <your-token>"
```

### Key Endpoints

#### Authentication
- `POST /auth/token` - Login (returns JWT token)
- `POST /auth/register` - Register new user
- `GET /auth/me` - Get current user info

#### Clusters & Nodes
- `GET /clusters/` - List all clusters
- `POST /clusters/` - Create cluster
- `GET /clusters/{id}/nodes` - List cluster nodes
- `POST /clusters/nodes` - Add node to cluster

#### Virtual Machines
- `GET /vms/node/{node_id}` - List VMs on node
- `POST /vms/node/{node_id}` - Create VM
- `GET /vms/node/{node_id}/vm/{vmid}/status` - Get VM status
- `POST /vms/node/{node_id}/vm/{vmid}/start` - Start VM
- `POST /vms/node/{node_id}/vm/{vmid}/stop` - Stop VM
- `POST /vms/node/{node_id}/vm/{vmid}/restart` - Restart VM
- `DELETE /vms/node/{node_id}/vm/{vmid}` - Delete VM

#### Snapshots
- `GET /vms/node/{node_id}/vm/{vmid}/snapshots` - List snapshots
- `POST /vms/node/{node_id}/vm/{vmid}/snapshots` - Create snapshot
- `DELETE /vms/node/{node_id}/vm/{vmid}/snapshots/{name}` - Delete snapshot
- `POST /vms/node/{node_id}/vm/{vmid}/snapshots/{name}/rollback` - Rollback to snapshot

#### VM Configuration
- `GET /vms/node/{node_id}/vm/{vmid}/config` - Get VM config
- `PUT /vms/node/{node_id}/vm/{vmid}/config` - Update VM config
- `POST /vms/node/{node_id}/vm/{vmid}/clone` - Clone VM
- `POST /vms/node/{node_id}/vm/{vmid}/template` - Convert to template

## 🧩 Extensibility

### Plugin System

Create custom plugins by extending `BasePlugin`:

```python
from app.plugins.base import BasePlugin
from fastapi import APIRouter

class Plugin(BasePlugin):
    def __init__(self):
        super().__init__()
        self.name = "MyPlugin"
        self.version = "1.0.0"
        self.description = "Custom plugin description"
    
    async def initialize(self) -> bool:
        # Initialization logic
        return True
    
    async def shutdown(self):
        # Cleanup logic
        pass
    
    def get_routes(self):
        router = APIRouter(prefix="/my-plugin", tags=["my-plugin"])
        
        @router.get("/")
        async def my_endpoint():
            return {"message": "Hello from plugin"}
        
        return [router]
```

Place plugins in `backend/app/plugins/{plugin_name}/` and they will be auto-loaded.

### Module System

Create custom modules by extending `BaseModule`:

```python
from app.modules.base import BaseModule
from fastapi import APIRouter

class MyModule(BaseModule):
    def __init__(self):
        super().__init__(name="my-module", prefix="/my-module")
    
    async def initialize(self) -> bool:
        return True
    
    async def shutdown(self):
        pass
    
    def register_routes(self):
        @self.router.get("/")
        async def index():
            return {"message": "Hello from module"}
```

Register modules in `app/main.py` using `module_manager.register_module()`.

## 🔐 RBAC (Role-Based Access Control)

KVCloud uses Casbin for fine-grained RBAC with 19 predefined permissions:

### Default Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **admin** | Full system access | All permissions |
| **user** | Standard user | VM operations, read-only access to users/clusters |
| **viewer** | Read-only | View-only access to all resources |

### Permission Matrix

| Resource | Actions | Description |
|----------|---------|-------------|
| **vm** | create, read, update, delete, start, stop, restart | VM lifecycle management |
| **user** | create, read, update, delete | User management |
| **role** | create, read, update, delete | Role management |
| **cluster** | create, read, update, delete | Cluster configuration |

### Custom RBAC Configuration

Edit `backend/app/core/rbac_policy.csv`:

```csv
# Format: p, role, resource, action
p, admin, *, *
p, operator, vm, create
p, operator, vm, start
p, operator, vm, stop
p, viewer, vm, read
p, viewer, cluster, read

# Role inheritance
g, alice, admin
g, bob, operator
g, charlie, viewer
```

After modifying, restart the backend container to reload policies.

## 🧪 Testing

### Backend Tests

```bash
# Using Docker
docker exec kvcloud-backend-dev pytest

# Or locally
cd backend
pytest

# With coverage
pytest --cov=app --cov-report=html
```

### Frontend Tests

```bash
cd frontend

# Unit tests
npm test

# E2E tests
npm run e2e

# Test with coverage
npm test -- --code-coverage
```

## 🚢 Production Deployment

### Using Docker Compose

1. **Prepare environment**
```bash
cp backend/.env.example backend/.env
# Edit .env:
# - Set DEBUG=False
# - Use PostgreSQL DATABASE_URL
# - Generate secure SECRET_KEY and JWT_SECRET_KEY
# - Set production CORS_ORIGINS
```

2. **Build and deploy**
```bash
docker-compose up -d --build
```

3. **Set up reverse proxy** (nginx example)
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:4200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

4. **Enable SSL** with Let's Encrypt
```bash
certbot --nginx -d yourdomain.com
```

### Kubernetes Deployment

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed Kubernetes manifests and Helm charts.

### Environment Hardening

- [ ] Change default admin password
- [ ] Use strong SECRET_KEY and JWT_SECRET_KEY
- [ ] Enable PostgreSQL for production
- [ ] Configure backup strategy
- [ ] Set up monitoring (Prometheus, Grafana)
- [ ] Enable SSL/TLS everywhere
- [ ] Configure firewall rules
- [ ] Set up log aggregation (ELK stack)
- [ ] Enable rate limiting
- [ ] Configure CORS properly

## 🐛 Troubleshooting

### Common Issues

#### Database Connection Failed
**Problem**: Can't connect to database

**Solutions**:
- Verify `DATABASE_URL` format in `.env`
- Check database service is running: `docker-compose ps`
- Ensure network connectivity between containers
- For PostgreSQL: verify user credentials and database exists

#### Proxmox Connection Issues
**Problem**: Can't connect to Proxmox cluster

**Solutions**:
- Verify Proxmox credentials in cluster configuration
- Check network access: `ping proxmox-host`
- Verify Proxmox API is enabled (usually port 8006)
- Check SSL settings: set `verify_ssl=false` for self-signed certs
- Ensure user has proper permissions in Proxmox

#### Frontend Can't Reach Backend
**Problem**: API calls fail with CORS errors

**Solutions**:
- Add frontend URL to `CORS_ORIGINS` in backend `.env`
- Restart backend container after changing `.env`
- Check `apiUrl` in `frontend/src/environments/environment.ts`
- Verify backend is running: `curl http://localhost:8000/docs`

#### JWT Token Expired
**Problem**: User gets logged out frequently

**Solutions**:
- Increase `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` in `.env`
- Implement refresh token mechanism (future enhancement)
- Check system clock synchronization

#### VM Creation Fails
**Problem**: Cannot create VMs

**Solutions**:
- Verify node has available resources
- Check storage exists and has space
- Ensure ISO/template exists in specified storage
- Review backend logs: `docker logs kvcloud-backend`
- Verify user has `vm:create` permission

### Viewing Logs

```bash
# Backend logs
docker logs -f kvcloud-backend

# Frontend logs
docker logs -f kvcloud-frontend

# Database logs (production)
docker logs -f kvcloud-db

# All services
docker-compose logs -f
```

### Reset Admin Password

```bash
# Access backend container
docker exec -it kvcloud-backend bash

# Run Python shell
python

# Reset password
from app.core.database import get_db
from app.models.user import User
from app.core.security import get_password_hash
import asyncio

async def reset_admin():
    async for db in get_db():
        admin = await db.query(User).filter(User.username == "admin").first()
        admin.hashed_password = get_password_hash("newpassword")
        await db.commit()

asyncio.run(reset_admin())
```

## 🗺️ Roadmap

### Completed ✅
- [x] Modern Angular 17 UI with Material Design
- [x] FastAPI backend with async SQLAlchemy
- [x] JWT authentication & RBAC with Casbin
- [x] Proxmox cluster and node management
- [x] Complete VM lifecycle operations (create, start, stop, delete)
- [x] VM snapshot management (create, delete, rollback)
- [x] VM cloning and template conversion
- [x] VM configuration editing (CPU, memory)
- [x] Real-time monitoring with charts
- [x] User and role management UI
- [x] Dashboard with live statistics
- [x] Responsive design with dark theme
- [x] Breadcrumb navigation
- [x] Empty states and loading indicators
- [x] Global error handling

### In Progress 🚧
- [ ] VM console access (noVNC integration)
- [ ] VM backup and restore
- [ ] Advanced storage management
- [ ] Network configuration UI
- [ ] Two-factor authentication (2FA)
- [ ] Activity logs and audit trail

### Planned 📋
- [ ] Multi-language support (i18n)
- [ ] Email notifications
- [ ] Scheduled tasks (cron jobs)
- [ ] Resource quotas and limits
- [ ] Billing and usage tracking
- [ ] Plugin marketplace
- [ ] Mobile app (iOS/Android)
- [ ] High availability (HA) configuration
- [ ] Ansible integration for automation
- [ ] Terraform provider
- [ ] REST API client libraries (Python, JavaScript)

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**: Follow code style guidelines
4. **Add tests**: Ensure good test coverage
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow PEP 8 for Python code
- Use TypeScript strict mode for frontend
- Write unit tests for new features
- Update documentation for API changes
- Use conventional commits for commit messages
- Ensure all tests pass before submitting PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- **KumpeApps Team** - *Initial work*

## 🙏 Acknowledgments

- [Proxmox VE](https://www.proxmox.com/) - Excellent virtualization platform
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [Angular](https://angular.io/) - Powerful frontend framework
- [Casbin](https://casbin.org/) - Authorization library
- [Proxmoxer](https://github.com/proxmoxer/proxmoxer) - Python Proxmox API wrapper
- [Material Design](https://material.angular.io/) - Beautiful UI components

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/kumpeapps/kvcloud/issues)
- **Discussions**: [GitHub Discussions](https://github.com/kumpeapps/kvcloud/discussions)
- **Email**: support@kumpeapps.com
- **Documentation**: [Wiki](https://github.com/kumpeapps/kvcloud/wiki)

---

Made with ❤️ by KumpeApps Team