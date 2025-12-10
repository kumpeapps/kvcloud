import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../shared/material.module';
import { SnapshotService, Snapshot, SnapshotCreateRequest } from '../../core/services/snapshot.service';
import { ClusterService, ClusterNode } from '../../core/services/cluster.service';
import { VMService, VM } from '../../core/services/vm.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ConfirmationService } from '../../shared/services/confirmation.service';
import { PermissionService } from '../../core/services/permission.service';

@Component({
  selector: 'app-snapshots',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    ReactiveFormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  templateUrl: './snapshots.component.html',
  styleUrls: ['./snapshots.component.scss']
})
export class SnapshotsComponent implements OnInit {
  nodes = signal<ClusterNode[]>([]);
  selectedNode = signal<ClusterNode | null>(null);
  vms = signal<VM[]>([]);
  selectedVM = signal<VM | null>(null);
  snapshots = signal<Snapshot[]>([]);
  loading = signal(true);
  snapshotsLoading = signal(false);
  displayedColumns = ['name', 'description', 'date', 'vmstate', 'actions'];
  showCreateDialog = signal(false);
  snapshotForm: FormGroup;

  constructor(
    private snapshotService: SnapshotService,
    private clusterService: ClusterService,
    private vmService: VMService,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private confirmationService: ConfirmationService,
    private permissionService: PermissionService
  ) {
    this.snapshotForm = this.fb.group({
      snapname: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_\-]+$/), Validators.maxLength(40)]],
      description: ['', [Validators.maxLength(255)]],
      vmstate: [false]
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

        // Get nodes from all clusters
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
    this.snapshots.set([]);
    this.loadVMs(node.id);
  }

  loadVMs(nodeId: number): void {
    this.vmService.listVMs(nodeId).subscribe({
      next: (response: {vms: VM[]}) => {
        this.vms.set(response.vms);
        if (response.vms.length > 0) {
          this.selectVM(response.vms[0]);
        }
      },
      error: (error: any) => {
        console.error('Error loading VMs:', error);
        this.snackBar.open('Failed to load VMs', 'Close', { duration: 3000 });
      }
    });
  }

  selectVM(vm: VM): void {
    this.selectedVM.set(vm);
    this.loadSnapshots();
  }

  loadSnapshots(): void {
    const node = this.selectedNode();
    const vm = this.selectedVM();

    if (!node || !vm) {
      return;
    }

    this.snapshotsLoading.set(true);
    this.snapshotService.listSnapshots(node.id, vm.vmid).subscribe({
      next: (snapshots) => {
        // Filter out 'current' snapshot which is not a real snapshot
        const realSnapshots = snapshots.filter(s => s.name !== 'current');
        this.snapshots.set(realSnapshots);
        this.snapshotsLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading snapshots:', error);
        this.snackBar.open('Failed to load snapshots', 'Close', { duration: 3000 });
        this.snapshotsLoading.set(false);
      }
    });
  }

  openCreateDialog(): void {
    this.snapshotForm.reset({
      snapname: '',
      description: '',
      vmstate: false
    });
    this.showCreateDialog.set(true);
  }

  closeCreateDialog(): void {
    this.showCreateDialog.set(false);
  }

  createSnapshot(): void {
    if (this.snapshotForm.invalid) {
      return;
    }

    const node = this.selectedNode();
    const vm = this.selectedVM();

    if (!node || !vm) {
      return;
    }

    const request: SnapshotCreateRequest = {
      snapname: this.snapshotForm.value.snapname,
      description: this.snapshotForm.value.description,
      vmstate: this.snapshotForm.value.vmstate
    };

    this.snapshotService.createSnapshot(node.id, vm.vmid, request).subscribe({
      next: (response) => {
        this.snackBar.open(response.message, 'Close', { duration: 3000 });
        this.closeCreateDialog();
        // Reload snapshots after a short delay to allow snapshot creation
        setTimeout(() => this.loadSnapshots(), 2000);
      },
      error: (error) => {
        console.error('Error creating snapshot:', error);
        this.snackBar.open(error.error?.detail || 'Failed to create snapshot', 'Close', { duration: 5000 });
      }
    });
  }

  deleteSnapshot(snapshot: Snapshot): void {
    const node = this.selectedNode();
    const vm = this.selectedVM();

    if (!node || !vm) {
      return;
    }

    this.confirmationService.confirm({
      title: 'Delete Snapshot',
      message: `Are you sure you want to delete snapshot "${snapshot.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    }).subscribe((confirmed) => {
      if (confirmed) {
        this.snapshotService.deleteSnapshot(node.id, vm.vmid, snapshot.name).subscribe({
          next: (response) => {
            this.snackBar.open(response.message, 'Close', { duration: 3000 });
            this.loadSnapshots();
          },
          error: (error) => {
            console.error('Error deleting snapshot:', error);
            this.snackBar.open(error.error?.detail || 'Failed to delete snapshot', 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  rollbackSnapshot(snapshot: Snapshot): void {
    const node = this.selectedNode();
    const vm = this.selectedVM();

    if (!node || !vm) {
      return;
    }

    this.confirmationService.confirm({
      title: 'Rollback to Snapshot',
      message: `Are you sure you want to rollback VM "${vm.name}" to snapshot "${snapshot.name}"? The VM will be stopped and current state will be lost.`,
      confirmText: 'Rollback',
      cancelText: 'Cancel'
    }).subscribe((confirmed) => {
      if (confirmed) {
        this.snapshotService.rollbackSnapshot(node.id, vm.vmid, snapshot.name).subscribe({
          next: (response) => {
            this.snackBar.open(response.message, 'Close', { duration: 3000 });
            this.loadSnapshots();
          },
          error: (error) => {
            console.error('Error rolling back snapshot:', error);
            this.snackBar.open(error.error?.detail || 'Failed to rollback snapshot', 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  canCreateSnapshot(): boolean {
    return this.permissionService.hasPermission('snapshot', 'create');
  }

  canDeleteSnapshot(): boolean {
    return this.permissionService.hasPermission('snapshot', 'delete');
  }

  canRestoreSnapshot(): boolean {
    return this.permissionService.hasPermission('snapshot', 'restore');
  }

  formatDate(timestamp?: number): string {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString();
  }

  getVMStateText(vmstate?: number): string {
    return vmstate ? 'Yes' : 'No';
  }
}
