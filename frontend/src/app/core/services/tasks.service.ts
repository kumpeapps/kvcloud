import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TaskStatus {
  id: string;
  status: string;
  progress: number;
  message?: string;
  image_name?: string;
  template_vmid?: number;
  node_name?: string;
  started_at?: string;
  completed_at?: string;
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private http = inject(HttpClient);

  listTasks(): Observable<TaskStatus[]> {
    const headers = new HttpHeaders({ 'x-skip-auth': 'true' });
    return this.http.get<TaskStatus[]>(`${environment.apiUrl}/tasks/`, { headers });
  }

  getTask(taskId: string): Observable<TaskStatus> {
    const headers = new HttpHeaders({ 'x-skip-auth': 'true' });
    return this.http.get<TaskStatus>(`${environment.apiUrl}/tasks/${taskId}`, { headers });
  }

  listHistory(): Observable<TaskStatus[]> {
    const headers = new HttpHeaders({ 'x-skip-auth': 'true' });
    return this.http.get<TaskStatus[]>(`${environment.apiUrl}/tasks/history`, { headers });
  }

  clearHistory(): Observable<{ cleared: number }> {
    const headers = new HttpHeaders({ 'x-skip-auth': 'true' });
    return this.http.post<{ cleared: number }>(`${environment.apiUrl}/tasks/clear`, {}, { headers });
  }
}
