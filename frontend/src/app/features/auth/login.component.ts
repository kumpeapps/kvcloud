import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { catchError, finalize, timeout, throwError } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <h2>Login to KVCloud</h2>
        <form (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label for="username">Username</label>
            <input 
              type="text" 
              id="username" 
              [(ngModel)]="username" 
              name="username"
              required
            >
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              [(ngModel)]="password" 
              name="password"
              required
            >
          </div>
          @if (errorMessage) {
            <div class="error-message">{{ errorMessage }}</div>
          }
          <button type="submit" [disabled]="isLoading">
            {{ isLoading ? 'Logging in...' : 'Login' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: calc(100vh - 200px);
    }
    
    .login-card {
      background: rgba(255, 255, 255, 0.05);
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      width: 100%;
      max-width: 420px;
      backdrop-filter: blur(6px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #fff;
    }
    
    h2 {
      margin-bottom: 24px;
      text-align: center;
      opacity: 0.87;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      opacity: 0.8;
    }
    
    input {
      width: 100%;
      padding: 10px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      font-size: 14px;
      background: rgba(0, 0, 0, 0.25);
      color: #fff;
    }
    
    input::placeholder {
      color: rgba(255, 255, 255, 0.5);
    }
    
    input:focus {
      outline: none;
      border-color: #90caf9;
      box-shadow: 0 0 0 2px rgba(144, 202, 249, 0.25);
    }
    
    button {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #4a90e2 0%, #8e44ad 100%);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      transition: opacity 0.3s, transform 0.1s;
    }
    
    button:hover:not(:disabled) {
      opacity: 0.92;
      transform: translateY(-1px);
    }
    
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .error-message {
      color: #ffb3b3;
      margin-bottom: 16px;
      padding: 10px;
      background: rgba(255, 82, 82, 0.12);
      border: 1px solid rgba(255, 82, 82, 0.35);
      border-radius: 6px;
      font-size: 14px;
    }
  `]
})
export class LoginComponent {
  username = '';
  password = '';
  isLoading = false;
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  onSubmit(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login({ username: this.username, password: this.password })
      .pipe(
        timeout(10000),
        catchError(err => {
          // Network / CORS / timeout errors surface here; keep a friendly message
          const detail = err?.error?.detail || err?.message || 'Login failed';
          this.errorMessage = detail.includes('Network') ? 'Network error: API unreachable or blocked.' : detail;
          return throwError(() => err);
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/dashboard']);
        },
        error: () => {
          if (!this.errorMessage) {
            this.errorMessage = 'Invalid username or password';
          }
        }
      });
  }
}
