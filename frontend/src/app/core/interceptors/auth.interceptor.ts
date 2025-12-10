import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Allow specific requests to bypass auth header attachment
  if (req.headers.has('x-skip-auth')) {
    return next(req);
  }

  const token = localStorage.getItem('access_token');
  const router = inject(Router);
  
  if (token) {
    const clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    
    return next(clonedRequest).pipe(
      tap({
        error: (error) => {
          if (error.status === 401) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            router.navigate(['/auth/login']);
          }
        }
      })
    );
  }
  
  return next(req);
};
