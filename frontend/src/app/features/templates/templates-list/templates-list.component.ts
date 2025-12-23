import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Subject, takeUntil, forkJoin, interval } from 'rxjs';
import { VMService, VM } from '../../../core/services/vm.service';
import { ClusterService, ClusterNode } from '../../../core/services/cluster.service';
import { CloneVmDialogComponent } from '../clone-vm-dialog/clone-vm-dialog.component';
import { CloudImageDownloadDialogComponent } from '../cloud-image-download-dialog.component';
import { FormsModule } from '@angular/forms';

interface Node {
  id: number;
  name: string;
}

interface CloningTask {
  newVmid: number;
  taskId: string;
  sourceTemplate: string;
  progress: number;
  message: string;
}

@Component({
  selector: 'app-templates-list',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatChipsModule,
    MatDialogModule,
    MatSelectModule,
    MatFormFieldModule,
    FormsModule
  ],
  template: `
    <div class="templates-container">
      <div class="header">
        <div class="header-left">
          <h2>VM Templates</h2>
          <button mat-raised-button color="primary" (click)="downloadCloudImage()">
            <mat-icon>cloud_download</mat-icon>
            Download Cloud Image
          </button>
        </div>
        <div class="node-selector">
          <mat-form-field appearance="outline">
            <mat-label>Select Node</mat-label>
            <mat-select [(value)]="selectedNodeId" (selectionChange)="loadTemplates()">
              <mat-option *ngFor="let node of nodes" [value]="node.id">
                {{ node.name }}
              </mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </div>

      <div *ngIf="loading" class="loading-container">
        <mat-spinner></mat-spinner>
        <p>Loading templates...</p>
      </div>

      <div *ngIf="!loading && templates.length === 0" class="empty-state">
        <mat-icon>inventory_2</mat-icon>
        <h3>No Templates Found</h3>
        <p>Convert a VM to a template to create reusable VM configurations.</p>
      </div>

      <div class="templates-grid" *ngIf="!loading && templates.length > 0">
        <mat-card *ngFor="let template of templates" class="template-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>inventory_2</mat-icon>
            <mat-card-title>{{ template.name }}</mat-card-title>
            <mat-card-subtitle>VMID: {{ template.vmid }}</mat-card-subtitle>
          </mat-card-header>

          <mat-card-content>
            <div class="template-details">
              <div class="detail-row">
                <span class="label">CPU:</span>
                <span class="value">{{ template.cpu || 'N/A' }} cores</span>
              </div>
              <div class="detail-row">
                <span class="label">Memory:</span>
                <span class="value">{{ formatMemory(template.maxmem) }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Disk:</span>
                <span class="value">{{ formatDisk(template.maxdisk) }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Tags:</span>
                <div class="tags">
                  <mat-chip *ngFor="let tag of (getTags(template.tags ?? '') || [])">{{ tag }}</mat-chip>
                </div>
              </div>
            </div>
          </mat-card-content>

          <mat-card-actions>
            <button mat-raised-button 
                    color="primary" 
                    (click)="openCloneDialog(template)"
                    [disabled]="hasCloningTasks()"
                    matTooltip="Clone this template to create a new VM">
              <mat-icon>content_copy</mat-icon>
              Clone
            </button>
          </mat-card-actions>

          <div *ngIf="cloningTasks.length > 0" class="cloning-status">
            <div *ngFor="let task of cloningTasks" class="cloning-task">
              <div class="cloning-header">
                <mat-icon>hourglass_empty</mat-icon>
                <div class="cloning-info">
                  <div class="cloning-title">Cloning {{ task.sourceTemplate }}</div>
                  <div class="cloning-subtitle">New VM ID: {{ task.newVmid }}</div>
                </div>
              </div>
              <mat-progress-bar mode="determinate" [value]="task.progress"></mat-progress-bar>
              <div class="cloning-message">{{ task.message }}</div>
            </div>
          </div>
        </mat-card>
      </div>

      <div *ngIf="cloningTasks.length > 0" class="cloning-overlay">
        <div class="cloning-warning">
          <mat-icon>info</mat-icon>
          <p><strong>VM Cloning in Progress</strong></p>
          <p>{{ cloningTasks.length }} {{ cloningTasks.length === 1 ? 'VM is' : 'VMs are' }} being cloned. Other operations are temporarily disabled.</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .templates-container {
      padding: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;

      .header-left {
        display: flex;
        align-items: center;
        gap: 16px;

        h2 {
          margin: 0;
        }
      }

      .node-selector {
        min-width: 250px;

        mat-form-field {
          width: 100%;
        }
      }
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      
      mat-spinner {
        margin-bottom: 20px;
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;

      mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        color: rgba(0, 0, 0, 0.26);
        margin-bottom: 16px;
      }

      h3 {
        margin: 0 0 8px 0;
      }

      p {
        color: rgba(0, 0, 0, 0.6);
        margin: 0;
      }
    }

    .templates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
    }

    .template-card {
      mat-card-header {
        mat-icon[mat-card-avatar] {
          font-size: 40px;
          width: 40px;
          height: 40px;
          background-color: #3f51b5;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }
      }

      .template-details {
        margin-top: 12px;

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);

          &:last-child {
            border-bottom: none;
          }

          .label {
            font-weight: 500;
            color: rgba(0, 0, 0, 0.6);
          }

          .value {
            color: rgba(0, 0, 0, 0.87);
          }

          .tags {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;

            mat-chip {
              font-size: 11px;
              height: 24px;
            }
          }
        }
      }

      mat-card-actions {
        padding: 8px 16px;
        display: flex;
        justify-content: flex-end;

        button {
          mat-icon {
            margin-right: 4px;
          }
        }
      }

      .cloning-status {
        padding: 12px 16px;
        background-color: #fff3cd;
        border-top: 1px solid #ffc107;

        .cloning-task {
          .cloning-header {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 8px;

            mat-icon {
              color: #ff9800;
              flex-shrink: 0;
              margin-top: 2px;
              animation: spin 2s linear infinite;
            }

            .cloning-info {
              flex: 1;

              .cloning-title {
                font-weight: 500;
                color: #333;
                margin-bottom: 2px;
              }

              .cloning-subtitle {
                font-size: 12px;
                color: #666;
              }
            }
          }

          mat-progress-bar {
            margin-bottom: 8px;
          }

          .cloning-message {
            font-size: 12px;
            color: #666;
            text-align: right;
          }
        }
      }
    }

    .cloning-overlay {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      border: 2px solid #ff9800;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 400px;
      z-index: 1000;

      .cloning-warning {
        display: flex;
        gap: 12px;

        mat-icon {
          color: #ff9800;
          flex-shrink: 0;
        }

        p {
          margin: 0;
          font-size: 14px;
          color: #333;

          &:first-child {
            font-weight: 500;
          }

          &:last-child {
            font-size: 12px;
            color: #666;
            margin-top: 4px;
          }
        }
      }
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `]
})
export class TemplatesListComponent implements OnInit, OnDestroy {
  templates: VM[] = [];
  nodes: Node[] = [];
  selectedNodeId: number | null = null;
  loading = false;
  cloningTasks: CloningTask[] = [];
  
