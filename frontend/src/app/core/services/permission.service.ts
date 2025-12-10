import { Injectable, inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Permission service that delegates to AuthService.
 * Provides a convenient wrapper for permission checks.
 */
@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  private authService = inject(AuthService);

  /**
   * Check if user has specific permission.
   */
  hasPermission(resource: string, action: string): boolean {
    return this.authService.hasPermission(resource, action);
  }

  /**
   * Check if user has any of the specified permissions.
   */
  hasAnyPermission(permissions: Array<{resource: string, action: string}>): boolean {
    return this.authService.hasAnyPermission(permissions);
  }

  /**
   * Check if user has all of the specified permissions.
   */
  hasAllPermissions(permissions: Array<{resource: string, action: string}>): boolean {
    return this.authService.hasAllPermissions(permissions);
  }

  /**
   * Check if user is admin.
   */
  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  /**
   * Check if user can perform VM action.
   */
  canAccessVM(action: 'read' | 'create' | 'update' | 'delete' | 'start' | 'stop' | 'restart' | 'console'): boolean {
    return this.authService.canAccessVM(action);
  }

  /**
   * Check if user can access route by resource.
   */
  canAccessRoute(resource: string): boolean {
    return this.hasPermission(resource, 'read');
  }
}
