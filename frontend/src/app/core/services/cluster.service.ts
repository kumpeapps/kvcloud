import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Cluster {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
}

export interface ClusterNode {
  id: number;
  cluster_id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  verify_ssl: boolean;
  is_active: boolean;
}

export interface ClusterCreate {
  name: string;
  description?: string;
}

export interface NodeCreate {
  cluster_id: number;
  name: string;
  host: string;
  port?: number;
  username: string;
  password: string;
  verify_ssl?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ClusterService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);

  // Cluster operations
  getClusters(): Observable<Cluster[]> {
    return this.http.get<Cluster[]>(`${this.apiUrl}/clusters/`);
  }

  getCluster(id: number): Observable<Cluster> {
    return this.http.get<Cluster>(`${this.apiUrl}/clusters/${id}`);
  }

  createCluster(cluster: ClusterCreate): Observable<Cluster> {
    return this.http.post<Cluster>(`${this.apiUrl}/clusters/`, cluster);
  }

  updateCluster(id: number, cluster: ClusterCreate): Observable<Cluster> {
    return this.http.put<Cluster>(`${this.apiUrl}/clusters/${id}`, cluster);
  }

  deleteCluster(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/clusters/${id}`);
  }

  // Node operations
  getClusterNodes(clusterId: number): Observable<ClusterNode[]> {
    return this.http.get<ClusterNode[]>(`${this.apiUrl}/clusters/${clusterId}/nodes`);
  }

  listNodes(): Promise<ClusterNode[]> {
    return this.http.get<ClusterNode[]>(`${this.apiUrl}/clusters/nodes`)
      .toPromise()
      .then(response => response || []);
  }

  createNode(node: NodeCreate): Observable<ClusterNode> {
    return this.http.post<ClusterNode>(`${this.apiUrl}/clusters/nodes`, node);
  }

  updateNode(nodeId: number, node: NodeCreate): Observable<ClusterNode> {
    return this.http.put<ClusterNode>(`${this.apiUrl}/clusters/nodes/${nodeId}`, node);
  }

  deleteNode(nodeId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/clusters/nodes/${nodeId}`);
  }

  getNodeStatus(nodeId: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/clusters/nodes/${nodeId}/status`);
  }

  getNodes(): Observable<ClusterNode[]> {
    return this.http.get<ClusterNode[]>(`${this.apiUrl}/clusters/nodes`);
  }

  getNodeStorage(nodeId: number): Observable<any[]> {
    // Storage listing is served under the ISO routes
    return this.http.get<any[]>(`${this.apiUrl}/isos/nodes/${nodeId}/storages`);
  }
}
