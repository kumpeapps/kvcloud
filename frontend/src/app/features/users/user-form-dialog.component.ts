import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSnackBarModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'Create User' : 'Edit User' }}</h2>
    
    <mat-dialog-content>
      <form [formGroup]="userForm" class="user-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Username</mat-label>
          <input matInput formControlName="username" [readonly]="data.mode === 'edit'">
          <mat-error *ngIf="userForm.get('username')?.hasError('required')">
            Username is required
          </mat-error>
          <mat-error *ngIf="userForm.get('username')?.hasError('minlength')">
            Username must be at least 3 characters
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email">
          <mat-error *ngIf="userForm.get('email')?.hasError('required')">
            Email is required
          </mat-error>
          <mat-error *ngIf="userForm.get('email')?.hasError('email')">
            Invalid email address
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Full Name</mat-label>
          <input matInput formControlName="full_name">
          <mat-error *ngIf="userForm.get('full_name')?.hasError('required')">
            Full name is required
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width" *ngIf="data.mode === 'create'">
          <mat-label>Password</mat-label>
          <input matInput type="password" formControlName="password">
          <mat-error *ngIf="userForm.get('password')?.hasError('required')">
            Password is required
          </mat-error>
          <mat-error *ngIf="userForm.get('password')?.hasError('minlength')">
            Password must be at least 8 characters
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Role</mat-label>
          <mat-select formControlName="role">
            <mat-option value="admin">Admin</mat-option>
            <mat-option value="user">User</mat-option>
            <mat-option value="viewer">Viewer</mat-option>
          </mat-select>
          <mat-error *ngIf="userForm.get('role')?.hasError('required')">
            Role is required
          </mat-error>
        </mat-form-field>

        <div class="checkbox-row">
          <mat-checkbox formControlName="is_active">Active</mat-checkbox>
          <mat-checkbox formControlName="is_superuser" *ngIf="data.mode === 'create'">
            Superuser
          </mat-checkbox>
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button 
        mat-raised-button 
        color="primary" 
        (click)="onSubmit()"
        [disabled]="!userForm.valid || loading">
        {{ loading ? 'Saving...' : 'Save' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .user-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px 0;
      min-width: 400px;
    }

    .full-width {
      width: 100%;
    }

    .checkbox-row {
      display: flex;
      gap: 24px;
      align-items: center;
    }

    mat-dialog-content {
      max-height: 70vh;
      overflow-y: auto;
    }
  `]
})
export class UserFormDialogComponent implements OnInit {
  userForm: FormGroup;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<UserFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { mode: 'create' | 'edit'; user?: any }
  ) {
    this.userForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      full_name: ['', Validators.required],
      password: [''],
      role: ['user', Validators.required],
      is_active: [true],
      is_superuser: [false]
    });
  }

  ngOnInit(): void {
    if (this.data.mode === 'edit' && this.data.user) {
      this.userForm.patchValue({
        username: this.data.user.username,
        email: this.data.user.email,
        full_name: this.data.user.full_name,
        role: this.data.user.role,
        is_active: this.data.user.is_active,
        is_superuser: this.data.user.is_superuser
      });
      
      // Remove password requirement for edit mode
      this.userForm.get('password')?.clearValidators();
      this.userForm.get('password')?.updateValueAndValidity();
    } else {
      // Add password validation for create mode
      this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
      this.userForm.get('password')?.updateValueAndValidity();
    }
  }

  onSubmit(): void {
    if (this.userForm.invalid) {
      return;
    }

    this.loading = true;
    const formValue = this.userForm.value;

    if (this.data.mode === 'create') {
      this.userService.createUser(formValue).subscribe({
        next: () => {
          this.dialogRef.close(true);
        },
        error: (error) => {
          this.loading = false;
          this.snackBar.open(
            error.error?.detail || 'Failed to create user',
            'Close',
            { duration: 3000 }
          );
        }
      });
    } else {
      // Remove password if empty in edit mode
      const updateData = { ...formValue };
      if (!updateData.password) {
        delete updateData.password;
      }
      delete updateData.username; // Username cannot be changed

      this.userService.updateUser(this.data.user.id, updateData).subscribe({
        next: () => {
          this.dialogRef.close(true);
        },
        error: (error) => {
          this.loading = false;
          this.snackBar.open(
            error.error?.detail || 'Failed to update user',
            'Close',
            { duration: 3000 }
          );
        }
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
