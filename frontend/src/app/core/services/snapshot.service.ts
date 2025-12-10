import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Snapshot {
  name: string;
  description?: string;
  snaptime?: number;
  vmstate?: number;
  parent?: string;
}

export interface SnapshotCreateRequest {
  snapname: string;
  description?: string;
  vmstate?: boolean;
}

export interface SnapshotResponse {
  message: string;
  task_id?: string;
  snapname: string;
}

@Injectable({
  providedIn: 'root'
})
export class SnapshotService {
  private apiUrl = `${environment.apiUrl}/snapshots`;

  constructor(private http: HttpClient) {}

  listSnapshots(nodeId: number, vmid: number): Observable<Snapshot[]> {
    return this.http.get<Snapshot[]>(`${this.apiUrl}/nodes/${nodeId}/vms/${vmid}`);
  }

  createSnapshot(nodeId: number, vmid: number, request: SnapshotCreateRequest): Observable<SnapshotResponse> {
    return this.http.post<SnapshotResponse>(`${this.apiUrl}/nodes/${nodeId}/vms/${vmid}`, request);
  }

  deleteSnapshot(nodeId: number, vmid: number, snapname: string): Observable<SnapshotResponse> {
    return this.http.delete<SnapshotResponse>(`${this.apiUrl}/nodes/${nodeId}/vms/${vmid}/${snapname}`);
  }

  rollbackSnapshot(nodeId: number, vmid: number, snapname: string): Observable<SnapshotResponse> {
    return this.http.post<SnapshotResponse>(`${this.apiUrl}/nodes/${nodeId}/vms/${vmid}/${snapname}/rollback`, {});
  }
}
