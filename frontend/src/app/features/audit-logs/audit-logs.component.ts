import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
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
  logs: AuditLog[] = [];
  stats: AuditLogStats | null = null;
  loading = false;
  displayedColumns = ['timestamp', 'username', 'action', 'resource', 'status', 'ip_address', 'details'];
  
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
    
    this.auditService.getLogs(filters).subscribe({
      next: (logs) => {
        this.logs = logs;
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

  applyFilters(): void {
    this.loadLogs();
    this.loadStats();
  }

  clearFilters(): void {
    this.filterForm.reset();
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
}
