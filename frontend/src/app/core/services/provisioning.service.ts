import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ProvisioningVariable {
  name: string;
  example: string;
  description: string;
}

export interface ProvisioningVariables {
  user_variables: ProvisioningVariable[];
  vm_variables: ProvisioningVariable[];
  usage: string;
}

export interface CronJob {
  schedule: string;
  command: string;
  description?: string;
}

export interface WriteFile {
  path: string;
  content: string;
  permissions: string;
  owner: string;
}

export interface ProvisioningProfile {
  id?: number;
  name: string;
  description?: string;
  
  // Basic user configuration
  default_user?: string;
  default_password?: string;
  disable_root: boolean;
  
  // Package management
  apt_update: boolean;
  apt_upgrade: boolean;
  apt_reboot_if_required: boolean;
  packages?: string[];
  package_update_frequency?: string;
  
  // Scripts and commands
  bootcmd?: string[];
  runcmd?: string[];
  
  // Cron jobs
  cron_jobs?: CronJob[];
  
  // File creation
  write_files?: WriteFile[];
  
  // Docker configuration
  install_docker: boolean;
  docker_compose_content?: string;
  docker_compose_path: string;
  start_docker_compose: boolean;
  
  // Network configuration
  network_config_template?: string;
  hostname_template?: string;
  
  // SSH configuration
  ssh_authorized_keys?: string[];
  ssh_pwauth: boolean;
  
  // Timezone and locale
  timezone?: string;
  locale?: string;
  
  // Custom cloud-config
  custom_cloud_config?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProvisioningService {
  private apiUrl = `${environment.apiUrl}/cloud-init`;
  private http = inject(HttpClient);

  getVariables(): Observable<ProvisioningVariables> {
    return this.http.get<ProvisioningVariables>(`${this.apiUrl}/variables`);
  }

  createProfile(profile: ProvisioningProfile): Observable<any> {
    return this.http.post(`${this.apiUrl}/profiles`, profile);
  }

  listProfiles(): Observable<{ profiles: ProvisioningProfile[] }> {
    return this.http.get<{ profiles: ProvisioningProfile[] }>(`${this.apiUrl}/profiles`);
  }

  getProfile(id: number): Observable<ProvisioningProfile> {
    return this.http.get<ProvisioningProfile>(`${this.apiUrl}/profiles/${id}`);
  }

  updateProfile(id: number, profile: ProvisioningProfile): Observable<any> {
    return this.http.put(`${this.apiUrl}/profiles/${id}`, profile);
  }

  deleteProfile(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/profiles/${id}`);
  }

  previewProfile(profile: ProvisioningProfile): Observable<{ yaml: string, variables: any }> {
    return this.http.post<{ yaml: string, variables: any }>(`${this.apiUrl}/preview`, profile);
  }

  applyProfileToVM(profileId: number, vmid: number, nodeId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/apply-profile`, {
      profile_id: profileId,
      vmid: vmid,
      node_id: nodeId
    });
  }

  // Legacy method for backward compatibility
  apply(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/apply`, payload);
  }
}
