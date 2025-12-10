import { Component, OnInit, OnDestroy, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MetricsService, NodeMetrics, VMMetrics, ClusterMetrics } from '../../core/services/metrics.service';
import { MetricHistoryService, MetricHistoryRecord, MetricAggregate } from '../../core/services/metric-history.service';
import { ClusterService, ClusterNode } from '../../core/services/cluster.service';
import { VMService, VM } from '../../core/services/vm.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ChartConfiguration } from 'chart.js';
import { NgChartsModule } from 'ng2-charts';

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    NgChartsModule
  ],
  templateUrl: './monitoring.component.html',
  styleUrls: ['./monitoring.component.scss']
})
export class MonitoringComponent implements OnInit, OnDestroy {
  // Data signals
  clusterMetrics = signal<ClusterMetrics | null>(null);
  nodeMetrics = signal<NodeMetrics | null>(null);
  vmMetrics = signal<VMMetrics | null>(null);
  historyRecords = signal<MetricHistoryRecord[]>([]);
  historyAggregate = signal<MetricAggregate | null>(null);
  
  nodes = signal<ClusterNode[]>([]);
  vms = signal<VM[]>([]);
  selectedNode = signal<ClusterNode | null>(null);
  selectedVM = signal<VM | null>(null);
  historyResource = signal<'node' | 'vm'>('node');
  historyTimeframe = signal('day');
  historyStart = signal<string | null>(null);
  historyEnd = signal<string | null>(null);
  
  // UI signals
  loading = signal(true);
  historyLoading = signal(false);
  selectedTab = signal(0);
  durationMinutes = signal(60);
  autoRefresh = signal(true);
  refreshInterval = signal<number | null>(null);
  
  // Chart configurations
  nodeChartConfig = signal<ChartConfiguration<'line', any>>({} as any);
  vmChartConfig = signal<ChartConfiguration<'line', any>>({} as any);
  historyUsageChartConfig = signal<ChartConfiguration<'line', any>>({} as any);
  historyIOChartConfig = signal<ChartConfiguration<'line', any>>({} as any);

