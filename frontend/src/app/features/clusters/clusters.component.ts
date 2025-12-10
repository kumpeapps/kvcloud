import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-clusters',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="clusters">
      <h2>Proxmox Clusters</h2>
      <p>Cluster management interface coming soon...</p>
    </div>
  `,
  styles: [`
    .clusters {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h2 {
      font-size: 2rem;
      margin-bottom: 20px;
    }
  `]
})
export class ClustersComponent {}
