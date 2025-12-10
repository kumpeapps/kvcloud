import { Component, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MaterialModule } from '../../shared/material.module';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ErrorDisplayComponent } from '../../shared/components/error-display/error-display.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { ConfirmationService } from '../../shared/services/confirmation.service';
import { UsersService } from './services/users.service';
import { User } from './models/user.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { UserFormDialogComponent } from './user-form-dialog/user-form-dialog.component';
import { QuotaFormDialogComponent } from './quota-form-dialog.component';
import { QuotaService } from '../../core/services/quota.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MaterialModule,
    LoadingSpinnerComponent,
    ErrorDisplayComponent,
    StatusBadgeComponent
  ],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  displayedColumns: string[] = ['username', 'email', 'full_name', 'is_active', 'is_superuser', 'created_at', 'actions'];
  dataSource = new MatTableDataSource<User>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private usersService: UsersService,
    private quotaService: QuotaService,
    private confirmationService: ConfirmationService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);
    
    this.usersService.getUsers().subscribe({
      next: (users) => {
        this.dataSource.data = users;
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.detail || 'Failed to load users');
        this.loading.set(false);
      }
    });
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(UserFormDialogComponent, {
      width: '600px',
      data: null
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadUsers();
      }
    });
  }

  openEditDialog(user: User): void {
    const dialogRef = this.dialog.open(UserFormDialogComponent, {
      width: '600px',
      data: user
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadUsers();
      }
    });
  }

  toggleUserStatus(user: User): void {
    const newStatus = !user.is_active;
    const action = newStatus ? 'activate' : 'deactivate';
    
    this.confirmationService.confirmAction(
      `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      `Are you sure you want to ${action} user "${user.username}"?`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.usersService.toggleUserStatus(user.id, newStatus).subscribe({
          next: () => {
            this.snackBar.open(`User ${action}d successfully`, 'Close', { duration: 3000 });
            this.loadUsers();
          },
          error: (err) => {
            this.snackBar.open(err.error?.detail || `Failed to ${action} user`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  deleteUser(user: User): void {
    this.confirmationService.confirmDelete(user.username).subscribe(confirmed => {
      if (confirmed) {
        this.usersService.deleteUser(user.id).subscribe({
          next: () => {
            this.snackBar.open('User deleted successfully', 'Close', { duration: 3000 });
            this.loadUsers();
          },
          error: (err) => {
            this.snackBar.open(err.error?.detail || 'Failed to delete user', 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  getUserStatusType(isActive: boolean): 'success' | 'default' {
    return isActive ? 'success' : 'default';
  }

  getUserStatusLabel(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  manageQuota(user: User): void {
    // First, try to load existing quota
    this.quotaService.getUserQuota(user.id).subscribe({
      next: (quota) => {
        // Quota exists, open edit dialog
        this.openQuotaDialog(user, quota);
      },
      error: () => {
        // No quota exists, open create dialog
        this.openQuotaDialog(user, undefined);
      }
    });
  }

  private openQuotaDialog(user: User, quota?: any): void {
    const dialogRef = this.dialog.open(QuotaFormDialogComponent, {
      width: '800px',
      data: { userId: user.id, quota }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Quota settings saved', 'Close', { duration: 3000 });
      }
    });
  }
}
