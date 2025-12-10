# RBAC Quick Reference

## Backend: Protecting API Endpoints

### Import the decorator
```python
from app.core.rbac import require_permission
```

### Protect an endpoint
```python
@router.post("/vms/node/{node_id}/vm/{vmid}/start")
@require_permission("vm", "start")
async def start_vm(...):
    # Your endpoint logic
    pass
```

### Common resource:action patterns
```python
# VM Operations
@require_permission("vm", "read")     # List/view VMs
@require_permission("vm", "create")   # Create new VM
@require_permission("vm", "update")   # Edit VM config
@require_permission("vm", "delete")   # Delete VM
@require_permission("vm", "start")    # Start VM
@require_permission("vm", "stop")     # Stop VM
@require_permission("vm", "restart")  # Restart VM

# ISO Operations
@require_permission("iso", "read")    # List ISOs
@require_permission("iso", "upload")  # Upload ISO
@require_permission("iso", "delete")  # Delete ISO

# IP Pool Operations
@require_permission("ippool", "read")     # List IP pools
@require_permission("ippool", "create")   # Create pool
@require_permission("ippool", "update")   # Update pool
@require_permission("ippool", "delete")   # Delete pool
@require_permission("ippool", "allocate") # Allocate IP

# Snapshot Operations
@require_permission("snapshot", "read")     # List snapshots
@require_permission("snapshot", "create")   # Create snapshot
@require_permission("snapshot", "delete")   # Delete snapshot
@require_permission("snapshot", "rollback") # Rollback to snapshot

# Admin Operations
@require_permission("user", "create")   # Create user
@require_permission("user", "read")     # List users
@require_permission("user", "update")   # Edit user
@require_permission("user", "delete")   # Delete user
@require_permission("cluster", "read")  # List clusters
@require_permission("cluster", "create") # Add cluster
```

---

## Frontend: Permission-Based UI Controls

### Import directives
```typescript
import { HasPermissionDirective } from '../../core/directives/has-permission.directive';
import { DisableIfNoPermissionDirective } from '../../core/directives/disable-if-no-permission.directive';

@Component({
  imports: [
    HasPermissionDirective,
    DisableIfNoPermissionDirective,
    // ... other imports
  ]
})
```

### Hide/show elements with *hasPermission
```html
<!-- Hide button if user lacks permission -->
<button 
  mat-raised-button 
  *hasPermission="{ resource: 'vm', action: 'create' }"
  (click)="createVM()">
  Create VM
</button>

<!-- Hide delete button -->
<button 
  mat-icon-button 
  *hasPermission="{ resource: 'vm', action: 'delete' }"
  (click)="deleteVM(vm)">
  <mat-icon>delete</mat-icon>
</button>

<!-- Hide upload button -->
<button 
  *hasPermission="{ resource: 'iso', action: 'upload' }"
  (click)="uploadISO()">
  Upload ISO
</button>
```

### Disable elements with [disableIfNoPermission]
```html
<!-- Disable button but keep it visible -->
<button 
  mat-button 
  [disableIfNoPermission]="{ resource: 'vm', action: 'start' }"
  (click)="startVM()">
  Start VM
</button>

<!-- Disable input field -->
<input 
  matInput 
  [disableIfNoPermission]="{ resource: 'vm', action: 'update' }"
  [(ngModel)]="vmName">

<!-- Disable menu item -->
<button 
  mat-menu-item 
  [disableIfNoPermission]="{ resource: 'snapshot', action: 'create' }">
  <mat-icon>camera_alt</mat-icon>
  Create Snapshot
</button>
```

### Route guards
```typescript
import { roleGuard, permissionGuard } from '../../core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [roleGuard],
    data: { requiredRole: 'admin' },
    loadComponent: () => import('./admin.component')
  },
  {
    path: 'vms',
    canActivate: [permissionGuard],
    data: { 
      requiredPermission: { resource: 'vm', action: 'read' }
    },
    loadComponent: () => import('./vms.component')
  }
];
```

