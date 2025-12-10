import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BackupCreateRequest {
  storage?: string;
  mode?: 'snapshot' | 'suspend' | 'stop';
  compress?: 'none' | 'lzo' | 'gzip' | 'zstd';
  notes?: string;
}

export interface BackupCreateResponse {
  upid: string;
  node: string;
  vmid: number;
  storage: string;
  mode: string;
  compress: string;
  message: string;
}

export interface BackupInfo {
  volid: string;
  format: string;
  size: number;
  ctime: number;
  vmid?: number;
  storage: string;
  notes: string;
}

export interface BackupRestoreRequest {
  target_vmid: number;
  storage?: string;
}

export interface BackupRestoreResponse {
  upid: string;
  node: string;
  vmid: number;
  archive: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class BackupService {
  private apiUrl = `${environment.apiUrl}/backups`;

  constructor(private http: HttpClient) {}

  /**
   * Create a backup of a VM
   * @param nodeId Node ID where the VM is running
   * @param vmid VM ID to backup
   * @param config Backup configuration
   * @returns Observable with backup task information
   */
  createBackup(nodeId: number, vmid: number, config: BackupCreateRequest = {}): Observable<BackupCreateResponse> {
    const request = {
      storage: config.storage || 'local',
      mode: config.mode || 'snapshot',
      compress: config.compress || 'zstd',
      notes: config.notes
    };
    return this.http.post<BackupCreateResponse>(`${this.apiUrl}/node/${nodeId}/vm/${vmid}`, request);
  }

  /**
   * List all backups on a node
   * @param nodeId Node ID
   * @param vmid Optional VM ID to filter backups
   * @param storage Optional storage location to filter
   * @returns Observable with list of backups
   */
  listNodeBackups(nodeId: number, vmid?: number, storage?: string): Observable<BackupInfo[]> {
    let params = new HttpParams();
    if (vmid) {
      params = params.set('vmid', vmid.toString());
    }
    if (storage) {
      params = params.set('storage', storage);
    }
    return this.http.get<BackupInfo[]>(`${this.apiUrl}/node/${nodeId}`, { params });
  }

  /**
   * List all backups for a specific VM
   * @param nodeId Node ID
   * @param vmid VM ID
   * @param storage Optional storage location to filter
   * @returns Observable with list of VM backups
   */
  listVmBackups(nodeId: number, vmid: number, storage?: string): Observable<BackupInfo[]> {
    let params = new HttpParams();
    if (storage) {
      params = params.set('storage', storage);
    }
    return this.http.get<BackupInfo[]>(`${this.apiUrl}/node/${nodeId}/vm/${vmid}`, { params });
  }

  /**
   * Restore a VM from a backup
   * @param nodeId Node ID
   * @param volid Backup volume ID
   * @param config Restore configuration
   * @returns Observable with restore task information
   */
  restoreBackup(nodeId: number, volid: string, config: BackupRestoreRequest): Observable<BackupRestoreResponse> {
    const params = new HttpParams().set('volid', volid);
    return this.http.post<BackupRestoreResponse>(`${this.apiUrl}/node/${nodeId}/restore`, config, { params });
  }

  /**
   * Delete a backup
   * @param nodeId Node ID
   * @param volid Backup volume ID
   * @returns Observable with success message
   */
  deleteBackup(nodeId: number, volid: string): Observable<{ message: string; volid: string }> {
    const params = new HttpParams().set('volid', volid);
    return this.http.delete<{ message: string; volid: string }>(`${this.apiUrl}/node/${nodeId}`, { params });
  }

  /**
   * Format backup size to human-readable format
   * @param bytes Size in bytes
   * @returns Formatted string
   */
  formatSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Format Unix timestamp to local date string
   * @param timestamp Unix timestamp
   * @returns Formatted date string
   */
  formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  /**
   * Get backup mode display name
   * @param mode Backup mode
   * @returns Display name
   */
  getModeDisplayName(mode: string): string {
    const modeNames: { [key: string]: string } = {
      'snapshot': 'Snapshot (fastest)',
      'suspend': 'Suspend (safe)',
      'stop': 'Stop (safest)'
    };
    return modeNames[mode] || mode;
  }

  /**
   * Get compression display name
   * @param compress Compression type
   * @returns Display name
   */
  getCompressionDisplayName(compress: string): string {
    const compressNames: { [key: string]: string } = {
      'none': 'None (fastest)',
      'lzo': 'LZO (fast)',
      'gzip': 'GZIP (balanced)',
      'zstd': 'ZSTD (best)'
    };
    return compressNames[compress] || compress;
  }
}
