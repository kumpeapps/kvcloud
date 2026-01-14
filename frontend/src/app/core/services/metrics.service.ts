import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MetricPoint {
  timestamp: number;
  value: number;
}

export interface NodeMetrics {
  node_id: number;
  node_name: string;
  cpu: MetricPoint[];
  memory: MetricPoint[];
  network_in: MetricPoint[];
  network_out: MetricPoint[];
  uptime?: number;
  load_average?: number[];
}

export interface VMMetrics {
  vmid: number;
  vm_name: string;
  cpu: MetricPoint[];
  memory: MetricPoint[];
  disk_read: MetricPoint[];
  disk_write: MetricPoint[];
}

export interface ClusterMetrics {
  total_cpu_cores: number;
  total_memory_gb: number;
  total_storage_gb: number;
  cpu_usage_percent: number;
  memory_usage_percent: number;
  storage_usage_percent: number;
  nodes_online: number;
  nodes_offline: number;
  vms_running: number;
  vms_stopped: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class MetricsService {
  private apiUrl = `${environment.apiUrl}/metrics`;
  private http = inject(HttpClient);

  getNodeMetrics(nodeId: number, durationMinutes: number = 60): Observable<NodeMetrics> {
    return this.http.get<NodeMetrics>(`${this.apiUrl}/nodes/${nodeId}`, {
      params: { duration_minutes: durationMinutes.toString() }
    });
  }

  getVMMetrics(nodeId: number, vmid: number, durationMinutes: number = 60): Observable<VMMetrics> {
    return this.http.get<VMMetrics>(`${this.apiUrl}/vms/${nodeId}/${vmid}`, {
      params: { duration_minutes: durationMinutes.toString() }
    });
  }

  getClusterMetrics(): Observable<ClusterMetrics> {
    return this.http.get<ClusterMetrics>(`${this.apiUrl}/cluster`);
  }
}
