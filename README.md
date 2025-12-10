# KVCloud

**KVCloud** is a virtual cloud management panel similar to Virtualizor, designed to manage Virtual Machines (VMs) on Proxmox clusters. It provides a modern, feature-rich interface with full RBAC (Role-Based Access Control) support, extensible plugin architecture, and modular design.

## 🌟 Features

- **Proxmox Cluster Management**: Support for multiple Proxmox servers in cluster configurations
- **VM Management**: Create, start, stop, restart, and manage virtual machines
- **RBAC Compliant**: Full role-based access control using Casbin
- **Plugin Architecture**: Drop-in plugin support for easy extensibility
- **Modular Design**: Well-structured modules for easy feature additions
- **Database Agnostic**: Support for PostgreSQL, MySQL, and SQLite via SQLAlchemy
- **Modern Stack**: Python/FastAPI backend + Angular frontend
- **Docker Ready**: Separate containers for backend and frontend

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

- Docker & Docker Compose
- (For development) Python 3.11+, Node.js 18+

## 🚀 Quick Start

### Using Docker Compose (Recommended)

1. **Clone the repository**
```bash
git clone https://github.com/kumpeapps/kvcloud.git
cd kvcloud
```

2. **Start the services**
```bash
# Production mode (with PostgreSQL)
docker-compose up -d

# Development mode (with SQLite and hot reload)
docker-compose -f docker-compose.dev.yml up -d
```

3. **Access the application**
- Frontend: http://localhost (production) or http://localhost:4200 (dev)
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

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

Backend configuration is managed through environment variables. Copy `.env.example` to `.env` and update:

```bash
# Application
APP_NAME=KVCloud
DEBUG=False
SECRET_KEY=your-secret-key

# Database (choose one)
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/kvcloud
# DATABASE_URL=mysql+aiomysql://user:pass@localhost:3306/kvcloud
# DATABASE_URL=sqlite+aiosqlite:///./kvcloud.db

# JWT
JWT_SECRET_KEY=your-jwt-secret
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
CORS_ORIGINS=http://localhost:4200,http://localhost
```

### Proxmox Configuration

Add Proxmox clusters and nodes through the API or web interface after initial setup.

## 📚 API Documentation

Interactive API documentation is available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Key Endpoints

- **Authentication**: `/auth/token`, `/auth/register`, `/auth/me`
- **Clusters**: `/clusters/`, `/clusters/{id}`, `/clusters/{id}/nodes`
- **Nodes**: `/clusters/nodes`, `/clusters/nodes/{id}/status`
- **VMs**: `/vms/node/{node_id}`, `/vms/node/{node_id}/vm/{vmid}/start`

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

KVCloud uses Casbin for RBAC with predefined roles:

- **admin**: Full access to all resources
- **operator**: Can manage VMs (create, start, stop, restart)
- **viewer**: Read-only access to VMs and clusters

### RBAC Configuration

Edit `backend/app/core/rbac_policy.csv` to customize permissions:

```csv
p, admin, *, *
p, operator, vm, create
p, operator, vm, start
p, operator, vm, stop
p, viewer, vm, read
```

## 🧪 Testing

### Backend Tests

```bash
cd backend
pytest
```

### Frontend Tests

```bash
cd frontend
npm test
```

## 🐛 Troubleshooting

### Database Connection Issues

- Verify DATABASE_URL is correctly formatted
- Check database server is running
- Ensure network connectivity between containers

### Proxmox Connection Issues

- Verify Proxmox credentials
- Check SSL certificate settings (verify_ssl)
- Ensure network access to Proxmox server

## 🗺️ Roadmap

- [x] Basic architecture and project structure
- [x] Authentication and authorization (RBAC)
- [x] Proxmox cluster management
- [x] Basic VM operations (start, stop, restart)
- [ ] VM creation and configuration
- [ ] Storage management
- [ ] Network management
- [ ] Backup and restore
- [ ] Monitoring and alerts
- [ ] User management UI
- [ ] Advanced RBAC configuration UI
- [ ] Plugin marketplace

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## 📄 License

This project is licensed under the terms specified in the LICENSE file.

## 👥 Authors

- KumpeApps Team

## 🙏 Acknowledgments

- Proxmox VE team for their excellent virtualization platform
- FastAPI and Angular communities for fantastic frameworks
- Casbin team for RBAC implementation