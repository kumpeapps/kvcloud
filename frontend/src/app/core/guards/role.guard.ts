import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Role-based route guard.
 * Checks if user has required role to access route.
 * 
 * Usage in routes:
 * { path: 'admin', canActivate: [roleGuard], data: { role: 'admin' } }
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  const requiredRole = route.data['role'];
  const user = authService.currentUser();
  
  if (!user) {
    router.navigate(['/auth/login']);
    return false;
  }
  
  // Superusers and admins can access everything
  if (user.is_superuser || user.role === 'admin') {
    return true;
  }
  
  // Check if user has required role
  if (requiredRole && user.role !== requiredRole) {
    router.navigate(['/dashboard']);
    return false;
  }
  
  return true;
};

/**
 * Permission-based route guard.
 * Checks if user has specific permission (resource:action) to access route.
 * 
 * Usage in routes:
 * { path: 'vms/create', canActivate: [permissionGuard], data: { permission: { resource: 'vm', action: 'create' } } }
 */
export const permissionGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  const permission = route.data['permission'];
  const user = authService.currentUser();
  
  if (!user) {
    router.navigate(['/auth/login']);
    return false;
  }
  
  // Check permission
  if (permission) {
    const hasPermission = authService.hasPermission(permission.resource, permission.action);
    if (!hasPermission) {
      router.navigate(['/dashboard']);
      return false;
    }
  }
  
  return true;
};
