import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Role, CreateRoleRequest, UpdateRoleRequest } from '../models/role.model';

@Injectable({
  providedIn: 'root'
})
export class RolesService {
  private apiUrl = `${environment.apiUrl}/roles/`;
  private http = inject(HttpClient);

  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(this.apiUrl);
  }

  getRole(id: number): Observable<Role> {
    return this.http.get<Role>(`${this.apiUrl}${id}`);
  }

  createRole(role: CreateRoleRequest): Observable<Role> {
    return this.http.post<Role>(this.apiUrl, role);
  }

  updateRole(roleNameOrId: string | number, role: UpdateRoleRequest): Observable<Role> {
    return this.http.put<Role>(`${this.apiUrl}${roleNameOrId}`, role);
  }

  deleteRole(nameOrId: string | number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}${nameOrId}`);
  }

  assignRoleToUser(userId: number, roleId: number): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/users/${userId}/roles/${roleId}`, {});
  }

  removeRoleFromUser(userId: number, roleId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/users/${userId}/roles/${roleId}`);
  }
}
