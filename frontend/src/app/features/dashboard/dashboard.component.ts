import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dashboard">
      <div class="welcome">
        <h2>Welcome to KVCloud</h2>
        @if (authService.currentUser(); as user) {
          <p>Hello, {{ user.full_name || user.username }}!</p>
        }
      </div>
      
      <div class="cards">
        <div class="card" routerLink="/clusters">
          <div class="card-icon">🖥️</div>
          <h3>Clusters</h3>
          <p>Manage Proxmox clusters and nodes</p>
        </div>
        
        <div class="card" routerLink="/vms">
          <div class="card-icon">📦</div>
          <h3>Virtual Machines</h3>
          <p>Create and manage VMs</p>
        </div>
        
        <div class="card">
          <div class="card-icon">💾</div>
          <h3>Storage</h3>
          <p>Manage storage resources</p>
        </div>
        
        <div class="card">
          <div class="card-icon">🌐</div>
          <h3>Network</h3>
          <p>Configure networks and VLANs</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .welcome {
      margin-bottom: 40px;
    }
    
    .welcome h2 {
      font-size: 2rem;
      margin-bottom: 10px;
    }
    
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
    }
    
    .card {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      transition: all 0.3s;
      text-align: center;
    }
    
    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .card-icon {
      font-size: 3rem;
      margin-bottom: 15px;
    }
    
    .card h3 {
      margin-bottom: 10px;
      color: #667eea;
    }
    
    .card p {
      color: #666;
      font-size: 14px;
    }
  `]
})
export class DashboardComponent {
  constructor(public authService: AuthService) {}
}
