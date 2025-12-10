import { ErrorHandler, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private snackBar: MatSnackBar) {}

  handleError(error: Error): void {
    console.error('Global error:', error);

    let message = 'An unexpected error occurred';

    if (error.message) {
      message = error.message;
    }

    // Show user-friendly error message
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['error-snackbar']
    });

    // In production, you would send this to an error tracking service
    // like Sentry, LogRocket, etc.
  }
}
