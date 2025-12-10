import { Component, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MaterialModule } from '../../../shared/material.module';
import { ClusterService, Cluster, ClusterNode } from '../../../core/services/cluster.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { ClusterFormDialogComponent } from '../cluster-form-dialog/cluster-form-dialog.component';
import { NodeFormDialogComponent } from '../node-form-dialog/node-form-dialog.component';
import { ConfirmationService } from '../../../shared/services/confirmation.service';

@Component({
  selector: 'app-cluster-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MaterialModule,
    LoadingSpinnerComponent,
    StatusBadgeComponent,
    NodeFormDialogComponent
  ],
  templateUrl: './cluster-detail.component.html',
  styleUrls: ['./cluster-detail.component.scss']
})
export class ClusterDetailComponent implements OnInit {
  cluster = signal<Cluster | null>(null);
  nodes = signal<ClusterNode[]>([]);
  nodesDataSource = new MatTableDataSource<ClusterNode>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  clusterId = signal<number>(0);
  displayedColumns: string[] = ['name', 'host', 'username', 'ssl', 'status', 'actions'];
  
  activeNodesCount = computed(() => this.nodes().filter(n => n.is_active).length);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clusterService: ClusterService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private confirmationService: ConfirmationService
  ) {
    // Update dataSource whenever nodes signal changes
    effect(() => {
      this.nodesDataSource.data = this.nodes();
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    this.clusterId.set(parseInt(id, 10));
    this.loadClusterDetails();
  }

  loadClusterDetails(): void {
    this.loading.set(true);
    this.error.set(null);

    this.clusterService.getCluster(this.clusterId()).subscribe({
      next: (cluster) => {
        this.cluster.set(cluster);
        this.loadNodes();
      },
      error: (err) => {
        console.error('Error loading cluster:', err);
        this.error.set('Failed to load cluster details');
        this.loading.set(false);
      }
    });
  }

  loadNodes(): void {
    this.clusterService.getClusterNodes(this.clusterId()).subscribe({
      next: (nodes) => {
        this.nodes.set(nodes);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading nodes:', err);
        this.loading.set(false);
      }
    });
  }

  openEditDialog(): void {
    const dialogRef = this.dialog.open(ClusterFormDialogComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: this.cluster()
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadClusterDetails();
      }
    });
  }

  async deleteCluster(): Promise<void> {
    this.confirmationService.confirm({
      title: 'Delete Cluster',
      message: `Are you sure you want to delete cluster "${this.cluster()?.name}"? This will also delete all associated nodes.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'delete_forever'
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.clusterService.deleteCluster(this.clusterId()).subscribe({
        next: () => {
          this.snackBar.open('Cluster deleted successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/clusters']);
        },
        error: (err) => {
          console.error('Error deleting cluster:', err);
          const errorMessage = err?.error?.detail || 'Failed to delete cluster';
          this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        }
      });
    });
  }

  async deleteNode(node: ClusterNode): Promise<void> {
    
    this.confirmationService.confirm({
      title: 'Delete Node',
      message: `Are you sure you want to delete node "${node.name}" (${node.host})?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'delete_forever'
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.clusterService.deleteNode(node.id).subscribe({
        next: () => {
          this.snackBar.open('Node deleted successfully', 'Close', { duration: 3000 });
          this.loadNodes();
        },
        error: (err) => {
          console.error('Error deleting node:', err);
          const errorMessage = err?.error?.detail || 'Failed to delete node';
          this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        }
      });
    });
  }

  openAddNodeDialog(): void {
    const dialogRef = this.dialog.open(NodeFormDialogComponent, {
      width: '700px',
      maxHeight: '90vh',
      data: { clusterId: this.clusterId() }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadNodes();
      }
    });
  }

  openEditNodeDialog(node: ClusterNode): void {
    const dialogRef = this.dialog.open(NodeFormDialogComponent, {
      width: '700px',
      maxHeight: '90vh',
      data: { clusterId: this.clusterId(), node }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadNodes();
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/clusters']);
  }
}
