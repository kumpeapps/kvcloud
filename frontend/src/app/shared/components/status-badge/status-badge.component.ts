import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';

export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'default';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './status-badge.component.html',
  styleUrls: ['./status-badge.component.scss']
})
export class StatusBadgeComponent {
  @Input() status: StatusType = 'default';
  @Input() label: string = '';
  @Input() icon?: string;

  get statusIcon(): string {
    if (this.icon) return this.icon;
    
    switch (this.status) {
      case 'success': return 'check_circle';
      case 'warning': return 'warning';
      case 'error': return 'error';
      case 'info': return 'info';
      default: return 'circle';
    }
  }
}
