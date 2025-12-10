# KVCloud Architecture

## Overview

KVCloud is built with a microservices architecture using Docker containers for both backend and frontend services. The application follows modern development practices with clear separation of concerns and extensibility in mind.

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                         KVCloud                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │    Frontend      │◄───────►│     Backend      │         │
│  │    (Angular)     │   API   │   (FastAPI)      │         │
│  │   Port: 80/4200  │         │   Port: 8000     │         │
│  └──────────────────┘         └─────────┬────────┘         │
│                                          │                   │
│                                          ▼                   │
│                               ┌──────────────────┐          │
│                               │    Database      │          │
│                               │  (PostgreSQL)    │          │
│                               └──────────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │   Proxmox Clusters       │
                    │   (External)             │
                    └──────────────────────────┘
```

## Backend Architecture

### Core Components

#### 1. FastAPI Application (`app/main.py`)
- Application entry point
- Middleware configuration
- Router registration
- Lifecycle management

#### 2. Core Layer (`app/core/`)
- **config.py**: Application settings and configuration
- **database.py**: Database connection and session management
- **security.py**: Authentication and password hashing
- **rbac.py**: Role-Based Access Control using Casbin

#### 3. Models Layer (`app/models/`)
- SQLAlchemy ORM models
- Database schema definitions
- Relationships between entities

#### 4. API Layer (`app/api/`)
- REST API endpoints
- Request/response models (Pydantic)
- Input validation
- Error handling

#### 5. Services Layer (`app/services/`)
- Business logic implementation
- External API integration (Proxmox)
- Data processing

#### 6. Plugin System (`app/plugins/`)
- **base.py**: BasePlugin abstract class and PluginManager
- Drop-in plugin support
- Dynamic plugin loading
- Plugin lifecycle management

#### 7. Module System (`app/modules/`)
- **base.py**: BaseModule abstract class and ModuleManager
- Modular feature organization
- Route registration
- Module lifecycle management

### Request Flow

```
Client Request
    ↓
Middleware (CORS, Auth)
    ↓
Router (FastAPI)
    ↓
API Endpoint
    ↓
Service Layer
    ↓
Database / External API
    ↓
Response
```

### Authentication Flow

```
1. User submits credentials (username/password)
2. Backend validates credentials against database
3. Backend generates JWT token
4. Token returned to client
5. Client includes token in Authorization header
6. Backend validates token for each request
7. User info extracted from token
```

### RBAC Implementation

KVCloud uses Casbin for RBAC with the following model:

```
Request: (subject, object, action)
Policy: (subject, object, action)
Role: (user, role)

Matcher: g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
```

**Default Roles:**
- `admin`: Full access (*, *, *)
- `operator`: VM management (vm, create|start|stop|restart)
- `viewer`: Read-only access (vm|cluster, read)

### Database Schema

#### Users Table
```sql
- id: Primary Key
- username: Unique username
- email: Unique email
- hashed_password: Bcrypt hashed password
- full_name: User's full name
- is_active: Account status
- is_superuser: Admin flag
- created_at: Timestamp
- updated_at: Timestamp
```

#### Proxmox Clusters Table
```sql
- id: Primary Key
- name: Cluster name (unique)
- description: Cluster description
- is_active: Status flag
- created_at: Timestamp
- updated_at: Timestamp
```

#### Proxmox Nodes Table
```sql
- id: Primary Key
- cluster_id: Foreign Key to clusters
- name: Node name
- host: Node hostname/IP
- port: API port (default 8006)
- username: Proxmox username
- password: Encrypted password
- verify_ssl: SSL verification flag
- is_active: Status flag
- created_at: Timestamp
- updated_at: Timestamp
```

## Frontend Architecture

### Component Structure

```
src/
├── app/
│   ├── core/
│   │   ├── services/       # Singleton services
│   │   ├── interceptors/   # HTTP interceptors
│   │   └── guards/         # Route guards
│   ├── shared/             # Shared components
│   ├── features/           # Feature modules
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── clusters/
│   │   └── vms/
│   ├── app.component.ts
│   ├── app.config.ts
│   └── app.routes.ts
├── environments/           # Environment configs
└── assets/                 # Static assets
```

### Routing Strategy

- Lazy loading for feature modules
- Auth guard for protected routes
- Standalone components (Angular 17+)

### State Management

- Signal-based reactive state (Angular 17+)
- Service-based state for simple scenarios
- Future: NgRx for complex state management

## Plugin Development

### Creating a Plugin

```python
from app.plugins.base import BasePlugin
from fastapi import APIRouter

class Plugin(BasePlugin):
    def __init__(self):
        super().__init__()
        self.name = "MyPlugin"
        self.version = "1.0.0"
        self.description = "Plugin description"
    
    async def initialize(self) -> bool:
        # Setup code
        return True
    
    async def shutdown(self):
        # Cleanup code
        pass
    
    def get_routes(self):
        router = APIRouter(prefix="/my-plugin")
        
        @router.get("/")
        async def endpoint():
            return {"status": "ok"}
        
        return [router]
```

### Plugin Structure

```
plugins/
└── my_plugin/
    ├── __init__.py
    ├── plugin.py      # Plugin class
    ├── models.py      # Optional: Database models
    ├── services.py    # Optional: Business logic
    └── api.py         # Optional: API routes
```

## Module Development

### Creating a Module

```python
from app.modules.base import BaseModule

class StorageModule(BaseModule):
    def __init__(self):
        super().__init__(name="storage", prefix="/storage")
    
    async def initialize(self) -> bool:
        # Initialize module
        return True
    
    async def shutdown(self):
        # Cleanup
        pass
    
    def register_routes(self):
        @self.router.get("/")
        async def list_storage():
            return {"storage": []}
```

## Security Considerations

1. **Authentication**: JWT-based with configurable expiration
2. **Password Storage**: Bcrypt hashing with salt
3. **RBAC**: Casbin-based authorization
4. **SQL Injection**: SQLAlchemy ORM prevents SQL injection
5. **XSS**: Angular sanitizes templates by default
6. **CORS**: Configurable allowed origins
7. **Secrets**: Store in environment variables, never in code

## Scalability

### Horizontal Scaling

- Backend: Stateless design allows multiple instances
- Database: Use read replicas for read-heavy workloads
- Frontend: Serve from CDN

### Performance Optimization

- Database connection pooling
- Async/await for I/O operations
- Caching strategies (Redis future enhancement)
- Lazy loading in frontend

## Monitoring and Logging

- Structured logging with Python logging module
- HTTP access logs from Uvicorn
- Database query logging (configurable)
- Frontend error tracking (future enhancement)

## Future Enhancements

1. **Message Queue**: Add Celery/RabbitMQ for async tasks
2. **Caching Layer**: Redis for session management
3. **Service Mesh**: Istio for microservices communication
4. **Metrics**: Prometheus + Grafana
5. **Distributed Tracing**: OpenTelemetry
6. **API Gateway**: Kong or Traefik
7. **WebSocket Support**: Real-time VM status updates
