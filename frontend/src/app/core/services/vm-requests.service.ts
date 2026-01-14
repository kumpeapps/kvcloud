import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class VmRequestsService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);

  createRequest(payload: { plan_id: number; node_id?: number; cloud_init_profile_id?: number; recipe_id?: number }): Observable<any> {
    return this.http.post(`${this.apiUrl}/vm-requests`, payload);
  }

  listMyRequests(): Observable<{ requests: any[] }> {
    return this.http.get<{ requests: any[] }>(`${this.apiUrl}/vm-requests`);
  }

  listAll(): Observable<{ requests: any[] }> {
    return this.http.get<{ requests: any[] }>(`${this.apiUrl}/vm-requests/all`);
  }

  approve(requestId: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/vm-requests/${requestId}/approve`, {});
  }

  fulfill(requestId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/vm-requests/${requestId}/fulfill`, {});
  }
}