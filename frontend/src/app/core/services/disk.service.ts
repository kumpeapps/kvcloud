import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface VMDisk {
  id: string;
  interface: string;
  index: number;
  storage: string;
  volume: string;
  size?: string;
  full_config: string;
}

export interface AddDiskRequest {
  storage: string;
  size: number;
  interface?: string;
  cache?: string;
  discard?: string;
  ssd?: number;
}

export interface ResizeDiskRequest {
  size_increment: string;
}

@Injectable({
  providedIn: 'root'
})
export class DiskService {
  private apiUrl = `${environment.apiUrl}/vms`;
  private http = inject(HttpClient);

  listDisks(nodeId: number, vmid: number): Observable<VMDisk[]> {
    return this.http.get<VMDisk[]>(`${this.apiUrl}/node/${nodeId}/vm/${vmid}/disks`);
  }

  addDisk(nodeId: number, vmid: number, diskConfig: AddDiskRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/node/${nodeId}/vm/${vmid}/disks`, diskConfig);
  }

  resizeDisk(nodeId: number, vmid: number, diskId: string, sizeIncrement: string): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/node/${nodeId}/vm/${vmid}/disks/${diskId}/resize`,
      { size_increment: sizeIncrement }
    );
  }

  deleteDisk(nodeId: number, vmid: number, diskId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/node/${nodeId}/vm/${vmid}/disks/${diskId}`);
  }

  parseDiskSize(sizeStr?: string): number {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/(\d+(\.\d+)?)(G|M|T)?/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[3]?.toUpperCase() || 'G';
    
    switch (unit) {
      case 'T': return value * 1024;
      case 'G': return value;
      case 'M': return value / 1024;
      default: return value;
    }
  }
}
