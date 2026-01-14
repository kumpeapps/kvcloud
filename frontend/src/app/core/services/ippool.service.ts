import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface IPPool {
  id: number;
  name: string;
  gateway: string;
  netmask: string;
  first_ip: string;
  last_ip: string;
  bridge: string;
  vlan_tag?: number;
  name_servers?: string;
  is_active: boolean;
  routing_prefix?: string;
  description?: string;
  total_ips: number;
  allocated_ips: number;
  available_ips: number;
  created_at: string;
}

export interface IPAddress {
  id: number;
  pool_id: number;
  ip_address: string;
  is_allocated: boolean;
  vm_id?: number;
  user_id?: number;
  hostname?: string;
  mac_address?: string;
  allocated_at?: string;
  notes?: string;
}

export interface IPPoolCreate {
  name: string;
  gateway: string;
  netmask: string;
  first_ip: string;
  last_ip: string;
  bridge?: string;
  vlan_tag?: number;
  name_servers?: string;
  routing_prefix?: string;
  description?: string;
}

export interface IPAllocateRequest {
  ip_address: string;
  vm_id: number;
  hostname?: string;
  mac_address?: string;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class IPPoolService {
  private apiUrl = `${environment.apiUrl}/ippools/`;
  private http = inject(HttpClient);

  listPools(): Observable<IPPool[]> {
    return this.http.get<IPPool[]>(this.apiUrl);
  }

  createPool(poolData: IPPoolCreate): Observable<IPPool> {
    return this.http.post<IPPool>(this.apiUrl, poolData);
  }

  listPoolIPs(poolId: number, allocatedOnly: boolean = false): Observable<IPAddress[]> {
    return this.http.get<IPAddress[]>(`${this.apiUrl}/${poolId}/ips`, {
      params: { allocated_only: allocatedOnly.toString() }
    });
  }

  allocateIP(poolId: number, data: IPAllocateRequest): Observable<IPAddress> {
    return this.http.post<IPAddress>(`${this.apiUrl}/${poolId}/allocate`, data);
  }

  deallocateIP(poolId: number, ipId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${poolId}/deallocate/${ipId}`, {});
  }

  deletePool(poolId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${poolId}`);
  }
}
