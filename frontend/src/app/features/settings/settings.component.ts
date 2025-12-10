import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { AuthService } from '../../core/services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  profileForm: FormGroup;
  passwordForm: FormGroup;
  loading = signal(false);
  user = this.authService.currentUser;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {
    this.profileForm = this.fb.group({
      username: [{value: '', disabled: true}],
      email: [{value: '', disabled: true}],
      full_name: ['', Validators.required]
    });

    this.passwordForm = this.fb.group({
      current_password: ['', Validators.required],
      new_password: ['', [Validators.required, Validators.minLength(8)]],
      confirm_password: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit(): void {
    const currentUser = this.user();
    if (currentUser) {
      this.profileForm.patchValue({
        username: currentUser.username,
        email: currentUser.email,
        full_name: currentUser.full_name
      });
    }
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('new_password')?.value === g.get('confirm_password')?.value
      ? null : {'mismatch': true};
  }

  onUpdateProfile(): void {
    if (this.profileForm.valid) {
      this.loading.set(true);
      // TODO: Implement profile update API call
      setTimeout(() => {
        this.loading.set(false);
        this.snackBar.open('Profile updated successfully', 'Close', { duration: 3000 });
      }, 1000);
    }
  }

  onChangePassword(): void {
    if (this.passwordForm.valid) {
      this.loading.set(true);
      const { current_password, new_password } = this.passwordForm.value;
      
      this.authService.changePassword(current_password, new_password).subscribe({
        next: () => {
          this.loading.set(false);
          this.snackBar.open('Password changed successfully', 'Close', { duration: 3000 });
          this.passwordForm.reset();
        },
        error: (err) => {
          this.loading.set(false);
          const errorMessage = err?.error?.detail || 'Failed to change password';
          this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        }
      });
    }
  }
}
