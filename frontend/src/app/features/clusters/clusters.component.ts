import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { ClusterService, Cluster } from '../../core/services/cluster.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { MatDialog } from '@angular/material/dialog';
import { ClusterFormDialogComponent } from './cluster-form-dialog/cluster-form-dialog.component';

@Component({
  selector: 'app-clusters',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MaterialModule,
    LoadingSpinnerComponent,
    StatusBadgeComponent
  ],
  templateUrl: './clusters.component.html',
  styleUrls: ['./clusters.component.scss']
})
export class ClustersComponent implements OnInit {
  clusters = signal<Cluster[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor(
    private clusterService: ClusterService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadClusters();
  }

  loadClusters(): void {
    this.loading.set(true);
    this.error.set(null);

    this.clusterService.getClusters().subscribe({
      next: (clusters) => {
        this.clusters.set(clusters);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading clusters:', err);
        this.error.set('Failed to load clusters');
        this.loading.set(false);
      }
    });
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(ClusterFormDialogComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: null
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadClusters();
      }
    });
  }

  openEditDialog(cluster: Cluster): void {
    const dialogRef = this.dialog.open(ClusterFormDialogComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: cluster
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadClusters();
      }
    });
  }
}
