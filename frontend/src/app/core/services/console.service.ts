import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface VNCConnection {
  ticket: string;
  port: number;
  upid?: string;
  cert?: string;
  node: string;
  host: string;
  vmid: number;
  websocket_url: string;
}

export interface SPICEConfig {
  type: string;
  host: string;
  proxy: string;
  tls_port: number;
  password: string;
  ca?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConsoleService {
  private apiUrl = `${environment.apiUrl}/console`;

  constructor(private http: HttpClient) {}

  getVNCConnection(nodeId: number, vmid: number): Observable<VNCConnection> {
    return this.http.get<VNCConnection>(`${this.apiUrl}/vnc/nodes/${nodeId}/vms/${vmid}`);
  }

  getSPICEConfig(nodeId: number, vmid: number): Observable<SPICEConfig> {
    return this.http.get<SPICEConfig>(`${this.apiUrl}/spice/nodes/${nodeId}/vms/${vmid}`);
  }
}
