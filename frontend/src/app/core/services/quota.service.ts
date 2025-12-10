import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserQuota {
  id: number;
  user_id: number;
  max_vms?: number;
  max_running_vms?: number;
  max_cpu_per_vm?: number;
  max_memory_per_vm?: number;
  max_disk_per_vm?: number;
  max_total_cpu?: number;
  max_total_memory?: number;
  max_total_disk?: number;
  max_snapshots_per_vm?: number;
  max_backups?: number;
  max_network_interfaces_per_vm?: number;
  max_ip_addresses?: number;
  can_create_templates: boolean;
  can_clone_vms: boolean;
  can_use_iso_library: boolean;
  can_access_console: boolean;
  notes?: string;
  current_vms: number;
  current_running_vms: number;
  current_total_cpu: number;
  current_total_memory: number;
  current_total_disk: number;
  last_usage_update?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateQuotaRequest {
  user_id: number;
  max_vms?: number;
  max_running_vms?: number;
  max_cpu_per_vm?: number;
  max_memory_per_vm?: number;
  max_disk_per_vm?: number;
  max_total_cpu?: number;
  max_total_memory?: number;
  max_total_disk?: number;
  max_snapshots_per_vm?: number;
  max_backups?: number;
  max_network_interfaces_per_vm?: number;
  max_ip_addresses?: number;
  can_create_templates?: boolean;
  can_clone_vms?: boolean;
  can_use_iso_library?: boolean;
  can_access_console?: boolean;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class QuotaService {
  private apiUrl = `${environment.apiUrl}/quotas`;

  constructor(private http: HttpClient) {}

  getUserQuota(userId: number): Observable<UserQuota> {
    return this.http.get<UserQuota>(`${this.apiUrl}/user/${userId}`);
  }

  getAllQuotas(): Observable<UserQuota[]> {
    return this.http.get<UserQuota[]>(this.apiUrl);
  }

  createQuota(request: CreateQuotaRequest): Observable<UserQuota> {
    return this.http.post<UserQuota>(this.apiUrl, request);
  }

  updateQuota(quotaId: number, request: Partial<CreateQuotaRequest>): Observable<UserQuota> {
    return this.http.put<UserQuota>(`${this.apiUrl}/${quotaId}`, request);
  }

  deleteQuota(quotaId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${quotaId}`);
  }

  refreshUsage(quotaId: number): Observable<UserQuota> {
    return this.http.post<UserQuota>(`${this.apiUrl}/${quotaId}/refresh`, {});
  }
}
