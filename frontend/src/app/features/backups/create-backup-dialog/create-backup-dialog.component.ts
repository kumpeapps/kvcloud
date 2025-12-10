import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BackupService, BackupCreateRequest } from '../../../core/services/backup.service';

export interface CreateBackupDialogData {
  nodeId: number;
  vmid: number;
}

@Component({
  selector: 'app-create-backup-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule
  ],
  template: `
    <h2 mat-dialog-title>Create VM Backup</h2>
    
    <mat-dialog-content>
      <form [formGroup]="backupForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Storage</mat-label>
          <input matInput formControlName="storage" placeholder="local">
          <mat-hint>Storage location for the backup</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Backup Mode</mat-label>
          <mat-select formControlName="mode">
            <mat-option value="snapshot">Snapshot (fastest - VM keeps running)</mat-option>
            <mat-option value="suspend">Suspend (safe - VM briefly suspended)</mat-option>
            <mat-option value="stop">Stop (safest - VM stopped during backup)</mat-option>
          </mat-select>
          <mat-hint>How to handle the VM during backup</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Compression</mat-label>
          <mat-select formControlName="compress">
            <mat-option value="zstd">ZSTD (best compression, recommended)</mat-option>
            <mat-option value="gzip">GZIP (balanced)</mat-option>
            <mat-option value="lzo">LZO (fast)</mat-option>
            <mat-option value="none">None (fastest, larger files)</mat-option>
          </mat-select>
          <mat-hint>Compression algorithm</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Notes (optional)</mat-label>
          <textarea matInput 
                    formControlName="notes" 
                    rows="3" 
                    placeholder="Add notes about this backup..."></textarea>
          <mat-hint>Optional description for this backup</mat-hint>
        </mat-form-field>

        <div class="info-section">
          <p><strong>VM ID:</strong> {{ data.vmid }}</p>
          <p><strong>Node ID:</strong> {{ data.nodeId }}</p>
        </div>

        <div *ngIf="error" class="error-message">
          {{ error }}
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="loading">Cancel</button>
      <button mat-raised-button 
              color="primary" 
              (click)="createBackup()" 
              [disabled]="backupForm.invalid || loading">
        <mat-spinner *ngIf="loading" diameter="20"></mat-spinner>
        <span *ngIf="!loading">Create Backup</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 450px;
      padding-top: 20px;
    }

    .full-width {
      width: 100%;
      margin-bottom: 16px;
    }

    .info-section {
      background-color: #f5f5f5;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;

      p {
        margin: 4px 0;
      }
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
export class CreateBackupDialogComponent {
  backupForm: FormGroup;
  loading = false;
  error: string | null = null;

  constructor(
    private fb: FormBuilder,
    private backupService: BackupService,
    private dialogRef: MatDialogRef<CreateBackupDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CreateBackupDialogData
  ) {
    this.backupForm = this.fb.group({
      storage: ['local', Validators.required],
      mode: ['snapshot', Validators.required],
      compress: ['zstd', Validators.required],
      notes: ['']
    });
  }

  createBackup(): void {
    if (this.backupForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = null;

    const config: BackupCreateRequest = this.backupForm.value;

    this.backupService.createBackup(this.data.nodeId, this.data.vmid, config)
      .subscribe({
        next: (response) => {
          console.log('Backup task started:', response);
          this.dialogRef.close(response);
        },
        error: (error) => {
          console.error('Failed to create backup:', error);
          this.error = error.error?.detail || 'Failed to create backup. Please try again.';
          this.loading = false;
        }
      });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
