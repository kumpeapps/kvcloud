import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../shared/material.module';
import { ISOService, ISO, Storage } from '../../core/services/iso.service';
import { ClusterService, ClusterNode } from '../../core/services/cluster.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ConfirmationService } from '../../shared/services/confirmation.service';
import { PermissionService } from '../../core/services/permission.service';
import { HasPermissionDirective } from '../../core/directives/has-permission.directive';
import { DisableIfNoPermissionDirective } from '../../core/directives/disable-if-no-permission.directive';

@Component({
  selector: 'app-isos',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    ReactiveFormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    DisableIfNoPermissionDirective
  ],
  templateUrl: './isos.component.html',
  styleUrls: ['./isos.component.scss']
})
export class ISOsComponent implements OnInit {
  nodes = signal<ClusterNode[]>([]);
  selectedNode = signal<ClusterNode | null>(null);
  isos = signal<ISO[]>([]);
  storages = signal<Storage[]>([]);
  loading = signal(true);
  isosLoading = signal(false);
  displayedColumns = ['name', 'storage', 'size', 'format', 'actions'];
  showUploadDialog = signal(false);
  uploadForm: FormGroup;
  uploading = signal(false);
  uploadProgress = signal<string>('');

  constructor(
    private isoService: ISOService,
    private clusterService: ClusterService,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private confirmationService: ConfirmationService,
    private permissionService: PermissionService
  ) {
    this.uploadForm = this.fb.group({
      storage: ['', [Validators.required]],
      filename: ['', [Validators.required, Validators.pattern(/^[\w\-\.]+\.iso$/)]],
      url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]]
    });
  }

  ngOnInit(): void {
    this.loadNodes();
  }

  loadNodes(): void {
    this.loading.set(true);
    this.clusterService.getClusters().subscribe({
      next: (clusters) => {
        if (clusters.length === 0) {
          this.loading.set(false);
          return;
        }

        this.clusterService.getClusterNodes(clusters[0].id).subscribe({
          next: (nodes) => {
            this.nodes.set(nodes);
            if (nodes.length > 0) {
              this.selectNode(nodes[0]);
            }
            this.loading.set(false);
          },
          error: (err) => {
            console.error('Error loading nodes:', err);
            this.snackBar.open('Failed to load nodes', 'Close', { duration: 5000 });
            this.loading.set(false);
          }
        });
      },
      error: (err) => {
        console.error('Error loading clusters:', err);
        this.snackBar.open('Failed to load clusters', 'Close', { duration: 5000 });
        this.loading.set(false);
      }
    });
  }

  selectNode(node: ClusterNode): void {
    this.selectedNode.set(node);
    this.loadISOs(node.id);
    this.loadStorages(node.id);
  }

  loadISOs(nodeId: number): void {
    this.isosLoading.set(true);
    this.isoService.listNodeISOs(nodeId).subscribe({
      next: (isos) => {
        this.isos.set(isos);
        this.isosLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading ISOs:', err);
        this.snackBar.open('Failed to load ISO images', 'Close', { duration: 5000 });
        this.isosLoading.set(false);
      }
    });
  }

  loadStorages(nodeId: number): void {
    this.isoService.listNodeStorages(nodeId).subscribe({
      next: (storages) => {
        // Filter storages that support ISO content
        const isoStorages = storages.filter(s => s.content.includes('iso'));
        this.storages.set(isoStorages);
      },
      error: (err) => {
        console.error('Error loading storages:', err);
      }
    });
  }

  openUploadDialog(): void {
    this.showUploadDialog.set(true);
    this.uploadForm.reset();
  }

  closeUploadDialog(): void {
    this.showUploadDialog.set(false);
  }

  uploadISO(): void {
    if (this.uploadForm.invalid || !this.selectedNode()) {
      this.snackBar.open('Please fill all required fields', 'Close', { duration: 3000 });
      return;
    }

    const formValue = this.uploadForm.value;
    const uploadData = {
      node_id: this.selectedNode()!.id,
      storage: formValue.storage,
      filename: formValue.filename,
      url: formValue.url
    };

    this.uploading.set(true);
    this.uploadProgress.set('Starting ISO download...');

    this.isoService.uploadISO(uploadData).subscribe({
      next: (response) => {
        this.uploadProgress.set('Download task started successfully');
        
        // Show success message with task info
        const snackBarRef = this.snackBar.open(
          'ISO download started. Large files may take several minutes. The page will refresh automatically.',
          'Close',
          { duration: 10000 }
        );
        
        this.closeUploadDialog();
        this.uploading.set(false);
        this.uploadProgress.set('');
        
        // Start monitoring the task
        if (response.task_upid) {
          this.monitorUploadTask(this.selectedNode()!.id, response.task_upid);
        } else {
          // Fallback: refresh after delay
          setTimeout(() => this.loadISOs(this.selectedNode()!.id), 30000);
        }
      },
      error: (err) => {
        const errorMessage = err.error?.detail || err.message || 'Unknown error occurred';
        this.uploadProgress.set(`Upload failed: ${errorMessage}`);
        this.snackBar.open(
          `Failed to start ISO download: ${errorMessage}`,
          'Close',
          { duration: 8000 }
        );
        this.uploading.set(false);
        setTimeout(() => this.uploadProgress.set(''), 3000);
      }
    });
  }

  private monitorUploadTask(nodeId: number, upid: string): void {
    const checkInterval = setInterval(() => {
      this.isoService.getTaskStatus(nodeId, upid).subscribe({
        next: (status) => {
          if (status.status === 'stopped') {
            clearInterval(checkInterval);
            
            if (status.exitstatus === 'OK') {
              this.snackBar.open('ISO download completed successfully!', 'Close', { duration: 5000 });
              this.loadISOs(nodeId);
            } else {
              this.snackBar.open(
                `ISO download failed: ${status.exitstatus || 'Unknown error'}`,
                'Close',
                { duration: 8000 }
              );
            }
          }
        },
        error: (err) => {
          clearInterval(checkInterval);
          console.error('Error checking task status:', err);
          // Fallback: refresh list anyway
          this.loadISOs(nodeId);
        }
      });
    }, 5000); // Check every 5 seconds

    // Timeout after 10 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      this.loadISOs(nodeId);
    }, 600000);
  }

  deleteISO(iso: ISO): void {
    this.confirmationService.confirm({
      title: 'Delete ISO Image',
      message: `Are you sure you want to delete ${iso.name}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    }).subscribe(confirmed => {
      if (confirmed && this.selectedNode()) {
        this.isoService.deleteISO(this.selectedNode()!.id, iso.storage, iso.volid).subscribe({
          next: () => {
            this.snackBar.open('ISO deleted successfully', 'Close', { duration: 3000 });
            this.loadISOs(this.selectedNode()!.id);
          },
          error: (err) => {
            this.snackBar.open(
              `Failed to delete ISO: ${err.error?.detail || 'Unknown error'}`,
              'Close',
              { duration: 5000 }
            );
          }
        });
      }
    });
  }

  canUploadISO(): boolean {
    return this.permissionService.hasPermission('iso', 'upload');
  }

  canDeleteISO(): boolean {
    return this.permissionService.hasPermission('iso', 'delete');
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
