import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <div class="empty-state">
      <mat-icon class="empty-icon">{{ icon }}</mat-icon>
      <h3 class="empty-title">{{ title }}</h3>
      <p class="empty-message">{{ message }}</p>
      @if (actionLabel && actionRoute) {
        <button 
          mat-raised-button 
          color="primary" 
          [routerLink]="actionRoute"
          class="empty-action"
        >
          <mat-icon>{{ actionIcon }}</mat-icon>
          {{ actionLabel }}
        </button>
      }
      @if (actionButton) {
        <button 
          mat-raised-button 
          color="primary" 
          (click)="onActionClick()"
          class="empty-action"
        >
          <mat-icon>{{ actionIcon }}</mat-icon>
          {{ actionButton }}
        </button>
      }
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px 24px;
      text-align: center;
      min-height: 400px;

      .empty-icon {
        font-size: 96px;
        width: 96px;
        height: 96px;
        color: #bdbdbd;
        margin-bottom: 24px;
      }

      .empty-title {
        font-size: 24px;
        font-weight: 500;
        color: #424242;
        margin: 0 0 12px 0;
      }

      .empty-message {
        font-size: 16px;
        color: #757575;
        max-width: 500px;
        margin: 0 0 32px 0;
        line-height: 1.6;
      }

      .empty-action {
        mat-icon {
          margin-right: 8px;
        }
      }
    }

    :host-context(.dark-theme) .empty-state {
      .empty-icon {
        color: #616161;
      }

      .empty-title {
        color: #e0e0e0;
      }

      .empty-message {
        color: #9e9e9e;
      }
    }
  `]
})
export class EmptyStateComponent {
  @Input() icon: string = 'inbox';
  @Input() title: string = 'No Data';
  @Input() message: string = 'There is no data to display.';
  @Input() actionLabel?: string;
  @Input() actionButton?: string;
  @Input() actionIcon?: string = 'add';
  @Input() actionRoute?: string;
  @Output() action = new EventEmitter<void>();

  onActionClick(): void {
    this.action.emit();
  }
}
