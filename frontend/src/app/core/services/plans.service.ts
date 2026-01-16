import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PlansService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);

  // Cloud License
  listCloudLicenses(): Observable<{ plans: any[] }> {
    return this.http.get<{ plans: any[] }>(`${this.apiUrl}/plans/cloud-license`);
  }
  createCloudLicense(plan: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/plans/cloud-license`, plan);
  }
  updateCloudLicense(id: number, plan: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/plans/cloud-license/${id}`, plan);
  }
  deleteCloudLicense(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/plans/cloud-license/${id}`);
  }
  assignCloudLicense(userId: number, planId: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/plans/cloud-license/assign/${userId}/${planId}`, {});
  }

  // VPS Plans
  listVpsPlans(): Observable<{ plans: any[] }> {
    return this.http.get<{ plans: any[] }>(`${this.apiUrl}/plans/vps`);
  }
  createVpsPlan(plan: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/plans/vps`, plan);
  }
  updateVpsPlan(id: number, plan: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/plans/vps/${id}`, plan);
  }
  deleteVpsPlan(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/plans/vps/${id}`);
  }
  listOsTemplates(): Observable<{ templates: any[] }> {
    return this.http.get<{ templates: any[] }>(`${this.apiUrl}/plans/os-templates`);
  }

  // Resource Groups
  createIpGroup(group: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/plans/groups/ip`, group);
  }
  createIsoGroup(group: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/plans/groups/iso`, group);
  }
  listIpGroups(): Observable<{ groups: any[] }> {
    return this.http.get<{ groups: any[] }>(`${this.apiUrl}/plans/groups/ip`);
  }
  listIsoGroups(): Observable<{ groups: any[] }> {
    return this.http.get<{ groups: any[] }>(`${this.apiUrl}/plans/groups/iso`);
  }
  updateIpGroup(id: number, group: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/plans/groups/ip/${id}`, group);
  }
  updateIsoGroup(id: number, group: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/plans/groups/iso/${id}`, group);
  }
  deleteIpGroup(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/plans/groups/ip/${id}`);
  }
  deleteIsoGroup(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/plans/groups/iso/${id}`);
  }
}