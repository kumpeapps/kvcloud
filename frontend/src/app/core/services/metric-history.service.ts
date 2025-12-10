import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MetricHistoryRecord {
  id: number;
  resource_type: string;
  resource_id: string;
  node_id?: number | null;
  timeframe: string;
  timestamp: string;
  cpu_usage?: number | null;
  cpu_iowait?: number | null;
  memory_used?: number | null;
  memory_total?: number | null;
  memory_usage_percent?: number | null;
  disk_read_bytes?: number | null;
  disk_write_bytes?: number | null;
  disk_used?: number | null;
  disk_total?: number | null;
  network_in_bytes?: number | null;
  network_out_bytes?: number | null;
  storage_used?: number | null;
  storage_total?: number | null;
  storage_usage_percent?: number | null;
  additional_metrics?: Record<string, any> | null;
  created_at: string;
}

export interface MetricAggregate {
  resource_type: string;
  resource_id: string;
  timeframe: string;
  start_time: string;
  end_time: string;
  avg_cpu_usage?: number | null;
  max_cpu_usage?: number | null;
  avg_memory_usage_percent?: number | null;
  max_memory_usage_percent?: number | null;
  total_disk_read_bytes?: number | null;
  total_disk_write_bytes?: number | null;
  total_network_in_bytes?: number | null;
  total_network_out_bytes?: number | null;
  data_points: number;
}

@Injectable({ providedIn: 'root' })
export class MetricHistoryService {
  private apiUrl = `${environment.apiUrl}/metrics/history`;

  constructor(private http: HttpClient) {}

  getNodeHistory(params: {
    nodeId: number;
    timeframe?: string;
    startTime?: string | null;
    endTime?: string | null;
    limit?: number;
  }): Observable<MetricHistoryRecord[]> {
    let httpParams = new HttpParams().set('timeframe', params.timeframe || 'day');
    if (params.startTime) httpParams = httpParams.set('start_time', params.startTime);
    if (params.endTime) httpParams = httpParams.set('end_time', params.endTime);
    if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());

    return this.http.get<MetricHistoryRecord[]>(`${this.apiUrl}/node/${params.nodeId}`, { params: httpParams });
  }

  getVMHistory(params: {
    vmid: number;
    nodeId?: number;
    timeframe?: string;
    startTime?: string | null;
    endTime?: string | null;
    limit?: number;
  }): Observable<MetricHistoryRecord[]> {
    let httpParams = new HttpParams().set('timeframe', params.timeframe || 'day');
    if (params.nodeId) httpParams = httpParams.set('node_id', params.nodeId.toString());
    if (params.startTime) httpParams = httpParams.set('start_time', params.startTime);
    if (params.endTime) httpParams = httpParams.set('end_time', params.endTime);
    if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());

    return this.http.get<MetricHistoryRecord[]>(`${this.apiUrl}/vm/${params.vmid}`, { params: httpParams });
  }

  getNodeAggregate(params: {
    nodeId: number;
    timeframe?: string;
    startTime?: string | null;
    endTime?: string | null;
  }): Observable<MetricAggregate> {
    let httpParams = new HttpParams().set('timeframe', params.timeframe || 'day');
    if (params.startTime) httpParams = httpParams.set('start_time', params.startTime);
    if (params.endTime) httpParams = httpParams.set('end_time', params.endTime);

    return this.http.get<MetricAggregate>(`${this.apiUrl}/node/${params.nodeId}/aggregate`, { params: httpParams });
  }

  getVMAggregate(params: {
    vmid: number;
    nodeId?: number;
    timeframe?: string;
    startTime?: string | null;
    endTime?: string | null;
  }): Observable<MetricAggregate> {
    let httpParams = new HttpParams().set('timeframe', params.timeframe || 'day');
    if (params.nodeId) httpParams = httpParams.set('node_id', params.nodeId.toString());
    if (params.startTime) httpParams = httpParams.set('start_time', params.startTime);
    if (params.endTime) httpParams = httpParams.set('end_time', params.endTime);

    return this.http.get<MetricAggregate>(`${this.apiUrl}/vm/${params.vmid}/aggregate`, { params: httpParams });
  }
}