  private destroy$ = new Subject<void>();
  private pollInterval: any = null;

  constructor(
    private vmService: VMService,
    private clusterService: ClusterService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadNodes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadNodes(): void {
    // Load all nodes directly
    this.clusterService.getNodes()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (nodes: ClusterNode[]) => {
          this.nodes = nodes.map(node => ({
            id: node.id,
            name: node.name || `Node ${node.id}`
          }));
          if (this.nodes.length > 0) {
            this.selectedNodeId = this.nodes[0].id;
            this.loadTemplates();
          }
        },
        error: (error: any) => {
          console.error('Failed to load nodes:', error);
        }
      });
  }

  loadTemplates(): void {
    if (!this.selectedNodeId) {
      return;
    }

    this.loading = true;
    this.vmService.getTemplates(this.selectedNodeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.templates = response.templates || [];
          this.loading = false;
        },
        error: (error: any) => {
          console.error('Failed to load templates:', error);
          this.templates = [];
          this.loading = false;
        }
      });
  }

  openCloneDialog(template: VM): void {
    if (!this.selectedNodeId) {
      return;
    }

    const dialogRef = this.dialog.open(CloneVmDialogComponent, {
      width: '600px',
      data: { 
        nodeId: this.selectedNodeId, 
        sourceVmid: template.vmid,
        sourceName: template.name,
        isTemplate: true
      }
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        if (result && result.success) {
          console.log('Clone initiated:', result);
          // Add to cloning tasks and start polling
          const cloningTask: CloningTask = {
            newVmid: result.newVmid,
            taskId: result.taskId,
            sourceTemplate: template.name,
            progress: 0,
            message: 'Starting clone process...'
          };
          this.cloningTasks.push(cloningTask);
          this.startCloningPolling(cloningTask);
        }
      });
  }

  hasCloningTasks(): boolean {
    return this.cloningTasks.length > 0;
  }

  private startCloningPolling(task: CloningTask): void {
    // Poll for task status every 2 seconds
    const pollSubscription = interval(2000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.vmService.getTaskStatus(this.selectedNodeId!, task.taskId)
          .subscribe({
            next: (response: any) => {
              if (response.status === 'stopped') {
                // Task completed
                task.progress = 100;
                task.message = 'Clone completed successfully!';
                
                // Remove from cloning tasks after 3 seconds
                setTimeout(() => {
                  const index = this.cloningTasks.indexOf(task);
                  if (index > -1) {
                    this.cloningTasks.splice(index, 1);
                  }
                  pollSubscription.unsubscribe();
                }, 3000);
              } else {
                // Update progress
                task.progress = response.progress || 0;
                task.message = response.message || 'Cloning in progress...';
              }
            },
            error: (error: any) => {
              console.error('Failed to get task status:', error);
              task.message = 'Error tracking clone progress';
            }
          });
      });
  }

  downloadCloudImage(): void {
    const dialogRef = this.dialog.open(CloudImageDownloadDialogComponent, {
      width: '600px',
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Reload templates after a delay to allow download to complete
        setTimeout(() => this.loadTemplates(), 2000);
      }
    });
  }

  formatMemory(bytes: number | undefined): string {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  }

  formatDisk(bytes: number | undefined): string {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  }

  getTags(tags: string): string[] {
    if (!tags) return [];
    return tags.split(';').filter(tag => tag.trim());
  }
}
