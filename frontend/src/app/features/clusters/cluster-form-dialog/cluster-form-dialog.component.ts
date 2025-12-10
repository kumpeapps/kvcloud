import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../shared/material.module';
import { ClusterService, Cluster } from '../../../core/services/cluster.service';
import { MatSnackBar } from '@angular/material/snack-bar';

export interface ProxmoxNode {
  id?: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  ssh_username?: string;
  ssh_password?: string;
  verify_ssl: boolean;
  is_active?: boolean;
}

@Component({
  selector: 'app-cluster-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './cluster-form-dialog.component.html',
  styleUrls: ['./cluster-form-dialog.component.scss']
})
export class ClusterFormDialogComponent {
  clusterForm: FormGroup;
  isEditing: boolean;
  loading = false;
  error: string | null = null;
  nodes = signal<ProxmoxNode[]>([]);
  showNodeForm = signal(false);
  nodeForm: FormGroup;
  editingNodeIndex: number | null = null;

  constructor(
    private fb: FormBuilder,
    private clusterService: ClusterService,
    private dialogRef: MatDialogRef<ClusterFormDialogComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: Cluster | null
  ) {
    this.isEditing = !!data;
    this.clusterForm = this.fb.group({
      name: [data?.name || '', [Validators.required, Validators.minLength(2)]],
      description: [data?.description || '']
    });

    this.nodeForm = this.fb.group({
      id: [null],
      name: ['', [Validators.required]],
      host: ['', [Validators.required]],
      port: [8006, [Validators.required, Validators.min(1), Validators.max(65535)]],
      username: ['root@pam', [Validators.required]],
      password: ['', [Validators.required]],
      ssh_username: ['root'],
      ssh_password: [''],
      verify_ssl: [false]
    });

    if (data?.id) {
      this.loadNodes(data.id);
    }
  }

  loadNodes(clusterId: number): void {
    this.clusterService.getClusterNodes(clusterId).subscribe({
      next: (nodes: any[]) => {
        this.nodes.set(nodes);
      },
      error: (err) => {
        console.error('Error loading nodes:', err);
      }
    });
  }

  toggleNodeForm(): void {
    this.showNodeForm.set(!this.showNodeForm());
    if (!this.showNodeForm()) {
      this.nodeForm.reset({ port: 8006, username: 'root@pam', verify_ssl: false });
      this.editingNodeIndex = null;
    }
  }

  addNode(): void {
    if (this.nodeForm.valid) {
      const nodeData = this.nodeForm.value;
      const currentNodes = this.nodes();
      
      if (this.editingNodeIndex !== null) {
        // Update existing node in the list
        currentNodes[this.editingNodeIndex] = nodeData;
        this.nodes.set([...currentNodes]);
        this.editingNodeIndex = null;
      } else {
        // Add new node
        this.nodes.set([...currentNodes, nodeData]);
      }
      
      this.nodeForm.reset({ port: 8006, username: 'root@pam', verify_ssl: false });
      this.showNodeForm.set(false);
    }
  }

  editNode(index: number): void {
    const node = this.nodes()[index];
    this.nodeForm.patchValue(node);
    this.editingNodeIndex = index;
    this.showNodeForm.set(true);
  }

  removeNode(index: number): void {
    const node = this.nodes()[index];
    
    // If node has an ID, it's persisted in the database and needs to be deleted via API
    if (node.id) {
      this.clusterService.deleteNode(node.id).subscribe({
        next: () => {
          const currentNodes = this.nodes();
          currentNodes.splice(index, 1);
          this.nodes.set([...currentNodes]);
          this.snackBar.open('Node deleted successfully', 'Close', { duration: 3000 });
        },
        error: (err) => {
          console.error('Error deleting node:', err);
          this.snackBar.open('Failed to delete node', 'Close', { duration: 3000 });
        }
      });
    } else {
      // Node not persisted yet, just remove from local array
      const currentNodes = this.nodes();
      currentNodes.splice(index, 1);
      this.nodes.set([...currentNodes]);
    }
  }

  onSubmit(): void {
    if (this.clusterForm.valid) {
      if (this.nodes().length === 0 && !this.isEditing) {
        this.snackBar.open('Please add at least one Proxmox node', 'Close', { duration: 3000 });
        return;
      }

      this.loading = true;
      this.error = null;

      const clusterData = this.clusterForm.value;

      if (this.isEditing && this.data?.id) {
        // Update existing cluster
        this.clusterService.updateCluster(this.data.id, clusterData).subscribe({
          next: () => {
            // Create any new nodes
            const newNodes = this.nodes().filter(n => !n.id);
            if (newNodes.length > 0) {
              this.createNodesForCluster(this.data!.id);
            } else {
              this.loading = false;
              this.snackBar.open('Cluster updated successfully', 'Close', { duration: 3000 });
              this.dialogRef.close(true);
            }
          },
          error: (err) => {
            console.error('Error updating cluster:', err);
            this.error = err.error?.detail || 'Failed to update cluster';
            this.loading = false;
          }
        });
      } else {
        // Create new cluster
        this.clusterService.createCluster(clusterData).subscribe({
          next: (cluster: Cluster) => {
            // Create nodes if any
            if (this.nodes().length > 0) {
              this.createNodesForCluster(cluster.id);
            } else {
              this.loading = false;
              this.dialogRef.close(true);
            }
          },
          error: (err) => {
            console.error('Error saving cluster:', err);
            this.error = err.error?.detail || 'Failed to save cluster';
            this.loading = false;
          }
        });
      }
    }
  }

  private createNodesForCluster(clusterId: number): void {
    const nodesToCreate = this.nodes().filter(n => !n.id);
    const nodesToUpdate = this.nodes().filter(n => n.id);
    let completed = 0;
    let hasError = false;
    const totalOperations = nodesToCreate.length + nodesToUpdate.length;

    if (totalOperations === 0) {
      this.loading = false;
      this.dialogRef.close(true);
      return;
    }

    // Create new nodes
    nodesToCreate.forEach((node) => {
      const nodeData = { ...node, cluster_id: clusterId };
      
      this.clusterService.createNode(nodeData).subscribe({
        next: () => {
          completed++;
          if (completed === totalOperations) {
            this.loading = false;
            this.snackBar.open('Cluster and nodes updated successfully', 'Close', { duration: 3000 });
            this.dialogRef.close(true);
          }
        },
        error: (err) => {
          console.error('Error creating node:', err);
          if (!hasError) {
            hasError = true;
            this.error = `Failed to create some nodes: ${err.error?.detail || 'Unknown error'}`;
            this.loading = false;
          }
        }
      });
    });

    // Update existing nodes
    nodesToUpdate.forEach((node) => {
      const nodeData = { ...node, cluster_id: clusterId };
      
      this.clusterService.updateNode(node.id!, nodeData).subscribe({
        next: () => {
          completed++;
          if (completed === totalOperations) {
            this.loading = false;
            this.snackBar.open('Cluster and nodes updated successfully', 'Close', { duration: 3000 });
            this.dialogRef.close(true);
          }
        },
        error: (err) => {
          console.error('Error updating node:', err);
          if (!hasError) {
            hasError = true;
            this.error = `Failed to update some nodes: ${err.error?.detail || 'Unknown error'}`;
            this.loading = false;
          }
        }
      });
    });
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
