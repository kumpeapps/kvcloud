import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ISO {
  volid: string;
  storage: string;
  format: string;
  size: number;
  name: string;
}

export interface Storage {
  storage: string;
  type: string;
  content: string;
  active: boolean;
  avail: number;
  used: number;
  total: number;
}

export interface ISOUploadRequest {
  node_id: number;
  storage: string;
  filename: string;
  url: string;
}

export interface ISOUploadResponse {
  message: string;
  task_upid: string;
  note: string;
}

export interface TaskStatus {
  status: string;  // 'running' or 'stopped'
  exitstatus?: string;  // 'OK' or error message
  type?: string;
  starttime?: number;
  endtime?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ISOService {
  private apiUrl = `${environment.apiUrl}/isos`;

  constructor(private http: HttpClient) {}

  listNodeISOs(nodeId: number): Observable<ISO[]> {
    return this.http.get<ISO[]>(`${this.apiUrl}/nodes/${nodeId}`);
  }

  listNodeStorages(nodeId: number): Observable<Storage[]> {
    return this.http.get<Storage[]>(`${this.apiUrl}/nodes/${nodeId}/storages`);
  }

  uploadISO(data: ISOUploadRequest): Observable<ISOUploadResponse> {
    return this.http.post<ISOUploadResponse>(`${this.apiUrl}/upload`, data);
  }

  getTaskStatus(nodeId: number, upid: string): Observable<TaskStatus> {
    return this.http.get<TaskStatus>(`${this.apiUrl}/task/${nodeId}/${encodeURIComponent(upid)}`);
  }

  deleteISO(nodeId: number, storage: string, volid: string): Observable<any> {
    // volid contains special characters like 'local:iso/filename.iso'
    // We need to encode it properly for the URL
    const encodedVolid = encodeURIComponent(volid);
    return this.http.delete(`${this.apiUrl}/nodes/${nodeId}/storage/${storage}/iso/${encodedVolid}`);
  }
}