### Programmatic permission checks
```typescript
import { AuthService } from '../../core/services/auth.service';

constructor(private authService: AuthService) {}

// Check single permission
if (this.authService.hasPermission('vm', 'delete')) {
  // Show delete option
}

// Check if admin
if (this.authService.isAdmin()) {
  // Show admin features
}

// Check if user can access specific VM
if (this.authService.canAccessVM(vmId)) {
  // Allow access
}

// Check any of multiple permissions
if (this.authService.hasAnyPermission([
  { resource: 'vm', action: 'start' },
  { resource: 'vm', action: 'stop' }
])) {
  // Show power controls
}

// Check all permissions required
if (this.authService.hasAllPermissions([
  { resource: 'vm', action: 'read' },
  { resource: 'snapshot', action: 'create' }
])) {
  // Show snapshot button
}
```

---

## Role Definitions

### Admin Role
**Full access to everything**
- All VM operations (create, read, update, delete, start, stop, restart)
- All snapshot operations
- All ISO operations
- All IP pool operations
- All cluster operations
- All user operations
- All role operations

### User Role
**VM operations and snapshots**
- VM: read, create, update, delete, start, stop, restart
- Snapshot: read, create, delete, rollback
- ISO: read
- IP pool: read, allocate

### Viewer Role
**Read-only access**
- VM: read
- ISO: read
- IP pool: read
- Snapshot: read

### Reseller Role
**User management + VM operations**
- All User role permissions
- User: create, read, update, delete (limited to their customers)
- Resource quotas and billing controls

---

## Adding New Permissions

### 1. Define in init_rbac.py
```python
# Add to the appropriate role section
policies.extend([
    ["p", "user", "resource_name", "action_name"],
    ["p", "admin", "resource_name", "action_name"],
])
```

### 2. Protect backend endpoint
```python
@require_permission("resource_name", "action_name")
async def my_endpoint(...):
    pass
```

### 3. Use in frontend
```html
<button *hasPermission="{ resource: 'resource_name', action: 'action_name' }">
  Do Action
</button>
```

---

## Testing Permissions

### Backend tests
```python
def test_viewer_cannot_create_vm(client, viewer_token):
    response = client.post(
        "/vms/node/1/create",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={...}
    )
    assert response.status_code == 403
```

### Frontend tests
```typescript
it('should hide delete button for viewer', () => {
  authService.currentUser.set({ role: 'viewer', ... });
  fixture.detectChanges();
  
  const deleteButton = fixture.debugElement.query(By.css('[data-test="delete-btn"]'));
  expect(deleteButton).toBeNull();
});
```

---

## Database Queries

### View all policies
```sql
SELECT * FROM casbin_rule WHERE ptype = 'p' ORDER BY v0, v1, v2;
```

### Count policies by role
```sql
SELECT v0 as role, COUNT(*) as permission_count 
FROM casbin_rule 
WHERE ptype = 'p' 
GROUP BY v0;
```

### Find permissions for specific resource
```sql
SELECT v0 as role, v2 as action 
FROM casbin_rule 
WHERE ptype = 'p' AND v1 = 'vm';
```

---

## Troubleshooting

### Permission denied but should work?
1. Check user role: `SELECT role FROM users WHERE id = ?`
2. Verify policy exists: `SELECT * FROM casbin_rule WHERE v0 = 'role' AND v1 = 'resource' AND v2 = 'action'`
3. Check token: JWT should contain `"role": "user"` claim
4. Restart backend to reload policies

### Directive not hiding element?
1. Verify directive is imported in component
2. Check AuthService.currentUser() has valid user with role
3. Verify permission map in AuthService includes the role
4. Check browser console for errors

### Route guard not working?
1. Ensure guard is in `canActivate` array
2. Check `data: { requiredRole: '...' }` is set
3. Verify AuthService.currentUser() is populated
4. Check for console errors about guard execution

---

**Last Updated**: December 19, 2025  
**RBAC Version**: 1.0 (Database-backed with Casbin)
