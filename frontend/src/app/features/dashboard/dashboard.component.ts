import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService, DashboardStats } from '../../core/services/dashboard.service';
import { MaterialModule } from '../../shared/material.module';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    RouterLink, 
    MaterialModule,
    LoadingSpinnerComponent,
    StatusBadgeComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  stats = signal<DashboardStats | null>(null);
  error = signal<string | null>(null);

  constructor(
    public authService: AuthService,
    private dashboardService: DashboardService
  ) {}

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    this.loading.set(true);
    this.error.set(null);
    
    this.dashboardService.getStats().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading dashboard stats:', err);
        this.error.set('Failed to load dashboard statistics');
        this.loading.set(false);
      }
    });
  }

  getStoragePercentage(): number {
    const s = this.stats();
    if (!s || s.resources.storage.total === 0) return 0;
    return (s.resources.storage.used / s.resources.storage.total) * 100;
  }

  getMemoryPercentage(): number {
    const s = this.stats();
    if (!s || !s.resources || !s.resources.memory || s.resources.memory.total === 0) return 0;
    return (s.resources.memory.used / s.resources.memory.total) * 100;
  }

  getCpuPercentage(): number {
    const s = this.stats();
    if (!s || !s.resources || !s.resources.cpu || s.resources.cpu.total === 0) return 0;
    return (s.resources.cpu.usage / s.resources.cpu.total) * 100;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  }
}
