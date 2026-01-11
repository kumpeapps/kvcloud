# KVCloud Administrator Guide

Complete guide for KVCloud system administrators.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Installation & Setup](#installation--setup)
3. [User Management](#user-management)
4. [RBAC Configuration](#rbac-configuration)
5. [Cluster Management](#cluster-management)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Security](#security)
8. [Backup & Recovery](#backup--recovery)
9. [Troubleshooting](#troubleshooting)
10. [Performance Tuning](#performance-tuning)

---

## System Overview

### Architecture

KVCloud consists of three main components:

1. **Backend (FastAPI)**: REST API server handling all business logic
2. **Frontend (Angular 17)**: Web-based user interface
3. **Database (PostgreSQL/SQLite)**: Persistent storage for users, clusters, and configuration

**External Dependencies**:
- Proxmox VE cluster(s): The virtualization platform
- Database server: PostgreSQL (production) or SQLite (development)

### System Requirements

**Minimum**:
- 2 CPU cores
- 4 GB RAM
- 20 GB disk space
- Linux OS (Ubuntu 22.04 LTS recommended)
- Docker 20.10+

**Recommended (Production)**:
- 4 CPU cores
- 8 GB RAM
- 50 GB SSD
- PostgreSQL 14+
- Reverse proxy (Nginx/Apache)
- SSL certificate

---

## Installation & Setup

### Quick Start (Docker Compose)

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed production setup.

**Development Setup**:

```bash
git clone https://github.com/kumpeapps/kvcloud.git
cd kvcloud
docker-compose -f docker-compose.dev.yml up -d
```

Access:
- Frontend: http://localhost:4200
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Initial Configuration

1. **Change Admin Password**:
```bash
# Login at http://localhost:4200
# Username: admin, Password: admin123
# Navigate to Profile → Change Password
```

2. **Configure Environment Variables**:
```bash
# Edit backend/.env
nano backend/.env
```

Key settings:
```bash
SECRET_KEY=<generate-with-openssl-rand-hex-32>
JWT_SECRET_KEY=<generate-with-openssl-rand-hex-32>
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/kvcloud
CORS_ORIGINS=https://yourdomain.com
DEBUG=False
```

3. **Set Up Database**:

For PostgreSQL:
```bash
# Create database
psql -U postgres
CREATE DATABASE kvcloud;
CREATE USER kvcloud WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE kvcloud TO kvcloud;
\q

# Migrations run automatically on startup
# Or manually:
docker exec kvcloud-backend alembic upgrade head
```

4. **Configure Reverse Proxy**:

See [DEPLOYMENT.md](DEPLOYMENT.md#step-7-configure-reverse-proxy-nginx) for Nginx configuration.

5. **Enable SSL**:
```bash
sudo certbot --nginx -d yourdomain.com
```

---

## User Management

### Creating Users

**Via Web Interface**:
1. Navigate to **Users** → **Create User**
2. Fill in details:
   - Username (unique, alphanumeric)
   - Email (valid email address)
   - Full Name
   - Password (min 8 characters)
   - Role (admin/user/viewer)
3. Click **Create**

**Via API**:
```bash
curl -X POST http://localhost:8000/users/ \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "user@example.com",
    "password": "securepass123",
    "full_name": "New User",
    "is_active": true,
    "is_superuser": false
  }'
```

### User Roles

| Role | Description | Typical Use Case |
|------|-------------|------------------|
| **admin** | Full system access | System administrators |
| **user** | Standard VM operations | Developers, operators |
| **viewer** | Read-only access | Auditors, managers |

### Deactivating Users

Instead of deleting, deactivate users to preserve audit trails:

1. Navigate to **Users**
2. Find user
3. Click **Deactivate**
4. User cannot login but data remains

### Password Reset

**As Administrator**:

```bash
# Access backend container
docker exec -it kvcloud-backend bash

# Run Python script
python << EOF
import asyncio
from app.core.database import get_db
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select

async def reset_password():
    async for db in get_db():
        result = await db.execute(
            select(User).where(User.username == "username")
        )
        user = result.scalar_one_or_none()
        if user:
            user.hashed_password = get_password_hash("newpassword123")
            await db.commit()
            print(f"Password reset for {user.username}")
        else:
            print("User not found")

asyncio.run(reset_password())
EOF
```

---

## RBAC Configuration

### Overview

KVCloud uses **Casbin** for Role-Based Access Control (RBAC). This system provides fine-grained permission management across all resources.

### Permission System

Permissions follow the **Resource:Action** format:

**Supported Resources**:
- `vm` - Virtual machines
- `cluster` - Proxmox clusters
- `node` - Cluster nodes
- `user` - User management
- `role` - Role management
- `iso` - ISO images
- `snapshot` - VM snapshots
- `ippool` - IP address pools
- `backup` - Backup operations
- `firewall` - Firewall rules
- `disk` - Storage disks
- `network` - Network interfaces
- `template` - VM templates
- `metrics` - Performance metrics
- `cloud-init` - Cloud-init profiles
- `ssh-key` - SSH key management
- `task` - Background tasks
- `agent` - QEMU guest agent
- `*` - All resources (admin only)

**Supported Actions**:
- `read` - View resource
- `create` - Create new resource
- `update` - Modify resource
- `delete` - Remove resource
- `start`, `stop`, `restart` - VM lifecycle
- `pause`, `resume`, `shutdown`, `reset` - Additional VM operations
- `console` - Access VM console
- `lock`, `unlock` - Lock/unlock VMs
- `clone` - Clone VM
- `allocate`, `deallocate` - IP pool operations
- `rollback` - Snapshot rollback
- `restore` - Backup restore
- `execute` - Execute agent commands
- `*` - All actions (wildcard)

### Default Roles

#### Admin Role
- **Permissions**: `admin, *, *` (all resources, all actions)
- **Description**: Full system access
- **Users**: System administrators only

#### User Role
- **Key Permissions**:
  - `user, vm, *` - All VM operations
  - `user, snapshot, *` - All snapshot operations
  - `user, backup, *` - All backup operations
  - `user, cluster, read` - View clusters
  - `user, node, read` - View nodes
  - `user, ippool, *` - All IP pool operations
  - `user, firewall, *` - All firewall operations
  - `user, disk, *` - All disk operations
  - `user, network, *` - All network operations
  - `user, iso, read` - View ISOs
  - `user, template, *` - All template operations
  - `user, metrics, read` - View metrics
  - `user, cloud-init, *` - All cloud-init operations
  - `user, ssh-key, *` - All SSH key operations
  - `user, task, read` - View background tasks
  - `user, agent, *` - All agent operations
- **Description**: Standard user with operational access

#### Viewer Role
- **Key Permissions**:
  - `viewer, vm, read` - View VMs only
  - `viewer, vm, console` - Access VM console
  - `viewer, snapshot, read` - View snapshots
  - `viewer, cluster, read` - View clusters
  - `viewer, node, read` - View nodes
  - `viewer, backup, read` - View backups
  - `viewer, firewall, read` - View firewall rules
  - `viewer, metrics, read` - View metrics
  - Other read-only permissions
- **Description**: Read-only access, can view console

### API Permission Enforcement

The backend enforces permissions at the API endpoint level using the `@require_permission` decorator:

```python
from app.core.dependencies import require_permission

@router.get("/vms/{vm_id}")
@require_permission("vm", "read")
async def get_vm(vm_id: int, current_user: User = Depends(get_current_user)):
    # This endpoint requires vm:read permission
    ...
```

**Permission Check Flow**:
1. User authenticates with JWT token
2. Endpoint checks if user is superuser (bypasses all checks)
3. Endpoint retrieves user's role
4. Casbin enforces permission: `enforce(user_role, resource, action)`
5. Returns 403 Forbidden if permission denied, 200 OK if allowed

### Frontend Permission Checks

The frontend uses permission directives and guards to show/hide UI elements:

**Permission Directive** (Hide/Show Elements):
```html
<!-- Show button only if user has vm:create permission -->
<button *hasPermission="{ resource: 'vm', action: 'create' }">
  Create VM
</button>

<!-- Show read-only content for viewers -->
<div *hasPermission="{ resource: 'vm', action: 'update' }; else viewerContent">
  <button (click)="updateVM()">Update VM</button>
</div>
<ng-template #viewerContent>
  <p>VM details (read-only)</p>
</ng-template>
```

**Permission Guard** (Protect Routes):
```typescript
// In app.routes.ts
const routes: Routes = [
  {
    path: 'vms/create',
    component: CreateVMComponent,
    canActivate: [permissionGuard],
    data: { permission: { resource: 'vm', action: 'create' } }
  }
];
```

**Permission Service** (Programmatic Checks):
```typescript
import { PermissionService } from './core/services/permission.service';

export class MyComponent {
  constructor(private permissionService: PermissionService) {}

  canCreateVM(): boolean {
    return this.permissionService.hasPermission('vm', 'create');
  }

  canAccessRoute(resource: string): boolean {
    return this.permissionService.canAccessRoute(resource);
  }
}
```

### Creating Custom Roles

#### Via Web Interface

1. Navigate to **Roles** → **Create Role**
2. Enter role name (e.g., "operator")
3. Select permissions you want to grant:
   - Check individual permissions (e.g., vm:start, vm:stop)
   - Or use wildcards (e.g., vm:* for all VM permissions)
4. Click **Create**

#### Via Policy File

Edit `backend/app/core/rbac_policy.csv`:

```csv
# Example: Create "operator" role with limited permissions
p, operator, vm, read
p, operator, vm, start
p, operator, vm, stop
p, operator, vm, restart
p, operator, cluster, read
p, operator, node, read

# Assign user to role
g, operator_user1, operator
g, operator_user2, operator
```

After editing, restart the backend:
```bash
docker-compose restart backend
```

### Customizing Permissions

#### Example 1: Allow Users to Create VMs

```csv
p, user, vm, create
```

#### Example 2: Create "Support" Role (View-Only Console Access)

```csv
p, support, vm, read
p, support, vm, console
p, support, cluster, read
p, support, node, read
```

#### Example 3: Create "Manager" Role (Full VM + User Management)

```csv
p, manager, vm, *
p, manager, snapshot, *
p, manager, backup, *
p, manager, user, read
p, manager, cluster, read
p, manager, node, read
```

Assign user to manager role:
```csv
g, alice, manager
```

### Checking User Permissions

**Via API**:
```bash
# Get current user's permissions
curl -X GET https://localhost:8000/auth/permissions \
  -H "Authorization: Bearer <token>"

# Response:
{
  "role": "user",
  "is_superuser": false,
  "permissions": [
    {"resource": "vm", "action": "read"},
    {"resource": "vm", "action": "create"},
    {"resource": "vm", "action": "delete"},
    ...
  ]
}
```

**Via Web Interface**:
1. Click on your username (top-right)
2. Navigate to **Profile**
3. You'll see your role and assigned permissions

### Permission Denial Handling

When a user lacks required permissions:

**API Response**:
```json
{
  "detail": "Permission denied: vm:delete"
}
HTTP 403 Forbidden
```

**Frontend Behavior**:
- Button/Menu item is hidden (with `*hasPermission`)
- Route is redirected to dashboard (with `permissionGuard`)
- Error message shown if action attempted

### Troubleshooting RBAC Issues

**Problem**: User cannot see button despite having permission
- **Solution**: Check that `HasPermissionDirective` is imported in component
- **Solution**: Verify permission format is correct (resource:action)
- **Solution**: Clear browser cache and reload

**Problem**: API returns 403 Forbidden unexpectedly
- **Solution**: Check Casbin policies in `rbac_policy.csv`
- **Solution**: Verify user's role is correctly assigned
- **Solution**: Check backend logs: `docker-compose logs backend | grep Permission`

**Problem**: New role doesn't work after editing policy file
- **Solution**: Restart backend: `docker-compose restart backend`
- **Solution**: Check for syntax errors in CSV file
- **Solution**: Verify `casbin_rule` database table has been updated

### Permission Matrix

| Resource | Admin | User | Viewer |
|----------|-------|------|--------|
| vm | * | create, read, start, stop, restart, delete, update, console, pause, resume, shutdown, reset, clone, lock, unlock | read, console |
| snapshot | * | create, read, delete, rollback | read |
| backup | * | create, read, restore, delete | read |
| cluster | * | read | read |
| node | * | read | read |
| user | * | read (own) | read (own) |
| role | * | read | - |
| iso | * | read | read |
| firewall | * | create, read, update, delete | read |
| ippool | * | read, allocate, deallocate | read |
| disk | * | create, read, resize, delete | read |
| network | * | create, read, update, delete | read |
| template | * | create, read | read |
| metrics | * | read | read |
| cloud-init | * | create, read, update, delete | read |
| ssh-key | * | create, read, delete | read |
| task | * | read | read |
| agent | * | read, execute | read |

---

## Cluster Management

### Adding Proxmox Clusters

1. Navigate to **Clusters** → **Add Cluster**
2. Enter details:
   - **Name**: Friendly name (e.g., "Production Cluster")
   - **Host**: Proxmox server hostname or IP
   - **Port**: Usually 8006
   - **Username**: Proxmox user (e.g., `root@pam`)
   - **Password**: Proxmox password
   - **Verify SSL**: Disable for self-signed certs
3. Click **Test Connection**
4. If successful, click **Save**

### Adding Nodes to Cluster

1. Select cluster
2. Click **Add Node**
3. Enter:
   - **Name**: Node name (as shown in Proxmox)
   - **Host**: Node hostname or IP
4. Click **Save**

### Cluster Health Monitoring

**Check Cluster Status**:
- Dashboard shows cluster health
- Green: All nodes online
- Yellow: Some nodes offline
- Red: Cluster unavailable

**API Endpoint**:
```bash
curl -X GET http://localhost:8000/clusters/1/status \
  -H "Authorization: Bearer <token>"
```

### Removing Clusters

⚠️ **Warning**: Removes cluster configuration only, not the actual Proxmox cluster.

1. Navigate to **Clusters**
2. Select cluster
3. Click **Delete**
4. Confirm action

---

## Monitoring & Maintenance

### System Monitoring

**Check Service Status**:
```bash
docker-compose ps
```

**View Logs**:
```bash
# All services
docker-compose logs -f

# Specific service
docker logs -f kvcloud-backend
docker logs -f kvcloud-frontend
```

**Resource Usage**:
```bash
docker stats
```

### Database Maintenance

**Backup Database** (PostgreSQL):
```bash
docker exec kvcloud-postgres pg_dump -U kvcloud kvcloud > backup_$(date +%Y%m%d).sql
```

**Restore Database**:
```bash
docker exec -i kvcloud-postgres psql -U kvcloud kvcloud < backup_20251216.sql
```

**Vacuum Database** (Optimize):
```bash
docker exec kvcloud-postgres psql -U kvcloud -d kvcloud -c "VACUUM FULL;"
```

### Log Rotation

Create `/etc/logrotate.d/kvcloud`:

```
/opt/kvcloud/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        docker-compose restart backend frontend
    endscript
}
```

### Health Checks

**Backend Health**:
```bash
curl http://localhost:8000/health
# Expected: {"status": "healthy"}
```

**Database Health**:
```bash
docker exec kvcloud-postgres pg_isready -U kvcloud
```

### Update Procedure

1. **Backup Everything**:
```bash
# Backup database
docker exec kvcloud-postgres pg_dump -U kvcloud kvcloud > backup.sql

# Backup configs
tar -czf config_backup.tar.gz backend/.env docker-compose.yml
```

2. **Pull Latest Code**:
```bash
cd /opt/kvcloud
git pull origin main
```

3. **Rebuild and Restart**:
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

4. **Run Migrations**:
```bash
docker exec kvcloud-backend alembic upgrade head
```

5. **Verify**:
```bash
docker-compose logs -f backend
# Check for errors
```

---

## Security

### Security Checklist

- [ ] Changed default admin password
- [ ] Using strong SECRET_KEY and JWT_SECRET_KEY
- [ ] SSL/TLS enabled with valid certificate
- [ ] Firewall configured (ports 80, 443 only)
- [ ] Database password is strong and unique
- [ ] CORS origins properly configured
- [ ] DEBUG=False in production
- [ ] Regular security updates applied
- [ ] Backup strategy in place
- [ ] Log monitoring enabled

### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### SSL/TLS Best Practices

**Nginx SSL Configuration**:
```nginx
# Strong ciphers only
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
ssl_prefer_server_ciphers on;

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
```

### Rate Limiting

**Nginx Rate Limiting**:
```nginx
# In http block
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# In location /api
limit_req zone=api burst=20 nodelay;
```

### Audit Logging

Enable audit logging for security events:

```python
# In backend/app/core/config.py
ENABLE_AUDIT_LOG = True
AUDIT_LOG_EVENTS = ["login", "logout", "user_create", "user_delete", "vm_delete"]
```

View audit logs:
```bash
docker logs kvcloud-backend | grep "AUDIT"
```

---

## Backup & Recovery

### Backup Strategy

**What to Backup**:
1. Database (critical)
2. Environment configuration (.env)
3. Docker Compose files
4. RBAC policy (rbac_policy.csv)
5. Custom plugins/modules

**Automated Daily Backup Script**:

```bash
#!/bin/bash
# /opt/kvcloud/backup.sh

BACKUP_DIR="/opt/backups/kvcloud"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Database backup
docker exec kvcloud-postgres pg_dump -U kvcloud kvcloud | gzip > \
  $BACKUP_DIR/db_$DATE.sql.gz

# Config backup
tar -czf $BACKUP_DIR/config_$DATE.tar.gz \
  backend/.env \
  docker-compose.yml \
  backend/app/core/rbac_policy.csv

# Keep only last 30 days
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

Add to crontab:
```bash
0 2 * * * /opt/kvcloud/backup.sh >> /var/log/kvcloud-backup.log 2>&1
```

### Disaster Recovery

**Complete System Restore**:

1. **Install Fresh KVCloud**:
```bash
git clone https://github.com/kumpeapps/kvcloud.git
cd kvcloud
```

2. **Restore Configuration**:
```bash
tar -xzf config_backup.tar.gz
```

3. **Start Services**:
```bash
docker-compose up -d
```

4. **Restore Database**:
```bash
gunzip < db_20251216.sql.gz | docker exec -i kvcloud-postgres psql -U kvcloud kvcloud
```

5. **Verify**:
```bash
curl http://localhost:8000/auth/me
```

---

## Troubleshooting

### Common Issues

#### Backend Won't Start

**Check logs**:
```bash
docker logs kvcloud-backend
```

**Common causes**:
- Database connection failed: Check DATABASE_URL
- Port already in use: Change port in docker-compose.yml
- Permission errors: Check file ownership

**Fix**:
```bash
# Fix permissions
sudo chown -R 1000:1000 backend/

# Restart
docker-compose restart backend
```

#### Database Connection Issues

**Test connection**:
```bash
docker exec kvcloud-postgres psql -U kvcloud -d kvcloud -c "SELECT 1;"
```

**Reset database**:
```bash
docker-compose down -v  # ⚠️ Destroys data
docker-compose up -d
```

#### Proxmox Connection Failed

**Test manually**:
```bash
curl -k https://proxmox-host:8006/api2/json/version
```

**Check**:
- Proxmox credentials correct
- Network connectivity
- Firewall allows port 8006
- SSL verification setting

#### High Memory Usage

**Check memory**:
```bash
docker stats
```

**Optimize**:
- Reduce chart refresh intervals
- Limit concurrent users
- Increase server RAM
- Enable database connection pooling

### Debug Mode

Enable debug logging:

```bash
# backend/.env
DEBUG=True
LOG_LEVEL=DEBUG
```

Restart:
```bash
docker-compose restart backend
```

View detailed logs:
```bash
docker logs -f kvcloud-backend
```

### Database Issues

**Orphaned connections**:
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'kvcloud' AND pid <> pg_backend_pid();
```

**Check table sizes**:
```sql
SELECT
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

---

## Performance Tuning

### Database Optimization

**PostgreSQL Config** (`postgresql.conf`):
```ini
shared_buffers = 256MB          # 25% of RAM
effective_cache_size = 1GB      # 50-75% of RAM
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1          # For SSDs
work_mem = 16MB
```

### Application Tuning

**Backend** (`backend/.env`):
```bash
# Worker processes
WORKERS=4  # 2 * CPU cores

# Database connections
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=10
```

**Frontend** (nginx):
```nginx
# Enable gzip
gzip on;
gzip_types text/css application/javascript application/json;
gzip_min_length 1000;

# Browser caching
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### Monitoring Tools

**Prometheus + Grafana** (optional):

See [docs/MONITORING.md](MONITORING.md) for full setup.

Quick metrics check:
```bash
# Backend metrics endpoint (if enabled)
curl http://localhost:8000/metrics
```

---

## Advanced Topics

### Custom Plugins

Create custom functionality:

```python
# backend/app/plugins/my_plugin/plugin.py
from app.plugins.base import BasePlugin
from fastapi import APIRouter

class Plugin(BasePlugin):
    def __init__(self):
        super().__init__()
        self.name = "MyPlugin"
        self.version = "1.0.0"
    
    async def initialize(self) -> bool:
        return True
    
    def get_routes(self):
        router = APIRouter(prefix="/my-plugin", tags=["my-plugin"])
        
        @router.get("/")
        async def my_endpoint():
            return {"message": "Hello from plugin"}
        
        return [router]
```

### API Rate Limiting

Implement rate limiting:

```python
# backend/app/core/middleware.py
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from cachetools import TTLCache

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute=60):
        super().__init__(app)
        self.cache = TTLCache(maxsize=1000, ttl=60)
        self.limit = requests_per_minute
```

### Multi-Cluster Setup

For managing multiple Proxmox clusters:

1. Add each cluster via UI
2. Assign users to specific clusters (RBAC)
3. Monitor all clusters from single dashboard

---

## Support & Resources

- **Documentation**: [docs/](../docs/)
- **API Reference**: [docs/API.md](API.md)
- **Deployment Guide**: [docs/DEPLOYMENT.md](DEPLOYMENT.md)
- **User Guide**: [docs/USER_GUIDE.md](USER_GUIDE.md)
- **GitHub**: https://github.com/kumpeapps/kvcloud
- **Issues**: https://github.com/kumpeapps/kvcloud/issues
- **Email**: support@kumpeapps.com

---

**Last Updated**: December 16, 2025