  constructor(
    private metricsService: MetricsService,
    private metricHistoryService: MetricHistoryService,
    private clusterService: ClusterService,
    private vmService: VMService,
    private snackBar: MatSnackBar
  ) {
    // Setup auto-refresh effect
    effect(() => {
      if (this.autoRefresh()) {
        this.startAutoRefresh();
      } else {
        this.stopAutoRefresh();
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.loadClusterMetrics();
    this.loadNodes();
  }

  loadClusterMetrics(): void {
    this.metricsService.getClusterMetrics().subscribe({
      next: (metrics) => {
        this.clusterMetrics.set(metrics);
      },
      error: (error) => {
        console.error('Error loading cluster metrics:', error);
        this.snackBar.open('Failed to load cluster metrics', 'Close', { duration: 3000 });
      }
    });
  }

  loadNodes(): void {
    this.loading.set(true);
    this.clusterService.getClusters().subscribe({
      next: (clusters) => {
        if (clusters.length === 0) {
          this.loading.set(false);
          return;
        }

        const allNodes: ClusterNode[] = [];
        let processed = 0;

        clusters.forEach(cluster => {
          this.clusterService.getClusterNodes(cluster.id).subscribe({
            next: (nodes) => {
              allNodes.push(...nodes);
              processed++;

              if (processed === clusters.length) {
                this.nodes.set(allNodes);
                if (allNodes.length > 0) {
                  this.selectNode(allNodes[0]);
                }
                this.loading.set(false);
              }
            },
            error: (error) => {
              console.error('Error loading nodes:', error);
              processed++;
              if (processed === clusters.length) {
                this.nodes.set(allNodes);
                this.loading.set(false);
              }
            }
          });
        });
      },
      error: (error) => {
        console.error('Error loading clusters:', error);
        this.snackBar.open('Failed to load clusters', 'Close', { duration: 3000 });
        this.loading.set(false);
      }
    });
  }

  selectNode(node: ClusterNode): void {
    this.selectedNode.set(node);
    this.selectedVM.set(null);
    this.vmMetrics.set(null);
    this.loadNodeMetrics(node.id);
    this.loadNodeVMs(node.id);
  }

  selectVM(vm: VM): void {
    this.selectedVM.set(vm);
    this.loadVMMetrics();
  }

  loadNodeMetrics(nodeId: number): void {
    this.metricsService.getNodeMetrics(nodeId, this.durationMinutes()).subscribe({
      next: (metrics) => {
        console.log('[DEBUG] Node metrics received:', {
          cpu_sample: metrics.cpu.slice(0, 3),
          cpu_values: metrics.cpu.slice(0, 3).map(p => p.value)
        });
        this.nodeMetrics.set(metrics);
        this.updateNodeCharts(metrics);
      },
      error: (error) => {
        console.error('Error loading node metrics:', error);
        this.snackBar.open('Failed to load node metrics', 'Close', { duration: 3000 });
      }
    });
  }

  loadNodeVMs(nodeId: number): void {
    this.vmService.listVMs(nodeId).subscribe({
      next: (response) => {
        this.vms.set(response.vms);
        if (response.vms.length > 0) {
          this.selectVM(response.vms[0]);
        }
      },
      error: (error) => {
        console.error('Error loading VMs:', error);
      }
    });
  }

  loadVMMetrics(): void {
    const node = this.selectedNode();
    const vm = this.selectedVM();

    if (!node || !vm) {
      return;
    }

    this.metricsService.getVMMetrics(node.id, vm.vmid, this.durationMinutes()).subscribe({
      next: (metrics) => {
        this.vmMetrics.set(metrics);
        this.updateVMCharts(metrics);
      },
      error: (error) => {
        console.error('Error loading VM metrics:', error);
        this.snackBar.open('Failed to load VM metrics', 'Close', { duration: 3000 });
      }
    });
  }

  updateNodeCharts(metrics: NodeMetrics): void {
    const timestamps = metrics.cpu.map(p => new Date(p.timestamp * 1000).toLocaleTimeString());
    const cpuData = metrics.cpu.map(p => p.value);
    
    console.log('[DEBUG] Charting CPU data:', {
      sample_values: cpuData.slice(0, 5),
      min: Math.min(...cpuData),
      max: Math.max(...cpuData),
      avg: cpuData.reduce((a, b) => a + b, 0) / cpuData.length
    });
    
    this.nodeChartConfig.set({
      type: 'line',
      data: {
        labels: timestamps,
        datasets: [
          {
            label: 'CPU Usage (%)',
            data: cpuData,
            borderColor: '#ff6b6b',
            backgroundColor: 'rgba(255, 107, 107, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Memory Usage (%)',
            data: metrics.memory.map(p => p.value),
            borderColor: '#4ecdc4',
            backgroundColor: 'rgba(78, 205, 196, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Network In (Mbps)',
            data: metrics.network_in.map(p => p.value / 10),
            borderColor: '#45b7d1',
            backgroundColor: 'rgba(69, 183, 209, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y1'
          },
          {
            label: 'Network Out (Mbps)',
            data: metrics.network_out.map(p => p.value / 10),
            borderColor: '#96ceb4',
            backgroundColor: 'rgba(150, 206, 180, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              padding: 15
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Percentage (%)',
              color: '#666'
            },
            min: 0,
            max: 100
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Network (Mbps)',
              color: '#666'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  }

  updateVMCharts(metrics: VMMetrics): void {
    const timestamps = metrics.cpu.map(p => new Date(p.timestamp * 1000).toLocaleTimeString());
    
    this.vmChartConfig.set({
      type: 'line',
      data: {
        labels: timestamps,
        datasets: [
          {
            label: 'CPU Usage (%)',
            data: metrics.cpu.map(p => p.value),
            borderColor: '#ff6b6b',
            backgroundColor: 'rgba(255, 107, 107, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Memory Usage (%)',
            data: metrics.memory.map(p => p.value),
            borderColor: '#4ecdc4',
            backgroundColor: 'rgba(78, 205, 196, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Disk Read (IOPS)',
            data: metrics.disk_read.map(p => p.value),
            borderColor: '#45b7d1',
            backgroundColor: 'rgba(69, 183, 209, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y1'
          },
          {
            label: 'Disk Write (IOPS)',
            data: metrics.disk_write.map(p => p.value),
            borderColor: '#96ceb4',
            backgroundColor: 'rgba(150, 206, 180, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              padding: 15
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Percentage (%)',
              color: '#666'
            },
            min: 0,
            max: 100
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'IOPS',
              color: '#666'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  }

  onDurationChange(): void {
    const node = this.selectedNode();
    if (node) {
      this.loadNodeMetrics(node.id);
      this.loadVMMetrics();
    }
  }

  refreshMetrics(): void {
    this.loadClusterMetrics();
    const node = this.selectedNode();
    if (node) {
      this.loadNodeMetrics(node.id);
      this.loadVMMetrics();
    }
    this.snackBar.open('Metrics refreshed', 'Close', { duration: 2000 });
  }

  startAutoRefresh(): void {
    const interval = setInterval(() => {
      this.refreshMetrics();
    }, 30000); // Refresh every 30 seconds
    this.refreshInterval.set(interval);
  }

  stopAutoRefresh(): void {
    const interval = this.refreshInterval();
    if (interval) {
      clearInterval(interval);
      this.refreshInterval.set(null);
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 GB';
    const gb = bytes;
    return `${gb.toFixed(1)} GB`;
  }

  formatTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleTimeString();
  }

  getLatestMetricValue(metrics: any[]): number {
    if (!metrics || metrics.length === 0) return 0;
    return metrics[metrics.length - 1]?.value || 0;
  }

  formatNumber(num: number, decimals: number = 1): string {
    return num.toFixed(decimals);
  }

  getResourceColor(percent: number): string {
    if (percent >= 80) return 'warn';
    if (percent >= 60) return 'accent';
    return 'primary';
  }

  // Historical metrics helpers
  onHistoryResourceChange(resource: 'node' | 'vm'): void {
    this.historyResource.set(resource);
    this.historyRecords.set([]);
    this.historyAggregate.set(null);
  }

  onHistoryTimeframeChange(timeframe: string): void {
    this.historyTimeframe.set(timeframe);
    this.loadHistory();
  }

  loadHistory(): void {
    const timeframe = this.historyTimeframe();
    const start = this.historyStart() ? new Date(this.historyStart() as string).toISOString() : null;
    const end = this.historyEnd() ? new Date(this.historyEnd() as string).toISOString() : null;
    this.historyLoading.set(true);

    if (this.historyResource() === 'node') {
      const node = this.selectedNode();
      if (!node) {
        this.historyLoading.set(false);
        return;
      }

      this.metricHistoryService.getNodeHistory({
        nodeId: node.id,
        timeframe,
        startTime: start,
        endTime: end,
        limit: 300
      }).subscribe({
        next: (records) => {
          this.historyRecords.set(records);
          this.buildHistoryCharts(records);
          this.historyLoading.set(false);
        },
        error: () => {
          this.historyLoading.set(false);
          this.snackBar.open('Failed to load node historical metrics', 'Close', { duration: 3000 });
        }
      });

      this.metricHistoryService.getNodeAggregate({
        nodeId: node.id,
        timeframe,
        startTime: start,
        endTime: end
      }).subscribe({
        next: (agg) => this.historyAggregate.set(agg),
        error: () => this.historyAggregate.set(null)
      });
    } else {
      const vm = this.selectedVM();
      const node = this.selectedNode();
      if (!vm || !node) {
        this.historyLoading.set(false);
        return;
      }

      this.metricHistoryService.getVMHistory({
        vmid: vm.vmid,
        nodeId: node.id,
        timeframe,
        startTime: start,
        endTime: end,
        limit: 300
      }).subscribe({
        next: (records) => {
          this.historyRecords.set(records);
          this.buildHistoryCharts(records);
          this.historyLoading.set(false);
        },
        error: () => {
          this.historyLoading.set(false);
          this.snackBar.open('Failed to load VM historical metrics', 'Close', { duration: 3000 });
        }
      });

      this.metricHistoryService.getVMAggregate({
        vmid: vm.vmid,
        nodeId: node.id,
        timeframe,
        startTime: start,
        endTime: end
      }).subscribe({
        next: (agg) => this.historyAggregate.set(agg),
        error: () => this.historyAggregate.set(null)
      });
    }
  }

  buildHistoryCharts(records: MetricHistoryRecord[]): void {
    if (!records || records.length === 0) {
      this.historyUsageChartConfig.set({} as any);
      this.historyIOChartConfig.set({} as any);
      return;
    }

    const sorted = [...records].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const labels = sorted.map(r => this.formatHistoryTimestamp(r.timestamp));

    const cpuSeries = sorted.map(r => (r.cpu_usage ?? 0) * 100);
    const memSeries = sorted.map(r => r.memory_usage_percent ?? 0);
    const diskReadSeries = sorted.map(r => this.bytesToMB(r.disk_read_bytes));
    const diskWriteSeries = sorted.map(r => this.bytesToMB(r.disk_write_bytes));
    const netInSeries = sorted.map(r => this.bytesToMB(r.network_in_bytes));
    const netOutSeries = sorted.map(r => this.bytesToMB(r.network_out_bytes));

    this.historyUsageChartConfig.set({
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'CPU Usage (%)',
            data: cpuSeries,
            borderColor: '#ff7043',
            backgroundColor: 'rgba(255,112,67,0.1)',
            tension: 0.35,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Memory Usage (%)',
            data: memSeries,
            borderColor: '#42a5f5',
            backgroundColor: 'rgba(66,165,245,0.1)',
            tension: 0.35,
            fill: true,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: { display: true, text: 'Percentage (%)' }
          }
        }
      }
    });

    this.historyIOChartConfig.set({
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Disk Read (MB)',
            data: diskReadSeries,
            borderColor: '#7e57c2',
            backgroundColor: 'rgba(126,87,194,0.1)',
            tension: 0.35,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Disk Write (MB)',
            data: diskWriteSeries,
            borderColor: '#ab47bc',
            backgroundColor: 'rgba(171,71,188,0.1)',
            tension: 0.35,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Network In (MB)',
            data: netInSeries,
            borderColor: '#26a69a',
            backgroundColor: 'rgba(38,166,154,0.1)',
            tension: 0.35,
            fill: true,
            yAxisID: 'y1'
          },
          {
            label: 'Network Out (MB)',
            data: netOutSeries,
            borderColor: '#ffa726',
            backgroundColor: 'rgba(255,167,38,0.1)',
            tension: 0.35,
            fill: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Disk (MB)' }
          },
          y1: {
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Network (MB)' }
          }
        }
      }
    });
  }

  formatHistoryTimestamp(ts: string): string {
    return new Date(ts).toLocaleString();
  }

  bytesToMB(value?: number | null): number {
    if (!value) return 0;
    return value / (1024 * 1024);
  }

  formatBytesCompact(value?: number | null): string {
    if (!value) return '0 MB';
    const mb = this.bytesToMB(value);
    if (mb > 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }
}