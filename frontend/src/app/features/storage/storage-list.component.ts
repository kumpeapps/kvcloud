import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule, MatSelectChange } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ClusterService } from '../../core/services/cluster.service';

export interface Storage {
  storage: string;
  type: string;
  content: string;
  active: number | boolean;
  enabled?: number | boolean;
  shared?: number | boolean;
  used: number;
  total: number;
  avail: number;
}

@Component({
  selector: 'app-storage-list',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatChipsModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Storage Management</h1>
        <div class="header-actions">
          <mat-form-field appearance="outline" class="node-select">
            <mat-label>Select Node</mat-label>
            <mat-select [(value)]="selectedNodeId" (selectionChange)="onNodeChange($event.value)">
              <mat-option *ngFor="let node of nodes" [value]="node.id">{{ node.name || ('Node ' + node.id) }}</mat-option>
            </mat-select>
          </mat-form-field>
          <button mat-raised-button color="primary" disabled>
            <mat-icon>add</mat-icon>
            Add Storage (Coming Soon)
          </button>
        </div>
      </div>

      <div class="storage-grid" *ngIf="storageList.length > 0">
        <mat-card *ngFor="let storage of storageList" class="storage-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon class="storage-icon">storage</mat-icon>
              {{ storage.storage }}
            </mat-card-title>
            <mat-card-subtitle>
              <mat-chip [color]="getStorageColor(storage.type)" class="type-chip">
                {{ storage.type }}
              </mat-chip>
              <mat-chip *ngIf="isTrue(storage.shared)" color="accent" class="status-chip">
                Shared
              </mat-chip>
            </mat-card-subtitle>
          </mat-card-header>

          <mat-card-content>
            <div class="storage-info">
              <div class="info-row">
                <span class="label">Content:</span>
                <span class="value">{{ formatContent(storage.content) }}</span>
              </div>

              <div class="info-row">
                <span class="label">Status:</span>
                <span class="value">
                  <mat-chip 
                    [color]="isTrue(storage.active) ? 'primary' : 'warn'"
                    class="mini-chip">
                    {{ isTrue(storage.active) ? 'Active' : 'Inactive' }}
                  </mat-chip>
                  <mat-chip *ngIf="storage.enabled !== undefined"
                    [color]="isTrue(storage.enabled) ? 'primary' : 'warn'"
                    class="mini-chip">
                    {{ isTrue(storage.enabled) ? 'Enabled' : 'Disabled' }}
                  </mat-chip>
                </span>
              </div>

              <div class="usage-section">
                <div class="usage-header">
                  <span class="label">Usage:</span>
                  <span class="usage-text">
                    {{ formatBytes(storage.used) }} / {{ formatBytes(storage.total) }}
                    ({{ getUsagePercent(storage) }}%)
                  </span>
                </div>
                <mat-progress-bar 
                  mode="determinate" 
                  [value]="getUsagePercent(storage)"
                  [color]="getUsageColor(storage)">
                </mat-progress-bar>
                <div class="available-text">
                  Available: {{ formatBytes(storage.avail) }}
                </div>
              </div>
            </div>
          </mat-card-content>

          <mat-card-actions align="end">
            <button mat-button color="primary" disabled>
              <mat-icon>edit</mat-icon>
              Configure
            </button>
            <button mat-button color="warn" disabled>
              <mat-icon>delete</mat-icon>
              Remove
            </button>
          </mat-card-actions>
        </mat-card>
      </div>

      <div class="empty-state" *ngIf="storageList.length === 0 && !loading">
        <mat-icon>storage</mat-icon>
        <h2>No Storage Found</h2>
        <p>No storage devices are currently configured.</p>
      </div>

      <div class="loading-state" *ngIf="loading">
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        <p>Loading storage information...</p>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 24px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .node-select {
      width: 220px;
    }

    .page-header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 500;
    }

    .storage-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 24px;
    }

    .storage-card {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .storage-card mat-card-header {
      margin-bottom: 16px;
    }

    .storage-icon {
      vertical-align: middle;
      margin-right: 8px;
    }

    .type-chip, .status-chip {
      margin-left: 8px;
      font-size: 11px;
      height: 22px;
    }

    .mini-chip {
      font-size: 10px;
      height: 20px;
      margin-right: 4px;
    }

    .storage-info {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .label {
      font-weight: 500;
      color: rgba(0, 0, 0, 0.6);
    }

    .value {
      color: rgba(0, 0, 0, 0.87);
    }

    .usage-section {
      margin-top: 8px;
    }

    .usage-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .usage-text {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.87);
    }

    .available-text {
      margin-top: 4px;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
      text-align: right;
    }

    mat-card-content {
      flex: 1;
    }

    .empty-state, .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      text-align: center;
      color: rgba(0, 0, 0, 0.6);
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
    }

    .empty-state h2 {
      margin: 8px 0;
      font-weight: 400;
    }

    .loading-state {
      gap: 16px;
    }

    .loading-state mat-progress-bar {
      width: 300px;
    }
  `]
})
export class StorageListComponent implements OnInit {
  storageList: Storage[] = [];
  loading = false;
  nodes: any[] = [];
  selectedNodeId: number | null = null;

  constructor(
    private clusterService: ClusterService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadStorage();
  }

  loadStorage(): void {
    this.loading = true;
    
    this.clusterService.getNodes().subscribe({
      next: (nodes) => {
        this.nodes = nodes || [];
        if (this.nodes.length > 0) {
          const firstId = this.nodes[0].id;
          this.selectedNodeId = firstId;
          this.loadNodeStorage(firstId);
        } else {
          this.loading = false;
          this.snackBar.open('No nodes found', 'Close', { duration: 3000 });
        }
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open('Failed to load nodes', 'Close', { duration: 3000 });
        console.error('Error loading nodes:', error);
      }
    });
  }

  loadNodeStorage(nodeId: number): void {
    this.clusterService.getNodeStorage(nodeId).subscribe({
      next: (storage) => {
        this.storageList = storage;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open('Failed to load storage', 'Close', { duration: 3000 });
        console.error('Error loading storage:', error);
      }
    });
  }

  onNodeChange(nodeId: number | null): void {
    if (!nodeId) return;
    this.selectedNodeId = nodeId;
    this.loading = true;
    this.loadNodeStorage(nodeId);
  }

  isTrue(val: number | boolean | undefined): boolean {
    return val === 1 || val === true;
  }

  formatContent(content: string): string {
    if (!content) return 'None';
    
    const contentMap: { [key: string]: string } = {
      'vztmpl': 'Container Templates',
      'iso': 'ISO Images',
      'backup': 'Backups',
      'rootdir': 'Root Directory',
      'images': 'VM Disks'
    };

    return content.split(',')
      .map(c => contentMap[c.trim()] || c.trim())
      .join(', ');
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getUsagePercent(storage: Storage): number {
    if (!storage.total || storage.total === 0) return 0;
    return Math.round((storage.used / storage.total) * 100);
  }

  getUsageColor(storage: Storage): string {
    const percent = this.getUsagePercent(storage);
    if (percent >= 90) return 'warn';
    if (percent >= 75) return 'accent';
    return 'primary';
  }

  getStorageColor(type: string): string {
    const colorMap: { [key: string]: string } = {
      'dir': 'primary',
      'lvm': 'accent',
      'lvmthin': 'accent',
      'zfspool': 'primary',
      'nfs': 'warn',
      'cifs': 'warn',
      'glusterfs': 'primary',
      'cephfs': 'primary',
      'rbd': 'primary'
    };
    return colorMap[type] || 'primary';
  }
}
