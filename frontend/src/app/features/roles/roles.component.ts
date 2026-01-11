import { Component, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MaterialModule } from '../../shared/material.module';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ErrorDisplayComponent } from '../../shared/components/error-display/error-display.component';
import { ConfirmationService } from '../../shared/services/confirmation.service';
import { RolesService } from './services/roles.service';
import { Role } from './models/role.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { RoleFormDialogComponent } from './role-form-dialog/role-form-dialog.component';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MaterialModule,
    LoadingSpinnerComponent,
    ErrorDisplayComponent
  ],
  templateUrl: './roles.component.html',
  styleUrls: ['./roles.component.scss']
})
export class RolesComponent implements OnInit {
  displayedColumns: string[] = ['name', 'description', 'permissions', 'created_at', 'actions'];
  dataSource = new MatTableDataSource<Role>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private rolesService: RolesService,
    private confirmationService: ConfirmationService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadRoles();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  loadRoles(): void {
    this.loading.set(true);
    this.error.set(null);
    
    this.rolesService.getRoles().subscribe({
      next: (roles: Role[]) => {
        this.dataSource.data = roles;
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set(err.error?.detail || 'Failed to load roles');
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
    const dialogRef = this.dialog.open(RoleFormDialogComponent, {
      width: '700px',
      data: null
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this.loadRoles();
      }
    });
  }

  openEditDialog(role: Role): void {
    const dialogRef = this.dialog.open(RoleFormDialogComponent, {
      width: '700px',
      data: role
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this.loadRoles();
      }
    });
  }

  deleteRole(role: Role): void {
    this.confirmationService.confirmDelete(role.name).subscribe((confirmed: any) => {
      if (confirmed) {
        this.rolesService.deleteRole(role.name).subscribe({
          next: () => {
            this.snackBar.open('Role deleted successfully', 'Close', { duration: 3000 });
            this.loadRoles();
          },
          error: (err: any) => {
            this.snackBar.open(err.error?.detail || 'Failed to delete role', 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatPermissions(permissions: string[]): string {
    return permissions.length > 0 ? `${permissions.length} permissions` : 'No permissions';
  }
}
