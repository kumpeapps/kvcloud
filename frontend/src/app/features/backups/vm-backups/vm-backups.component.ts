import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { Subject, takeUntil } from 'rxjs';
import { BackupService, BackupInfo } from '../../../core/services/backup.service';
import { VMService } from '../../../core/services/vm.service';
import { CreateBackupDialogComponent } from '../create-backup-dialog/create-backup-dialog.component';
import { RestoreBackupDialogComponent } from '../restore-backup-dialog/restore-backup-dialog.component';

@Component({
  selector: 'app-vm-backups',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule
  ],
  template: `
    <div class="backups-container">
      <div class="header">
        <h2>VM Backups</h2>
        <button mat-raised-button color="primary" (click)="openCreateBackupDialog()" [disabled]="loading">
          <mat-icon>backup</mat-icon>
          Create Backup
        </button>
      </div>

      <div *ngIf="loading" class="loading-container">
        <mat-spinner></mat-spinner>
        <p>Loading backups...</p>
      </div>

      <div *ngIf="!loading && backups.length === 0" class="empty-state">
        <mat-icon>backup</mat-icon>
        <h3>No Backups Found</h3>
        <p>Create your first backup to protect your VM data.</p>
        <button mat-raised-button color="primary" (click)="openCreateBackupDialog()">
          <mat-icon>add</mat-icon>
          Create Backup
        </button>
      </div>

      <table mat-table [dataSource]="backups" *ngIf="!loading && backups.length > 0" class="backups-table">
        <!-- Date Column -->
        <ng-container matColumnDef="date">
          <th mat-header-cell *matHeaderCellDef>Date</th>
          <td mat-cell *matCellDef="let backup">
            {{ backupService.formatDate(backup.ctime) }}
          </td>
        </ng-container>

        <!-- Size Column -->
        <ng-container matColumnDef="size">
          <th mat-header-cell *matHeaderCellDef>Size</th>
          <td mat-cell *matCellDef="let backup">
            {{ backupService.formatSize(backup.size) }}
          </td>
        </ng-container>

        <!-- Format Column -->
        <ng-container matColumnDef="format">
          <th mat-header-cell *matHeaderCellDef>Format</th>
          <td mat-cell *matCellDef="let backup">
            <mat-chip>{{ backup.format }}</mat-chip>
          </td>
        </ng-container>

        <!-- Storage Column -->
        <ng-container matColumnDef="storage">
          <th mat-header-cell *matHeaderCellDef>Storage</th>
          <td mat-cell *matCellDef="let backup">{{ backup.storage }}</td>
        </ng-container>

        <!-- Notes Column -->
        <ng-container matColumnDef="notes">
          <th mat-header-cell *matHeaderCellDef>Notes</th>
          <td mat-cell *matCellDef="let backup">
            <span [matTooltip]="backup.notes" *ngIf="backup.notes">
              {{ backup.notes.length > 30 ? backup.notes.substring(0, 30) + '...' : backup.notes }}
            </span>
            <span *ngIf="!backup.notes" class="no-notes">-</span>
          </td>
        </ng-container>

        <!-- Actions Column -->
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef>Actions</th>
          <td mat-cell *matCellDef="let backup">
            <button mat-icon-button 
                    color="primary" 
                    (click)="openRestoreBackupDialog(backup)"
                    matTooltip="Restore backup">
              <mat-icon>restore</mat-icon>
            </button>
            <button mat-icon-button 
                    color="warn" 
                    (click)="deleteBackup(backup)"
                    matTooltip="Delete backup">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
      </table>
    </div>
  `,
  styles: [`
    .backups-container {
      padding: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;

      h2 {
        margin: 0;
      }

      button mat-icon {
        margin-right: 8px;
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
        margin-bottom: 24px;
      }
    }

    .backups-table {
      width: 100%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

      .no-notes {
        color: rgba(0, 0, 0, 0.38);
      }
    }

    mat-chip {
      font-size: 12px;
    }
  `]
})
export class VmBackupsComponent implements OnInit, OnDestroy {
  backups: BackupInfo[] = [];
  loading = false;
  displayedColumns = ['date', 'size', 'format', 'storage', 'notes', 'actions'];
  
  private destroy$ = new Subject<void>();
  private nodeId: number = 0;
  private vmid: number = 0;

  constructor(
    public backupService: BackupService,
    private vmService: VMService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    // Get node and VM ID from current VM context
    // This should be set by parent component or route params
    this.loadBackups();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBackups(): void {
    if (!this.nodeId || !this.vmid) {
      console.warn('Node ID or VM ID not set');
      return;
    }

    this.loading = true;
    this.backupService.listVmBackups(this.nodeId, this.vmid)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (backups) => {
          this.backups = backups;
          this.loading = false;
        },
        error: (error) => {
          console.error('Failed to load backups:', error);
          this.loading = false;
        }
      });
  }

  openCreateBackupDialog(): void {
    const dialogRef = this.dialog.open(CreateBackupDialogComponent, {
      width: '500px',
      data: { nodeId: this.nodeId, vmid: this.vmid }
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        if (result) {
          // Backup created successfully, reload list after a delay
          setTimeout(() => this.loadBackups(), 2000);
        }
      });
  }

  openRestoreBackupDialog(backup: BackupInfo): void {
    const dialogRef = this.dialog.open(RestoreBackupDialogComponent, {
      width: '500px',
      data: { 
        nodeId: this.nodeId, 
        vmid: this.vmid,
        backup: backup 
      }
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        if (result) {
          // Restore initiated
          console.log('Restore initiated:', result);
        }
      });
  }

  deleteBackup(backup: BackupInfo): void {
    if (!confirm(`Are you sure you want to delete this backup from ${this.backupService.formatDate(backup.ctime)}?`)) {
      return;
    }

    this.backupService.deleteBackup(this.nodeId, backup.volid)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadBackups();
        },
        error: (error) => {
          console.error('Failed to delete backup:', error);
          alert('Failed to delete backup. Please try again.');
        }
      });
  }

  /**
   * Set the context (node and VM) for this component
   * This should be called by the parent component
   */
  setContext(nodeId: number, vmid: number): void {
    this.nodeId = nodeId;
    this.vmid = vmid;
    this.loadBackups();
  }
}
