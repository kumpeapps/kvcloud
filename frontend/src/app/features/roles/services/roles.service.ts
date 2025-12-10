import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Role, CreateRoleRequest, UpdateRoleRequest } from '../models/role.model';

@Injectable({
  providedIn: 'root'
})
export class RolesService {
  private apiUrl = `${environment.apiUrl}/roles`;

  constructor(private http: HttpClient) {}

  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(this.apiUrl);
  }

  getRole(id: number): Observable<Role> {
    return this.http.get<Role>(`${this.apiUrl}/${id}`);
  }

  createRole(role: CreateRoleRequest): Observable<Role> {
    return this.http.post<Role>(this.apiUrl, role);
  }

  updateRole(id: number, role: UpdateRoleRequest): Observable<Role> {
    return this.http.put<Role>(`${this.apiUrl}/${id}`, role);
  }

  deleteRole(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  assignRoleToUser(userId: number, roleId: number): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/users/${userId}/roles/${roleId}`, {});
  }

  removeRoleFromUser(userId: number, roleId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/users/${userId}/roles/${roleId}`);
  }
}
