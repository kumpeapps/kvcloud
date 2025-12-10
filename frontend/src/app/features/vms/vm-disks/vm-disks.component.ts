import { Component, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { VMService } from '../../../core/services/vm.service';
import { AddDiskDialogComponent } from './add-disk-dialog.component';
import { ResizeDiskDialogComponent } from './resize-disk-dialog.component';

@Component({
  selector: 'app-vm-disks',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>VM Disks</mat-card-title>
        <button mat-raised-button color="primary" (click)="openAddDiskDialog()" 
                [disabled]="loading()">
          <mat-icon>add</mat-icon>
          Add Disk
        </button>
      </mat-card-header>
      <mat-card-content>
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="50"></mat-spinner>
          </div>
        } @else if (disks().length === 0) {
          <p class="no-data">No disks found</p>
        } @else {
          <table mat-table [dataSource]="disks()" class="disks-table">
            <!-- Device Column -->
            <ng-container matColumnDef="device">
              <th mat-header-cell *matHeaderCellDef>Device</th>
              <td mat-cell *matCellDef="let disk">{{ disk.device }}</td>
            </ng-container>

            <!-- Storage Column -->
            <ng-container matColumnDef="storage">
              <th mat-header-cell *matHeaderCellDef>Storage</th>
              <td mat-cell *matCellDef="let disk">{{ disk.storage }}</td>
            </ng-container>

            <!-- Size Column -->
            <ng-container matColumnDef="size">
              <th mat-header-cell *matHeaderCellDef>Size</th>
              <td mat-cell *matCellDef="let disk">{{ disk.size || 'N/A' }}</td>
            </ng-container>

            <!-- Format Column -->
            <ng-container matColumnDef="format">
              <th mat-header-cell *matHeaderCellDef>Format</th>
              <td mat-cell *matCellDef="let disk">{{ disk.format || 'raw' }}</td>
            </ng-container>

            <!-- Cache Column -->
            <ng-container matColumnDef="cache">
              <th mat-header-cell *matHeaderCellDef>Cache</th>
              <td mat-cell *matCellDef="let disk">{{ disk.cache || 'none' }}</td>
            </ng-container>

            <!-- Discard Column -->
            <ng-container matColumnDef="discard">
              <th mat-header-cell *matHeaderCellDef>Discard</th>
              <td mat-cell *matCellDef="let disk">{{ disk.discard || 'N/A' }}</td>
            </ng-container>

            <!-- Actions Column -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let disk">
                <button mat-icon-button color="primary" 
                        (click)="openResizeDiskDialog(disk)"
                        matTooltip="Resize Disk">
                  <mat-icon>expand</mat-icon>
                </button>
                <button mat-icon-button color="warn" 
                        (click)="confirmDeleteDisk(disk)"
                        matTooltip="Delete Disk">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 200px;
    }

    .no-data {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    .disks-table {
      width: 100%;
    }

    mat-card-content {
      padding: 20px;
    }
  `]
})
export class VMDisksComponent implements OnInit {
  @Input() nodeId!: number;
  @Input() vmid!: number;
  disks = signal<any[]>([]);
  loading = signal<boolean>(true);
  
  displayedColumns: string[] = ['device', 'storage', 'size', 'format', 'cache', 'discard', 'actions'];

  constructor(
    private vmService: VMService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadDisks();
  }

  loadDisks() {
    this.loading.set(true);
    this.vmService.listDisks(this.nodeId, this.vmid).subscribe({
      next: (response) => {
        this.disks.set(response.disks || []);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading disks:', error);
        this.snackBar.open('Failed to load disks', 'Close', { duration: 3000 });
        this.loading.set(false);
      }
    });
  }

  openAddDiskDialog() {
    const dialogRef = this.dialog.open(AddDiskDialogComponent, {
      width: '500px',
      data: { nodeId: this.nodeId, vmid: this.vmid }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.addDisk(result);
      }
    });
  }

  addDisk(diskConfig: any) {
    this.vmService.addDisk(this.nodeId, this.vmid, diskConfig).subscribe({
      next: (response) => {
        this.snackBar.open(response.message || 'Disk added successfully', 'Close', { duration: 3000 });
        setTimeout(() => this.loadDisks(), 2000);
      },
      error: (error) => {
        console.error('Error adding disk:', error);
        this.snackBar.open('Failed to add disk', 'Close', { duration: 3000 });
      }
    });
  }

  openResizeDiskDialog(disk: any) {
    const dialogRef = this.dialog.open(ResizeDiskDialogComponent, {
      width: '400px',
      data: { disk, nodeId: this.nodeId, vmid: this.vmid }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.resizeDisk(disk.device, result.size);
      }
    });
  }

  resizeDisk(disk: string, size: string) {
    this.vmService.resizeDisk(this.nodeId, this.vmid, disk, size).subscribe({
      next: (response) => {
        this.snackBar.open(response.message || 'Disk resize initiated', 'Close', { duration: 3000 });
        setTimeout(() => this.loadDisks(), 2000);
      },
      error: (error) => {
        console.error('Error resizing disk:', error);
        this.snackBar.open('Failed to resize disk', 'Close', { duration: 3000 });
      }
    });
  }

  confirmDeleteDisk(disk: any) {
    const confirmed = confirm(`Are you sure you want to delete disk ${disk.device}? This action cannot be undone.`);
    if (confirmed) {
      this.deleteDisk(disk.device);
    }
  }

  deleteDisk(disk: string) {
    this.vmService.deleteDisk(this.nodeId, this.vmid, disk).subscribe({
      next: (response) => {
        this.snackBar.open(response.message || 'Disk deleted successfully', 'Close', { duration: 3000 });
        setTimeout(() => this.loadDisks(), 2000);
      },
      error: (error) => {
        console.error('Error deleting disk:', error);
        this.snackBar.open('Failed to delete disk', 'Close', { duration: 3000 });
      }
    });
  }
}
