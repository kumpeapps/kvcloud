import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SnapshotSchedule {
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
  retention_count?: number;
  retention_days?: number;
  naming_pattern?: string;
  include_ram: boolean;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  last_status?: string;
  last_error?: string;
  run_count: number;
  created_at: string;
  updated_at?: string;
}

export interface CreateSnapshotScheduleRequest {
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
  retention_count?: number;
  retention_days?: number;
  naming_pattern?: string;
  include_ram?: boolean;
  is_active?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SnapshotScheduleService {
  private apiUrl = `${environment.apiUrl}/snapshot-schedules`;
  private http = inject(HttpClient);

  getSchedules(vmid?: number, nodeId?: number): Observable<SnapshotSchedule[]> {
    let params: any = {};
    if (vmid) params.vmid = vmid.toString();
    if (nodeId) params.node_id = nodeId.toString();
    
    return this.http.get<SnapshotSchedule[]>(`${this.apiUrl}/`, { params });
  }

  getSchedule(scheduleId: number): Observable<SnapshotSchedule> {
    return this.http.get<SnapshotSchedule>(`${this.apiUrl}/${scheduleId}`);
  }

  createSchedule(schedule: CreateSnapshotScheduleRequest): Observable<SnapshotSchedule> {
    return this.http.post<SnapshotSchedule>(`${this.apiUrl}/`, schedule);
  }

  updateSchedule(scheduleId: number, schedule: Partial<CreateSnapshotScheduleRequest>): Observable<SnapshotSchedule> {
    return this.http.put<SnapshotSchedule>(`${this.apiUrl}/${scheduleId}`, schedule);
  }

  deleteSchedule(scheduleId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${scheduleId}`);
  }

  runSchedule(scheduleId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${scheduleId}/run`, {});
  }
}
