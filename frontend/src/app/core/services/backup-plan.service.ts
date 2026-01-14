import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BackupPlan {
  id: number;
  vmid: number;
  node_id: number;
  name: string;
  description?: string;
  schedule_type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  cron_expression?: string;
  hour?: number;
  minute?: number;
  day_of_week?: number;
  day_of_month?: number;
  storage: string;
  mode: 'snapshot' | 'suspend' | 'stop';
  compress: 'zstd' | 'gzip' | 'lzo' | '0';
  retention_count?: number;
  retention_days?: number;
  email_on_success: boolean;
  email_on_failure: boolean;
  notification_emails?: string;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  last_status?: string;
  last_error?: string;
  last_backup_volid?: string;
  run_count: number;
  success_count: number;
  failure_count: number;
  created_at: string;
  updated_at?: string;
}

export interface CreateBackupPlanRequest {
  vmid: number;
  node_id: number;
  name: string;
  description?: string;
  schedule_type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  cron_expression?: string;
  hour?: number;
  minute?: number;
  day_of_week?: number;
  day_of_month?: number;
  storage: string;
  mode?: 'snapshot' | 'suspend' | 'stop';
  compress?: 'zstd' | 'gzip' | 'lzo' | '0';
  retention_count?: number;
  retention_days?: number;
  email_on_success?: boolean;
  email_on_failure?: boolean;
  notification_emails?: string;
  is_active?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class BackupPlanService {
  private apiUrl = `${environment.apiUrl}/backup-plans`;
  private http = inject(HttpClient);

  getPlans(vmid?: number, nodeId?: number): Observable<BackupPlan[]> {
    let params: any = {};
    if (vmid) params.vmid = vmid.toString();
    if (nodeId) params.node_id = nodeId.toString();
    
    return this.http.get<BackupPlan[]>(`${this.apiUrl}/`, { params });
  }

  getPlan(planId: number): Observable<BackupPlan> {
    return this.http.get<BackupPlan>(`${this.apiUrl}/${planId}`);
  }

  createPlan(plan: CreateBackupPlanRequest): Observable<BackupPlan> {
    return this.http.post<BackupPlan>(`${this.apiUrl}/`, plan);
  }

  updatePlan(planId: number, plan: Partial<CreateBackupPlanRequest>): Observable<BackupPlan> {
    return this.http.put<BackupPlan>(`${this.apiUrl}/${planId}`, plan);
  }

  deletePlan(planId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${planId}`);
  }

  runPlan(planId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${planId}/run`, {});
  }
}
