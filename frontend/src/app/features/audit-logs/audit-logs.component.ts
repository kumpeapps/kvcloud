import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MaterialModule } from '../../shared/material.module';
import { AuditLogService, AuditLog, AuditLogStats, AuditLogFilters } from '../../core/services/audit-log.service';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './audit-logs.component.html',
  styleUrls: ['./audit-logs.component.scss']
})
export class AuditLogsComponent implements OnInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  
  logs: AuditLog[] = [];
  stats: AuditLogStats | null = null;
  loading = false;
  displayedColumns = ['timestamp', 'username', 'action', 'resource', 'status', 'ip_address', 'details'];
  
  // Pagination
  totalLogs = 0;
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [5, 10, 25, 50, 100];
  
  // Timezone
  userTimezone: string;
  
  filterForm: FormGroup;
  users: any[] = [];
  
  actionTypes = [
    'create', 'update', 'delete', 'start', 'stop', 'restart', 
    'snapshot', 'backup', 'restore', 'login', 'logout'
  ];
  
  resourceTypes = [
    'vm', 'snapshot', 'backup', 'cluster', 'user', 'role', 
    'ip_pool', 'iso', 'template'
  ];

  constructor(
    private auditService: AuditLogService,
    private userService: UserService,
    private fb: FormBuilder
  ) {
    // Get user's timezone from browser
    this.userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    this.filterForm = this.fb.group({
      user_id: [null],
      action: [''],
      resource_type: [''],
      status: [''],
      start_date: [''],
      end_date: ['']
    });
  }

  ngOnInit(): void {
    this.loadUsers();
    this.loadLogs();
    this.loadStats();
  }

  loadUsers(): void {
    this.userService.getUsers().subscribe({
      next: (users) => {
        this.users = users;
      },
      error: (error) => {
        console.error('Error loading users:', error);
      }
    });
  }

  loadLogs(): void {
    this.loading = true;
    const filters = this.getFilters();
    filters.limit = this.pageSize;
    filters.offset = this.pageIndex * this.pageSize;
    
    this.auditService.getLogs(filters).subscribe({
      next: (logs) => {
        this.logs = logs;
        // Since we're controlling pagination on frontend, set total to show we have more if at capacity
        this.totalLogs = logs.length >= this.pageSize ? (this.pageIndex + 1) * this.pageSize + 1 : (this.pageIndex * this.pageSize + logs.length);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading audit logs:', error);
        this.loading = false;
      }
    });
  }

  loadStats(): void {
    const filters = this.getFilters();
    
    this.auditService.getStats(filters).subscribe({
      next: (stats) => {
        this.stats = stats;
      },
      error: (error) => {
        console.error('Error loading stats:', error);
      }
    });
  }

  getFilters(): AuditLogFilters {
    const formValue = this.filterForm.value;
    const filters: AuditLogFilters = {
      limit: 100,
      offset: 0
    };

    if (formValue.user_id) {
      filters.user_id = formValue.user_id;
    }
    if (formValue.action) {
      filters.action = formValue.action;
    }
    if (formValue.resource_type) {
      filters.resource_type = formValue.resource_type;
    }
    if (formValue.status) {
      filters.status = formValue.status;
    }
    if (formValue.start_date) {
      filters.start_date = new Date(formValue.start_date).toISOString();
    }
    if (formValue.end_date) {
      filters.end_date = new Date(formValue.end_date).toISOString();
    }

    return filters;
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadLogs();
  }

  applyFilters(): void {
    this.pageIndex = 0;
    if (this.paginator) {
      this.paginator.firstPage();
    }
    this.loadLogs();
    this.loadStats();
  }

  clearFilters(): void {
    this.filterForm.reset();
    this.pageIndex = 0;
    if (this.paginator) {
      this.paginator.firstPage();
    }
    this.loadLogs();
    this.loadStats();
  }

  getStatusColor(status: string): string {
    return status === 'success' ? 'primary' : 'warn';
  }

  getStatusIcon(status: string): string {
    return status === 'success' ? 'check_circle' : 'error';
  }

  formatDetails(details: any): string {
    if (!details) return '-';
    try {
      return JSON.stringify(details, null, 2);
    } catch {
      return String(details);
    }
  }

  getTopUsersList(): string[] {
    if (!this.stats || !this.stats.top_users) return [];
    return this.stats.top_users.map(u => `${u.username} (${u.action_count})`);
  }

  getActionTypesList(): string[] {
    if (!this.stats || !this.stats.actions_by_type) return [];
    return Object.entries(this.stats.actions_by_type)
      .map(([action, count]) => `${action}: ${count}`)
      .sort((a, b) => {
        const countA = parseInt(a.split(': ')[1]);
        const countB = parseInt(b.split(': ')[1]);
        return countB - countA;
      });
  }

  formatDateWithTimezone(dateString: string): string {
    try {
      // Handle both ISO format (UTC-aware) and naive datetime format (YYYY-MM-DD HH:MM:SS)
      let date: Date;
      
      // Check if it's ISO format with T (UTC-aware)
      if (dateString.includes('T')) {
        // ISO format - JavaScript will interpret as UTC
        date = new Date(dateString);
      } else if (dateString.includes(' ')) {
        // Naive datetime format (YYYY-MM-DD HH:MM:SS) - treat as local time in server's timezone
        // For now, we'll assume these are in UTC for consistency
        date = new Date(dateString.replace(' ', 'T') + 'Z');
      } else {
        // Fallback
        date = new Date(dateString);
      }
      
      // If date is invalid, return original string
      if (isNaN(date.getTime())) {
        return dateString;
      }
      
      // Format using user's local timezone
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: this.userTimezone
      });
    } catch (e) {
      return dateString;
    }
  }
}
