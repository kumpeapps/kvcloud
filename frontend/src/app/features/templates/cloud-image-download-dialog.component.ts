import { Component, OnInit, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { ClusterService, ClusterNode } from '../../core/services/cluster.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogRef } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { interval, Subscription } from 'rxjs';

export interface CloudImage {
  id: string;
  name: string;
  distro: string;
  version: string;
  url: string;
  description?: string;
}

@Component({
  selector: 'app-cloud-image-download-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './cloud-image-download-dialog.component.html',
  styleUrl: './cloud-image-download-dialog.component.scss'
})
export class CloudImageDownloadDialogComponent implements OnInit, OnDestroy {
  downloadForm!: FormGroup;
  cloudImages = signal<CloudImage[]>([]);
  nodes = signal<ClusterNode[]>([]);
  loading = signal(false);
  downloading = signal(false);
  error = signal<string | null>(null);
  vmidValidating = signal(false);
  vmidAvailable = signal<boolean | null>(null);
  
  // Progress tracking
  downloadId = signal<string | null>(null);
  progress = signal(0);
  statusMessage = signal('');
  downloadStatus = signal<any>(null);
  private pollSubscription?: Subscription;

  private apiUrl = environment.apiUrl;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private clusterService: ClusterService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<CloudImageDownloadDialogComponent>
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.loadCloudImages();
    this.loadNodes();
  }

  private initForm(): void {
    this.downloadForm = this.fb.group({
      imageId: ['', Validators.required],
      nodeId: [null, Validators.required],
      templateVmid: [null, [Validators.required, Validators.min(100)]],
      templateName: ['', Validators.required],
      memory: [2048, [Validators.required, Validators.min(512)]],
      cores: [2, [Validators.required, Validators.min(1)]],
      storage: ['local-lvm', Validators.required]
    });
    
    // Auto-load next VMID when node changes
    this.downloadForm.get('nodeId')?.valueChanges.subscribe((nodeId) => {
      if (nodeId) {
        this.loadNextVmid(nodeId);
      }
    });
    
    // Validate VMID when it changes
    this.downloadForm.get('templateVmid')?.valueChanges.subscribe((vmid) => {
      if (vmid && this.downloadForm.get('nodeId')?.value) {
        this.validateVmid(this.downloadForm.get('nodeId')?.value, vmid);
      }
    });
  }

  private loadCloudImages(): void {
    this.http.get<CloudImage[]>(`${this.apiUrl}/cloud-images/`).subscribe({
      next: (images) => {
        this.cloudImages.set(images);
      },
      error: (err) => {
        console.error('Failed to load cloud images:', err);
        this.snackBar.open('Failed to load cloud images', 'Close', { duration: 3000 });
      }
    });
  }

  private async loadNodes(): Promise<void> {
    try {
      const nodes = await this.clusterService.listNodes();
      this.nodes.set(nodes);
    } catch (err) {
      console.error('Failed to load nodes:', err);
      this.snackBar.open('Failed to load nodes', 'Close', { duration: 3000 });
    }
  }

  private loadNextVmid(nodeId: number): void {
    this.vmidValidating.set(true);
    this.vmidAvailable.set(null);
    this.http.get<any>(`${this.apiUrl}/cloud-images/next-vmid/${nodeId}`).subscribe({
      next: (response) => {
        this.downloadForm.patchValue({ templateVmid: response.next_vmid }, { emitEvent: false });
        this.vmidValidating.set(false);
        this.vmidAvailable.set(true);
        console.log(`Auto-assigned VMID: ${response.next_vmid}`);
      },
      error: (err) => {
        console.error('Failed to get next VMID:', err);
        this.vmidValidating.set(false);
        this.snackBar.open('Failed to determine next available VMID', 'Close', { duration: 3000 });
      }
    });
  }

  private validateVmid(nodeId: number, vmid: number): void {
    if (!vmid || !nodeId) {
      return;
    }
    
    this.vmidValidating.set(true);
    this.http.post<any>(`${this.apiUrl}/cloud-images/validate-vmid/${nodeId}/${vmid}`, {}).subscribe({
      next: (response) => {
        this.vmidAvailable.set(response.available);
        this.vmidValidating.set(false);
        // Note: We don't set validation errors here anymore - the backend will validate
        // This prevents the form from being disabled while validating
      },
      error: (err) => {
        console.error('Failed to validate VMID:', err);
        this.vmidValidating.set(false);
      }
    });
  }

  onDownload(): void {
    if (!this.downloadForm.valid) {
      return;
    }
    
    // Check VMID availability
    if (this.vmidAvailable() === false) {
      this.error.set('Selected VMID is already in use. Please choose another or use auto-assign.');
      this.snackBar.open('VMID already exists', 'Close', { duration: 5000 });
      return;
    }

    this.loading.set(true);
    this.downloading.set(true);
    this.error.set(null);
    this.progress.set(0);
    this.statusMessage.set('Initializing download...');

    const formValue = this.downloadForm.value;
    const payload = {
      image_id: formValue.imageId,
      node_id: formValue.nodeId,
      template_vmid: formValue.templateVmid, // Can be null for auto-assign
      template_name: formValue.templateName,
      memory: formValue.memory,
      cores: formValue.cores,
      storage: formValue.storage
    };

    this.http.post(`${this.apiUrl}/cloud-images/download`, payload).subscribe({
      next: (response: any) => {
        this.loading.set(false);
        this.statusMessage.set('Waiting for download to start...');
        this.downloadId.set(response.download_id);
        console.log(`[Cloud-Image] Download initiated with ID: ${response.download_id}`);
        console.log(`[Cloud-Image] Response:`, response);
        
        // Start polling for progress
        this.startPolling(response.download_id);
      },
      error: (err) => {
        this.error.set(err.error?.detail || 'Failed to start download');
        this.snackBar.open(this.error()!, 'Close', { duration: 5000 });
        this.loading.set(false);
        this.downloading.set(false);
        this.progress.set(0);
      }
    });
  }

  private startPolling(downloadId: string): void {
    console.log(`[Cloud-Image] Starting polling for download ID: ${downloadId}`);
    let pollCount = 0;
    let lastStatusUpdate = Date.now();
    
    // Poll every 2 seconds
    this.pollSubscription = interval(2000).subscribe(() => {
      pollCount++;
      console.log(`[Cloud-Image] Poll #${pollCount} - requesting status for ${downloadId}`);
      
      // Use skip-auth header to avoid auth interceptor interfering with public endpoint
      this.http.get(`${this.apiUrl}/cloud-images/status/${downloadId}`, { headers: { 'x-skip-auth': 'true' } }).subscribe({
        next: (status: any) => {
          console.log(`[Cloud-Image] Status response (poll #${pollCount}):`, status);
          lastStatusUpdate = Date.now();
          
          this.downloadStatus.set(status);
          this.progress.set(Math.max(0, Math.min(100, status.progress || 0)));
          
          // Update status message with better formatting
          const message = status.message || 'Processing...';
          this.statusMessage.set(message);
          console.log(`[Cloud-Image] Progress: ${this.progress()}%, Message: ${message}, Status: ${status.status}`);

          // Stop polling if completed or failed
          if (status.status === 'completed') {
            console.log(`[Cloud-Image] Download completed successfully!`);
            this.progress.set(100);
            this.statusMessage.set('✓ Template created successfully!');
            this.stopPolling();
            this.snackBar.open('Template created successfully!', 'Close', { duration: 5000 });
            setTimeout(() => this.dialogRef.close(true), 2000);
          } else if (status.status === 'failed') {
            console.error(`[Cloud-Image] Download failed:`, status.message);
            this.statusMessage.set(`✗ ${status.message}`);
            this.stopPolling();
            this.error.set(status.message);
            this.downloading.set(false);
          }
        },
        error: (err) => {
          console.error(`[Cloud-Image] Poll error on attempt #${pollCount}:`, err);
          const errMsg = err.error?.detail || err.message || 'Unknown error';
          console.error(`[Cloud-Image] Full error details:`, {
            status: err.status,
            message: errMsg,
            timestamp: new Date().toISOString()
          });
          
          if (err.status === 404) {
            // Fallback to tasks API for unified task status
            console.log(`[Cloud-Image] Status 404, trying /tasks/${downloadId} fallback...`);
            this.http.get(`${this.apiUrl}/tasks/${downloadId}`, { headers: { 'x-skip-auth': 'true' } }).subscribe({
              next: (task: any) => {
                console.log(`[Cloud-Image] Tasks fallback returned:`, task);
                this.downloadStatus.set(task);
                this.progress.set(Math.max(0, Math.min(100, task.progress || 0)));
                const message = task.message || 'Processing...';
                this.statusMessage.set(message);
              },
              error: (taskErr) => {
                console.log(`[Cloud-Image] Tasks fallback also failed (${taskErr.status}); will retry...`);
              }
            });
          } else if (err.status === 401 || err.status === 403) {
            // With skip-auth, these should not happen; continue polling without stopping
            console.warn(`[Cloud-Image] Unexpected auth error (${err.status}) on public status endpoint; will keep polling.`);
          } else {
            // Continue polling for other errors (network glitches, etc.)
            console.log(`[Cloud-Image] Transient error, will retry in 2 seconds...`);
          }
        }
      });
    });
  }

  private stopPolling(): void {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
      this.pollSubscription = undefined;
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  closeDialog(): void {
    this.stopPolling();
    this.dialogRef.close(false);
  }
}
