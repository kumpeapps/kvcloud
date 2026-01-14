import { Injectable, inject, signal } from '@angular/core';
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

interface UserPermissions {
  role: string;
  is_superuser: boolean;
  permissions: Array<{resource: string, action: string}>;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  currentUser = signal<User | null>(null);
  isAuthenticated = signal<boolean>(false);
  private userPermissions = signal<UserPermissions | null>(null);

  constructor() {
    // Check if we have a token on init
    const token = this.getToken();
    if (token) {
      this.isAuthenticated.set(true);
      this.loadCurrentUser();
      this.loadUserPermissions();
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
        this.loadUserPermissions();
      })
    );
  }

  logout(): void {
    localStorage.removeItem('access_token');
    this.currentUser.set(null);
    this.userPermissions.set(null);
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

  loadUserPermissions(): void {
    this.http.get<UserPermissions>(`${this.apiUrl}/auth/permissions`).subscribe({
      next: (permissions) => {
        this.userPermissions.set(permissions);
      },
      error: () => {
        console.error('Failed to load user permissions');
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
    const permissions = this.userPermissions();
    
    if (!user || !permissions) return false;
    
    // Superusers have all permissions
    if (user.is_superuser || permissions.is_superuser) {
      return true;
    }
    
    // Check for wildcard permission
    const hasWildcard = permissions.permissions.some(
      p => (p.resource === '*' && p.action === '*') ||
           (p.resource === resource && p.action === '*') ||
           (p.resource === '*' && p.action === action)
    );
    
    if (hasWildcard) return true;
    
    // Check for exact permission
    return permissions.permissions.some(
      p => p.resource === resource && p.action === action
    );
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
