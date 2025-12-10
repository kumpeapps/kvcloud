import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class VmUserService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}

  createVmUser(vmId: number, nodeId: number, username: string, password: string | null, shell: string, sudoAccess: boolean, description: string | null, sshKeyIds: number[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/vm-users/`, {
      vm_id: vmId,
      node_id: nodeId,
      username,
      password,
      shell,
      sudo_access: sudoAccess,
      description,
      ssh_key_ids: sshKeyIds
    });
  }

  listVmUsers(vmId: number): Observable<{ users: any[] }> {
    return this.http.get<{ users: any[] }>(`${this.apiUrl}/vm-users/vm/${vmId}`);
  }

  updateVmUser(userId: number, updates: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/vm-users/${userId}`, updates);
  }

  deleteVmUser(userId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/vm-users/${userId}`);
  }

  setNetworkConfig(vmId: number, nodeId: number, config: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/vm-users/network`, {
      vm_id: vmId,
      node_id: nodeId,
      ...config
    });
  }

  getNetworkConfig(vmId: number): Observable<{ config: any }> {
    return this.http.get<{ config: any }>(`${this.apiUrl}/vm-users/network/${vmId}`);
  }
}
