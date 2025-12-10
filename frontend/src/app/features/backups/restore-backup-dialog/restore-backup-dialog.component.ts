import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BackupService, BackupInfo, BackupRestoreRequest } from '../../../core/services/backup.service';

export interface RestoreBackupDialogData {
  nodeId: number;
  vmid: number;
  backup: BackupInfo;
}

@Component({
  selector: 'app-restore-backup-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule
  ],
  template: `
    <h2 mat-dialog-title>Restore VM Backup</h2>
    
    <mat-dialog-content>
      <div class="warning-banner">
        <strong>⚠️ Warning:</strong> This will restore the VM to the state from this backup.
        Any changes made after the backup was created will be lost.
      </div>

      <div class="backup-info">
        <h3>Backup Details</h3>
        <p><strong>Date:</strong> {{ backupService.formatDate(data.backup.ctime) }}</p>
        <p><strong>Size:</strong> {{ backupService.formatSize(data.backup.size) }}</p>
        <p><strong>Format:</strong> {{ data.backup.format }}</p>
        <p><strong>Storage:</strong> {{ data.backup.storage }}</p>
        <p *ngIf="data.backup.notes"><strong>Notes:</strong> {{ data.backup.notes }}</p>
      </div>

      <form [formGroup]="restoreForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Target VM ID</mat-label>
          <input matInput 
                 type="number" 
                 formControlName="target_vmid" 
                 placeholder="Enter VM ID">
          <mat-hint>VM ID to restore to (can be different from original)</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Target Storage (optional)</mat-label>
          <input matInput formControlName="storage" placeholder="Leave empty for default">
          <mat-hint>Storage location for restored VM (optional)</mat-hint>
        </mat-form-field>

        <div *ngIf="error" class="error-message">
          {{ error }}
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="loading">Cancel</button>
      <button mat-raised-button 
              color="primary" 
              (click)="restoreBackup()" 
              [disabled]="restoreForm.invalid || loading">
        <mat-spinner *ngIf="loading" diameter="20"></mat-spinner>
        <span *ngIf="!loading">Restore Backup</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 500px;
      padding-top: 20px;
    }

    .warning-banner {
      background-color: #fff3e0;
      border-left: 4px solid #ff9800;
      padding: 12px;
      margin-bottom: 20px;
      border-radius: 4px;
    }

    .backup-info {
      background-color: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      margin-bottom: 20px;

      h3 {
        margin-top: 0;
        margin-bottom: 12px;
      }

      p {
        margin: 4px 0;
      }
    }

    .full-width {
      width: 100%;
      margin-bottom: 16px;
    }

    .error-message {
      color: #f44336;
      padding: 12px;
      background-color: #ffebee;
      border-radius: 4px;
      margin-top: 16px;
    }

    mat-dialog-actions {
      padding: 16px 24px;

      button {
        margin-left: 8px;

        mat-spinner {
          display: inline-block;
          margin-right: 8px;
        }
      }
    }
  `]
})
export class RestoreBackupDialogComponent {
  restoreForm: FormGroup;
  loading = false;
  error: string | null = null;

  constructor(
    private fb: FormBuilder,
    public backupService: BackupService,
    private dialogRef: MatDialogRef<RestoreBackupDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RestoreBackupDialogData
  ) {
    this.restoreForm = this.fb.group({
      target_vmid: [data.vmid, [Validators.required, Validators.min(100)]],
      storage: ['']
    });
  }

  restoreBackup(): void {
    if (this.restoreForm.invalid) {
      return;
    }

    // Confirm before proceeding
    if (!confirm('Are you sure you want to restore this backup? This action cannot be undone.')) {
      return;
    }

    this.loading = true;
    this.error = null;

    const config: BackupRestoreRequest = {
      target_vmid: this.restoreForm.value.target_vmid,
      storage: this.restoreForm.value.storage || undefined
    };

    this.backupService.restoreBackup(this.data.nodeId, this.data.backup.volid, config)
      .subscribe({
        next: (response) => {
          console.log('Restore task started:', response);
          this.dialogRef.close(response);
        },
        error: (error) => {
          console.error('Failed to restore backup:', error);
          this.error = error.error?.detail || 'Failed to restore backup. Please try again.';
          this.loading = false;
        }
      });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
