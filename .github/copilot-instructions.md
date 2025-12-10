# GitHub Copilot Instructions for KVCloud

## Project Overview
KVCloud is a modern virtual cloud management panel for Proxmox clusters, similar to Virtualizor. It provides VM management, user administration with RBAC, and comprehensive monitoring capabilities.

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.11)
- **Database**: SQLite (dev), PostgreSQL (production)
- **ORM**: SQLAlchemy (async)
- **Authentication**: JWT tokens with passlib/bcrypt
- **RBAC**: Casbin for role-based access control
- **VM Integration**: Proxmoxer for Proxmox API
- **Architecture**: Plugin-based with module system

### Frontend
- **Framework**: Angular 17 (standalone components)
- **UI Library**: Angular Material
- **Charts**: ng2-charts with Chart.js
- **State Management**: Signals (Angular 17)
- **HTTP**: HttpClient with interceptors
- **Routing**: Standalone routes

## Code Style & Conventions

### Python/Backend
- Follow PEP 8 style guide
- Use type hints for all function signatures
- Async/await for all database and I/O operations
- Use Pydantic models for request/response validation
- Document all API endpoints with OpenAPI descriptions
- Keep route handlers thin, business logic in services
- Use dependency injection for database sessions

### TypeScript/Frontend
- Use standalone components (Angular 17 style)
- Signals for reactive state management
- Strong typing - avoid `any` type
- Component composition over inheritance
- Feature-based folder structure
- Services for API calls and shared logic
- Guards for route protection
- Interceptors for auth tokens and error handling

## Project Structure

### Backend (`/backend`)
```
app/
├── api/           # API route handlers
├── core/          # Config, database, security, RBAC
├── models/        # SQLAlchemy models
├── services/      # Business logic
├── plugins/       # Plugin system
└── modules/       # Module system
```

### Frontend (`/frontend/src/app`)
```
app/
├── core/          # Guards, interceptors, services
├── features/      # Feature modules (auth, dashboard, vms, users)
├── shared/        # Shared components, directives, pipes
└── layouts/       # Layout components (main, auth)
```

## Key Patterns

### Backend API Endpoints
```python
@router.get("/endpoint", response_model=ResponseModel)
async def endpoint_handler(
    param: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> ResponseModel:
    """Clear description of what this endpoint does."""
    # Implementation
```

### Frontend Services
```typescript
@Injectable({providedIn: 'root'})
export class FeatureService {
  private apiUrl = environment.apiUrl;
  
  constructor(private http: HttpClient) {}
  
  getItems(): Observable<Item[]> {
    return this.http.get<Item[]>(`${this.apiUrl}/items`);
  }
}
```

### Frontend Components (Standalone)
```typescript
@Component({
  selector: 'app-feature',
  standalone: true,
  imports: [CommonModule, MaterialModules],
  templateUrl: './feature.component.html',
  styleUrls: ['./feature.component.scss']
})
export class FeatureComponent {
  data = signal<Data[]>([]);
  
  constructor(private service: FeatureService) {}
}
```

## Authentication Flow
1. User logs in via `/auth/token` with username/password (form data)
2. Backend returns JWT access token
3. Frontend stores token in localStorage
4. Token sent in Authorization header: `Bearer <token>`
5. Backend validates token and returns user info
6. Guards protect routes requiring authentication

## RBAC Implementation
- Casbin enforcer for policy checks
- Roles: admin, user, viewer (customizable)
- Permissions: resource:action (e.g., vm:create, user:read)
- Policy stored in database (casbin-sqlalchemy-adapter)
- Check permissions before sensitive operations

## VM Management Features
- List VMs across clusters/nodes
- Start/Stop/Restart/Pause/Resume
- Create VMs with wizard
- Clone/Template operations
- Snapshot management
- Console access (VNC/noVNC)
- Resource monitoring (CPU, RAM, disk, network)
- Statistics and graphs

## User Management Features
- CRUD operations for users
- Role assignment
- Permission management
- Activity logs
- Password policies
- Two-factor authentication (future)

## Development Commands

### Backend
```bash
# Run dev server
docker compose -f docker-compose.dev.yml up backend

# Run tests
docker exec kvcloud-backend-dev pytest

# Database migrations
docker exec kvcloud-backend-dev alembic upgrade head
```

### Frontend
```bash
# Run dev server
docker compose -f docker-compose.dev.yml up frontend

# Access at http://localhost:4200
# API at http://localhost:8000
```

## Important Notes
- Always use async/await for database operations
- Validate all inputs with Pydantic models
- Handle errors gracefully with proper HTTP status codes
- Use Angular Material components for consistent UI
- Implement loading states and error messages in UI
- Keep components focused and testable
- Document complex logic with comments
- Use environment variables for configuration
- Never commit secrets or credentials

## Default Credentials
- Username: `admin`
- Password: `admin123` (dev) / `changeme` (prod)
- Change immediately after first login

## Current Development Phase
See PROGRESS.md for current status and next steps.
