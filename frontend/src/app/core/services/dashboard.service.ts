import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DashboardStats {
  clusters: {
    total: number;
    online: number;
    offline: number;
  };
  vms: {
    total: number;
    running: number;
    stopped: number;
  };
  resources: {
    cpu: {
      usage: number;
      total: number;
    };
    memory: {
      used: number;
      total: number;
    };
    storage: {
      used: number;
      total: number;
    };
  };
  nodes: number;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  getStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.apiUrl}/clusters/stats/dashboard`);
  }
}
