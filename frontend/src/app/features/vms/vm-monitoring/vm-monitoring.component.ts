import { Component, Input, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';
import { VMService } from '../../../core/services/vm.service';

@Component({
  selector: 'app-vm-monitoring',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    NgChartsModule
  ],
  templateUrl: './vm-monitoring.component.html',
  styleUrls: ['./vm-monitoring.component.scss']
})
export class VmMonitoringComponent implements OnInit, OnDestroy {
  @Input() nodeId!: number;
  @Input() vmid!: number;

  loading = signal(false);
  error = signal<string | null>(null);
  currentStats = signal<any>(null);
  
  private refreshInterval: any;
  private maxDataPoints = 20;

  // CPU Chart
  cpuChartData: ChartConfiguration['data'] = {
    datasets: [{
      data: [],
      label: 'CPU Usage %',
      borderColor: '#3f51b5',
      backgroundColor: 'rgba(63, 81, 181, 0.1)',
      fill: true,
      tension: 0.4
    }],
    labels: []
  };

  cpuChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (value) => value + '%'
        }
      },
      x: {
        display: true
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top'
      }
    }
  };

  cpuChartType: ChartType = 'line';

  // Memory Chart
  memoryChartData: ChartConfiguration['data'] = {
    datasets: [{
      data: [],
      label: 'Memory Usage %',
      borderColor: '#ff9800',
      backgroundColor: 'rgba(255, 152, 0, 0.1)',
      fill: true,
      tension: 0.4
    }],
    labels: []
  };

  memoryChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (value) => value + '%'
        }
      },
      x: {
        display: true
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top'
      }
    }
  };

  memoryChartType: ChartType = 'line';

  // Disk Chart
  diskChartData: ChartConfiguration['data'] = {
    datasets: [{
      data: [],
      label: 'Disk Usage %',
      borderColor: '#4caf50',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      fill: true,
      tension: 0.4
    }],
    labels: []
  };

  diskChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (value) => value + '%'
        }
      },
      x: {
        display: true
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top'
      }
    }
  };

  diskChartType: ChartType = 'line';

  constructor(private vmService: VMService) {}

  ngOnInit(): void {
    this.startMonitoring();
  }

  ngOnDestroy(): void {
    this.stopMonitoring();
  }

  startMonitoring(): void {
    // Initial load
    this.updateCharts();

    // Refresh every 5 seconds
    this.refreshInterval = setInterval(() => {
      this.updateCharts();
    }, 5000);
  }

  stopMonitoring(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async updateCharts(): Promise<void> {
    try {
      const stats = await this.vmService.getVMStats(this.nodeId, this.vmid).toPromise();
      
      if (stats) {
        const timestamp = new Date().toLocaleTimeString();
        
        // Update current stats for display
        this.currentStats.set(stats);
        
        // Update CPU chart
        this.addDataPoint(this.cpuChartData, timestamp, stats.cpu || 0);

        // Update Memory chart
        this.addDataPoint(this.memoryChartData, timestamp, stats.memory_percent || 0);
        
        // Update Disk chart
        this.addDataPoint(this.diskChartData, timestamp, stats.disk_percent || 0);
      }
    } catch (err: any) {
      console.error('Error updating charts:', err);
      this.error.set('Failed to fetch monitoring data');
    }
  }

  private addDataPoint(chartData: ChartConfiguration['data'], label: string, value: number): void {
    if (!chartData.labels || !chartData.datasets[0].data) return;

    chartData.labels.push(label);
    (chartData.datasets[0].data as number[]).push(value);

    // Keep only last N data points
    if (chartData.labels.length > this.maxDataPoints) {
      chartData.labels.shift();
      (chartData.datasets[0].data as number[]).shift();
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}
