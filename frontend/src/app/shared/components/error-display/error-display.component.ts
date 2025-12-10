import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';

export interface ErrorDetails {
  title?: string;
  message: string;
  details?: string;
  statusCode?: number;
}

@Component({
  selector: 'app-error-display',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './error-display.component.html',
  styleUrls: ['./error-display.component.scss']
})
export class ErrorDisplayComponent {
  @Input() error: ErrorDetails | string | null = null;
  @Input() showRetry: boolean = false;
  @Output() retry = new EventEmitter<void>();

  get errorDetails(): ErrorDetails | null {
    if (!this.error) return null;
    
    if (typeof this.error === 'string') {
      return {
        message: this.error
      };
    }
    
    return this.error;
  }

  onRetry(): void {
    this.retry.emit();
  }
}
