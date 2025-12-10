import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuditLog {
  id: number;
  user_id: number;
  username: string;
  action: string;
  resource_type: string;
  resource_id?: number;
  details?: any;
  ip_address?: string;
  status: 'success' | 'failed';
  created_at: string;
}

export interface AuditLogStats {
  total_actions: number;
  failed_actions: number;
  success_rate: number;
  top_users: Array<{ username: string; action_count: number }>;
  actions_by_type: Record<string, number>;
}

export interface AuditLogFilters {
  user_id?: number;
  action?: string;
  resource_type?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuditLogService {
  private apiUrl = `${environment.apiUrl}/audit-logs`;

  constructor(private http: HttpClient) {}

  getLogs(filters?: AuditLogFilters): Observable<AuditLog[]> {
    let params = new HttpParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params = params.set(key, value.toString());
        }
      });
    }
    
    return this.http.get<AuditLog[]>(this.apiUrl, { params });
  }

  getStats(filters?: AuditLogFilters): Observable<AuditLogStats> {
    let params = new HttpParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key !== 'limit' && key !== 'offset') {
          params = params.set(key, value.toString());
        }
      });
    }
    
    return this.http.get<AuditLogStats>(`${this.apiUrl}/stats`, { params });
  }
}
