import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-vms',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="vms">
      <h2>Virtual Machines</h2>
      <p>VM management interface coming soon...</p>
    </div>
  `,
  styles: [`
    .vms {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h2 {
      font-size: 2rem;
      margin-bottom: 20px;
    }
  `]
})
export class VmsComponent {}
