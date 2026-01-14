import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface VM {
  vmid: number;
  name: string;
  status: 'running' | 'stopped' | 'paused';
  node: string;
  cpu?: number;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  type?: string;
  tags?: string;
  template?: number | boolean | string;
}

export interface VMStatus {
  vmid: number;
  name: string;
  status: string;
  node?: string;
  type?: string;
  cpu?: number;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  is_locked?: boolean;
  lock_reason?: string;
}

export interface VMCreateData {
  vmid: number;
  name: string;
  cores: number;
  memory: number;
  disk_size: number;
  storage: string;
  network_bridge: string;
  os_type: string;
  iso?: string;
  template_id?: number;
  cloud_init_profile_id?: number;
  enable_guest_agent?: boolean;
  provision_via_guest_agent?: boolean;
  default_user?: string;
  default_password?: string;
  ssh_authorized_keys?: string[];
  ssh_pwauth?: boolean;
  packages?: string[];
  apt_update?: boolean;
  apt_upgrade?: boolean;
  apt_reboot_if_required?: boolean;
  docker_compose_content?: string;
  docker_compose_path?: string;
  start_docker_compose?: boolean;
  timezone?: string;
  locale?: string;
}

@Injectable({
  providedIn: 'root'
})
export class VMService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);

  // VM operations
  listVMs(nodeId: number): Observable<{ vms: VM[] }> {
    return this.http.get<{ vms: VM[] }>(`${this.apiUrl}/vms/node/${nodeId}`);
  }

  getVMStatus(nodeId: number, vmid: number): Observable<VMStatus> {
    return this.http.get<VMStatus>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/status`);
  }

  startVM(nodeId: number, vmid: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/start`, {});
  }

  stopVM(nodeId: number, vmid: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/stop`, {});
  }

  restartVM(nodeId: number, vmid: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/restart`, {});
  }

  // VM creation
  createVM(nodeId: number, vmData: VMCreateData): Promise<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/create`, vmData).toPromise();
  }

  listTemplates(nodeId: number): Promise<any[]> {
    return this.http.get<{ templates: any[] }>(`${this.apiUrl}/vms/node/${nodeId}/templates`)
      .toPromise()
      .then(response => response?.templates || []);
  }

  listIsos(nodeId: number): Promise<string[]> {
    return this.http.get<{ isos: string[] }>(`${this.apiUrl}/vms/node/${nodeId}/isos`)
      .toPromise()
      .then(response => response?.isos || []);
  }

  listStorages(nodeId: number): Promise<any[]> {
    return this.http.get<{ storages: any[] }>(`${this.apiUrl}/vms/node/${nodeId}/storages`)
      .toPromise()
      .then(response => response?.storages || []);
  }

  // VM deletion
  deleteVM(nodeId: number, vmid: number): Promise<any> {
    return this.http.delete(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}`).toPromise();
  }

  // VM cloning
  cloneVM(nodeId: number, vmid: number, newid: number, name?: string): Promise<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/clone`, null, {
      params: { newid: newid.toString(), ...(name && { name }) }
    }).toPromise();
  }

  // Snapshot management
  listSnapshots(nodeId: number, vmid: number): Promise<any[]> {
    return this.http.get<{ snapshots: any[] }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/snapshots`)
      .toPromise()
      .then(response => response?.snapshots || []);
  }

  createSnapshot(nodeId: number, vmid: number, snapname: string, description?: string): Promise<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/snapshot`, null, {
      params: { snapname, ...(description && { description }) }
    }).toPromise();
  }

  deleteSnapshot(nodeId: number, vmid: number, snapname: string): Promise<any> {
    return this.http.delete(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/snapshot/${snapname}`).toPromise();
  }

  rollbackSnapshot(nodeId: number, vmid: number, snapname: string): Promise<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/snapshot/${snapname}/rollback`, {}).toPromise();
  }

  // VM configuration
  updateVMConfig(nodeId: number, vmid: number, config: any): Promise<any> {
    return this.http.put(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/config`, config).toPromise();
  }

  getVMConfig(nodeId: number, vmid: number): Promise<any> {
    return this.http.get(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/config`).toPromise();
  }

  convertToTemplate(nodeId: number, vmid: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/template`, {});
  }

  // Additional VM operations
  pauseVM(nodeId: number, vmid: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/pause`, {});
  }

  resumeVM(nodeId: number, vmid: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/resume`, {});
  }

  shutdownVM(nodeId: number, vmid: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/shutdown`, {});
  }

  resetVM(nodeId: number, vmid: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/reset`, {});
  }

  unmountISO(nodeId: number, vmid: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/unmount-iso`, {});
  }

  mountISO(nodeId: number, vmid: number, iso: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/mount-iso`, { iso });
  }

  reinstallOS(nodeId: number, vmid: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/reinstall-os`, {});
  }

  listDisks(nodeId: number, vmid: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/disks`);
  }

  addDisk(nodeId: number, vmid: number, diskConfig: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/disk`, diskConfig);
  }

  resizeDisk(nodeId: number, vmid: number, disk: string, size: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/disks/${disk}/resize`, { size_increment: size });
  }

  deleteDisk(nodeId: number, vmid: number, disk: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/disk/${disk}`);
  }

  listNetworkInterfaces(nodeId: number, vmid: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/network`);
  }

  addNetworkInterface(nodeId: number, vmid: number, interfaceConfig: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/network`, interfaceConfig);
  }

  updateNetworkInterface(nodeId: number, vmid: number, interfaceName: string, interfaceConfig: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/network/${interfaceName}`, interfaceConfig);
  }

  deleteNetworkInterface(nodeId: number, vmid: number, interfaceName: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/network/${interfaceName}`);
  }

  listNetworkBridges(nodeId: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/vms/node/${nodeId}/network-bridges`);
  }

  getBootOrder(nodeId: number, vmid: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/boot-order`);
  }

  setBootOrder(nodeId: number, vmid: number, bootOrder: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/boot-order`, { boot_order: bootOrder });
  }

  getVNCConnection(nodeId: number, vmid: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/vnc`);
  }

  getVMStats(nodeId: number, vmid: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/stats`);
  }

  // Template operations
  getTemplates(nodeId: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/vms/node/${nodeId}/templates`);
  }

  deleteTemplate(nodeId: number, vmid: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/vms/node/${nodeId}/templates/${vmid}`);
  }

  getTaskStatus(nodeId: number, taskId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/vms/node/${nodeId}/tasks/${taskId}`);
  }

  // Lock/Unlock operations
  lockVM(nodeId: number, vmid: number, reason: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/lock`, { reason });
  }

  unlockVM(nodeId: number, vmid: number, force: boolean = false): Observable<any> {
    return this.http.post(`${this.apiUrl}/vms/node/${nodeId}/vm/${vmid}/unlock`, { force });
  }
}
