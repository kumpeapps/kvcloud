import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check if authenticated or if we have a token
  if (authService.isAuthenticated() || authService.getToken()) {
    return true;
  }

  router.navigate(['/auth/login']);
  return false;
};
