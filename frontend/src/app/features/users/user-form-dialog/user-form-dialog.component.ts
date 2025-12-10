import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UntypedFormBuilder, UntypedFormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../shared/material.module';
import { UsersService } from '../services/users.service';
import { User, CreateUserRequest, UpdateUserRequest } from '../models/user.model';

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './user-form-dialog.component.html',
  styleUrls: ['./user-form-dialog.component.scss']
})
export class UserFormDialogComponent {
  userForm: UntypedFormGroup;
  loading = signal(false);
  error = signal<string | null>(null);
  isEditMode: boolean;
  hidePassword = signal(true);

  constructor(
    private fb: UntypedFormBuilder,
    private usersService: UsersService,
    public dialogRef: MatDialogRef<UserFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: User | null
  ) {
    this.isEditMode = !!data;
    this.userForm = this.createForm();
  }

  createForm(): UntypedFormGroup {
    const form = this.fb.group({
      username: [
        { value: this.data?.username || '', disabled: this.isEditMode },
        [Validators.required, Validators.minLength(3), Validators.maxLength(50)]
      ],
      email: [
        this.data?.email || '',
        [Validators.required, Validators.email]
      ],
      full_name: [this.data?.full_name || ''],
      is_active: [this.data?.is_active ?? true],
      is_superuser: [this.data?.is_superuser ?? false]
    });

    if (!this.isEditMode) {
      form.addControl('password', this.fb.control('', [Validators.required, Validators.minLength(8)]));
      form.addControl('confirmPassword', this.fb.control('', [Validators.required]));
    } else {
      form.addControl('password', this.fb.control('', [Validators.minLength(8)]));
    }

    return form;
  }

  get passwordsMatch(): boolean {
    if (this.isEditMode) return true;
    const password = this.userForm.get('password')?.value;
    const confirmPassword = this.userForm.get('confirmPassword')?.value;
    return !password || !confirmPassword || password === confirmPassword;
  }

  onSubmit(): void {
    if (this.userForm.invalid || !this.passwordsMatch) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const formValue = this.userForm.value;

    if (this.isEditMode && this.data) {
      const updateData: UpdateUserRequest = {
        email: formValue.email,
        full_name: formValue.full_name,
        is_active: formValue.is_active,
        is_superuser: formValue.is_superuser
      };

      if (formValue.password) {
        updateData.password = formValue.password;
      }

      this.usersService.updateUser(this.data.id, updateData).subscribe({
        next: () => {
          this.loading.set(false);
          this.dialogRef.close(true);
        },
        error: (err) => {
          this.error.set(err.error?.detail || 'Failed to update user');
          this.loading.set(false);
        }
      });
    } else {
      const createData: CreateUserRequest = {
        username: formValue.username,
        email: formValue.email,
        password: formValue.password,
        full_name: formValue.full_name,
        is_active: formValue.is_active,
        is_superuser: formValue.is_superuser
      };

      this.usersService.createUser(createData).subscribe({
        next: () => {
          this.loading.set(false);
          this.dialogRef.close(true);
        },
        error: (err) => {
          this.error.set(err.error?.detail || 'Failed to create user');
          this.loading.set(false);
        }
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
