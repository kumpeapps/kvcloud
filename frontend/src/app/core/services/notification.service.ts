import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval } from 'rxjs';
import { tap, startWith, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  resource_type?: string;
  resource_id?: string;
  action_url?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  expires_at?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  by_type: { [key: string]: number };
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/notifications`;
  
  // Signals for reactive state
  notifications = signal<Notification[]>([]);
  unreadCount = signal<number>(0);
  
  constructor() {
    // Auto-fetch notifications every 30 seconds
    this.startPolling();
  }
  
  startPolling(intervalMs: number = 30000): void {
    interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.listNotifications())
    ).subscribe({
      next: (notifications) => {
        this.notifications.set(notifications);
        this.unreadCount.set(notifications.filter(n => !n.is_read).length);
      },
      error: (error) => console.error('Error fetching notifications:', error)
    });
  }
  
  listNotifications(unreadOnly: boolean = false, limit: number = 50, offset: number = 0): Observable<Notification[]> {
    const params: any = { limit: limit.toString(), offset: offset.toString() };
    if (unreadOnly) {
      params.unread_only = 'true';
    }
    return this.http.get<Notification[]>(this.apiUrl, { params });
  }
  
  getStats(): Observable<NotificationStats> {
    return this.http.get<NotificationStats>(`${this.apiUrl}/stats`).pipe(
      tap((stats) => this.unreadCount.set(stats.unread))
    );
  }
  
  getNotification(id: number): Observable<Notification> {
    return this.http.get<Notification>(`${this.apiUrl}/${id}`);
  }
  
  markAsRead(id: number): Observable<Notification> {
    return this.http.post<Notification>(`${this.apiUrl}/${id}/read`, {}).pipe(
      tap(() => {
        // Update local state
        const notifications = this.notifications();
        const index = notifications.findIndex(n => n.id === id);
        if (index !== -1) {
          notifications[index].is_read = true;
          this.notifications.set([...notifications]);
          this.unreadCount.update(count => Math.max(0, count - 1));
        }
      })
    );
  }
  
  markAllAsRead(): Observable<any> {
    return this.http.post(`${this.apiUrl}/read-all`, {}).pipe(
      tap(() => {
        // Update local state
        const notifications = this.notifications();
        notifications.forEach(n => n.is_read = true);
        this.notifications.set([...notifications]);
        this.unreadCount.set(0);
      })
    );
  }
  
  deleteNotification(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        // Update local state
        const notifications = this.notifications();
        const filtered = notifications.filter(n => n.id !== id);
        this.notifications.set(filtered);
        this.unreadCount.set(filtered.filter(n => !n.is_read).length);
      })
    );
  }
  
  deleteAll(readOnly: boolean = false): Observable<any> {
    const params: Record<string, string> = readOnly ? { read_only: 'true' } : {};
    return this.http.delete(this.apiUrl, { params }).pipe(
      tap(() => {
        if (readOnly) {
          // Remove only read notifications
          const notifications = this.notifications().filter(n => !n.is_read);
          this.notifications.set(notifications);
        } else {
          // Remove all notifications
          this.notifications.set([]);
          this.unreadCount.set(0);
        }
      })
    );
  }
  
  getTypeIcon(type: string): string {
    switch (type) {
      case 'success': return 'check_circle';
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'info':
      default: return 'info';
    }
  }
  
  getTypeColor(type: string): string {
    switch (type) {
      case 'success': return 'primary';
      case 'error': return 'warn';
      case 'warning': return 'accent';
      case 'info':
      default: return '';
    }
  }
}
