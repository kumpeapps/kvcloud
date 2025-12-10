import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../shared/material.module';
import { RolesService } from '../services/roles.service';
import { Role, CreateRoleRequest, UpdateRoleRequest, AVAILABLE_PERMISSIONS, Permission } from '../models/role.model';

@Component({
  selector: 'app-role-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './role-form-dialog.component.html',
  styleUrls: ['./role-form-dialog.component.scss']
})
export class RoleFormDialogComponent {
  roleForm: FormGroup;
  loading = signal(false);
  error = signal<string | null>(null);
  isEditMode: boolean;
  availablePermissions = AVAILABLE_PERMISSIONS;
  selectedPermissions = signal<Set<string>>(new Set());

  constructor(
    private fb: FormBuilder,
    private rolesService: RolesService,
    public dialogRef: MatDialogRef<RoleFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Role | null
  ) {
    this.isEditMode = !!data;
    this.roleForm = this.createForm();
    
    if (data?.permissions) {
      this.selectedPermissions.set(new Set(data.permissions));
    }
  }

  createForm(): FormGroup {
    return this.fb.group({
      name: [
        this.data?.name || '',
        [Validators.required, Validators.minLength(3), Validators.maxLength(50)]
      ],
      description: [this.data?.description || '']
    });
  }

  isPermissionSelected(permission: Permission): boolean {
    const key = `${permission.resource}:${permission.action}`;
    return this.selectedPermissions().has(key);
  }

  togglePermission(permission: Permission): void {
    const key = `${permission.resource}:${permission.action}`;
    const permissions = new Set(this.selectedPermissions());
    
    if (permissions.has(key)) {
      permissions.delete(key);
    } else {
      permissions.add(key);
    }
    
    this.selectedPermissions.set(permissions);
  }

  getPermissionsByResource(): Map<string, Permission[]> {
    const grouped = new Map<string, Permission[]>();
    
    this.availablePermissions.forEach(permission => {
      if (!grouped.has(permission.resource)) {
        grouped.set(permission.resource, []);
      }
      grouped.get(permission.resource)!.push(permission);
    });
    
    return grouped;
  }

  onSubmit(): void {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const formValue = this.roleForm.value;
    const permissions = Array.from(this.selectedPermissions());

    if (this.isEditMode && this.data) {
      const updateData: UpdateRoleRequest = {
        name: formValue.name,
        description: formValue.description,
        permissions
      };

      this.rolesService.updateRole(this.data.id, updateData).subscribe({
        next: () => {
          this.loading.set(false);
          this.dialogRef.close(true);
        },
        error: (err: any) => {
          this.error.set(err.error?.detail || 'Failed to update role');
          this.loading.set(false);
        }
      });
    } else {
      const createData: CreateRoleRequest = {
        name: formValue.name,
        description: formValue.description,
        permissions
      };

      this.rolesService.createRole(createData).subscribe({
        next: () => {
          this.loading.set(false);
          this.dialogRef.close(true);
        },
        error: (err: any) => {
          this.error.set(err.error?.detail || 'Failed to create role');
          this.loading.set(false);
        }
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
