import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

interface LoginRequest {
  username: string;
  password: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  is_superuser: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  currentUser = signal<User | null>(null);
  isAuthenticated = signal<boolean>(false);

  constructor(private http: HttpClient) {
    // Check if we have a token on init
    const token = this.getToken();
    if (token) {
      this.isAuthenticated.set(true);
      this.loadCurrentUser();
    }
  }

  login(credentials: LoginRequest): Observable<TokenResponse> {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    return this.http.post<TokenResponse>(`${this.apiUrl}/auth/token`, formData).pipe(
      tap(response => {
        localStorage.setItem('access_token', response.access_token);
        this.isAuthenticated.set(true);
        this.loadCurrentUser();
      })
    );
  }

  logout(): void {
    localStorage.removeItem('access_token');
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
  }

  getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  loadCurrentUser(): void {
    this.http.get<User>(`${this.apiUrl}/auth/me`).subscribe({
      next: (user) => {
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      },
      error: () => {
        this.logout();
      }
    });
  }

  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/change-password`, {
      current_password: currentPassword,
      new_password: newPassword
    });
  }

  /**
   * Check if the current user has a specific permission.
   * @param resource - The resource (e.g., 'vm', 'iso', 'ippool')
   * @param action - The action (e.g., 'read', 'create', 'delete')
   * @returns true if the user has the permission
   */
  hasPermission(resource: string, action: string): boolean {
    const user = this.currentUser();
    
    if (!user) return false;
    
    // Superusers and admins have all permissions
    if (user.is_superuser || user.role === 'admin') {
      return true;
    }
    
    // Permission mappings based on role
    const permissions: Record<string, string[]> = {
      'user': [
        'vm:read', 'vm:create', 'vm:start', 'vm:stop', 'vm:restart', 
        'vm:delete', 'vm:update', 'vm:console',
        'snapshot:read', 'snapshot:create', 'snapshot:delete', 'snapshot:rollback',
        'iso:read', 'iso:upload',
        'cluster:read', 'node:read',
        'ippool:read', 'ippool:allocate', 'ippool:deallocate'
      ],
      'viewer': [
        'vm:read', 'snapshot:read', 'cluster:read', 
        'node:read', 'iso:read', 'ippool:read'
      ],
      'reseller': [
        'vm:read', 'vm:create', 'vm:start', 'vm:stop', 'vm:restart',
        'vm:delete', 'vm:update',
        'user:create', 'user:read', 'user:update', 'user:delete',
        'snapshot:read', 'snapshot:create', 'snapshot:delete',
        'iso:read', 'iso:upload',
        'ippool:read', 'ippool:allocate', 'ippool:deallocate'
      ]
    };
    
    const userPermissions = permissions[user.role] || [];
    const permissionKey = `${resource}:${action}`;
    const wildcardKey = `${resource}:*`;
    
    return userPermissions.includes(permissionKey) || 
           userPermissions.includes(wildcardKey) ||
           userPermissions.includes('*:*');
  }

  /**
   * Check if user has any of the specified permissions.
   */
  hasAnyPermission(permissions: Array<{resource: string, action: string}>): boolean {
    return permissions.some(p => this.hasPermission(p.resource, p.action));
  }

  /**
   * Check if user has all of the specified permissions.
   */
  hasAllPermissions(permissions: Array<{resource: string, action: string}>): boolean {
    return permissions.every(p => this.hasPermission(p.resource, p.action));
  }

  /**
   * Check if user can perform action on VM.
   */
  canAccessVM(action: 'read' | 'create' | 'update' | 'delete' | 'start' | 'stop' | 'restart' | 'console'): boolean {
    return this.hasPermission('vm', action);
  }

  /**
   * Check if user is admin or superuser.
   */
  isAdmin(): boolean {
    const user = this.currentUser();
    return user ? (user.is_superuser || user.role === 'admin') : false;
  }
}
