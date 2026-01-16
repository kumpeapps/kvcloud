import { Component, OnInit, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { NotificationService, Notification } from '../../core/services/notification.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss']
})
export class NotificationsComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private destroy$ = new Subject<void>();
  
  notifications: Notification[] = [];
  filteredNotifications: Notification[] = [];
  displayedNotifications: Notification[] = [];
  loading = false;
  
  // Pagination
  totalNotifications = 0;
  pageSize = 20;
  pageIndex = 0;
  pageSizeOptions = [10, 20, 50, 100];
  
  // Statistics
  totalCount = 0;
  unreadCount = 0;
  
  // Filter form
  filterForm: FormGroup;
  
  notificationTypes = [
    { value: 'info', label: 'Info' },
    { value: 'success', label: 'Success' },
    { value: 'warning', label: 'Warning' },
    { value: 'error', label: 'Error' }
  ];
  
  resourceTypes = [
    { value: 'vm', label: 'Virtual Machine' },
    { value: 'backup', label: 'Backup' },
    { value: 'snapshot', label: 'Snapshot' },
    { value: 'task', label: 'Task' },
    { value: 'system', label: 'System' }
  ];

  constructor() {
    this.filterForm = this.fb.group({
      type: [''],
      resource_type: [''],
      is_read: [''],
      search: ['']
    });
  }

  ngOnInit(): void {
    this.loadNotifications();
    this.loadStats();
    
    // Subscribe to filter changes
    this.filterForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
      });
    
    // Watch for notification updates using effect
    setInterval(() => {
      const currentNotifications = this.notificationService.notifications();
      if (currentNotifications.length !== this.notifications.length) {
        this.notifications = currentNotifications;
        this.applyFilters();
      }
    }, 1000);
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadNotifications(): void {
    this.loading = true;
    this.notificationService.listNotifications().subscribe({
      next: (notifications) => {
        this.notifications = notifications;
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading notifications:', error);
        this.loading = false;
      }
    });
  }
  
  loadStats(): void {
    this.totalCount = this.notificationService.notifications().length;
    this.unreadCount = this.notificationService.unreadCount();
  }

  applyFilters(): void {
    const filters = this.filterForm.value;
    
    this.filteredNotifications = this.notifications.filter(notification => {
      // Type filter
      if (filters.type && notification.type !== filters.type) {
        return false;
      }
      
      // Resource type filter
      if (filters.resource_type && notification.resource_type !== filters.resource_type) {
        return false;
      }
      
      // Read status filter
      if (filters.is_read !== '') {
        const isRead = filters.is_read === 'true';
        if (notification.is_read !== isRead) {
          return false;
        }
      }
      
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesTitle = notification.title.toLowerCase().includes(searchLower);
        const matchesMessage = notification.message.toLowerCase().includes(searchLower);
        if (!matchesTitle && !matchesMessage) {
          return false;
        }
      }
      
      return true;
    });
    
    this.totalNotifications = this.filteredNotifications.length;
    this.updateDisplayedNotifications();
    this.loadStats();
  }

  updateDisplayedNotifications(): void {
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.displayedNotifications = this.filteredNotifications.slice(startIndex, endIndex);
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.updateDisplayedNotifications();
  }

  handleNotificationClick(notification: Notification): void {
    // Mark as read
    if (!notification.is_read) {
      this.notificationService.markAsRead(notification.id).subscribe();
    }
    
    // Navigate if action URL exists
    if (notification.action_url) {
      this.router.navigateByUrl(notification.action_url);
    }
  }

  markAsRead(notification: Notification, event: Event): void {
    event.stopPropagation();
    this.notificationService.markAsRead(notification.id).subscribe({
      next: () => {
        this.loadNotifications();
      }
    });
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead().subscribe({
      next: () => {
        this.loadNotifications();
      }
    });
  }

  deleteNotification(notification: Notification, event: Event): void {
    event.stopPropagation();
    this.notificationService.deleteNotification(notification.id).subscribe({
      next: () => {
        this.loadNotifications();
      }
    });
  }

  deleteAllRead(): void {
    const readNotifications = this.notifications.filter(n => n.is_read);
    if (readNotifications.length === 0) {
      return;
    }
    
    // Delete each read notification
    const deleteObservables = readNotifications.map(n => 
      this.notificationService.deleteNotification(n.id)
    );
    
    // Wait for all deletes to complete
    Promise.all(deleteObservables.map(obs => obs.toPromise()))
      .then(() => this.loadNotifications());
  }

  clearFilters(): void {
    this.filterForm.reset({
      type: '',
      resource_type: '',
      is_read: '',
      search: ''
    });
  }

  getTypeIcon(type: string): string {
    return this.notificationService.getTypeIcon(type);
  }

  getTypeColor(type: string): string {
    return this.notificationService.getTypeColor(type);
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  }
}
