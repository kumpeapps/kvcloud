import { Component, Inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../../shared/material.module';
import { VMService } from '../../../core/services/vm.service';
import { ISOService, ISO } from '../../../core/services/iso.service';

export interface MountISODialogData {
  nodeId: number;
  vmid: number;
  vmName: string;
}

@Component({
  selector: 'app-vm-mount-iso-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    ReactiveFormsModule
  ],
  template: `
    <h2 mat-dialog-title>Mount ISO to {{ data.vmName }}</h2>
    
    <mat-dialog-content>
      <form [formGroup]="mountForm">
        <div *ngIf="loading()" class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Loading available ISOs...</p>
        </div>

        <div *ngIf="!loading()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Select ISO</mat-label>
            <mat-select formControlName="isoVolid" required>
              <mat-option *ngFor="let iso of isos()" [value]="iso.volid">
                {{ iso.name }} ({{ formatSize(iso.size) }})
              </mat-option>
            </mat-select>
            <mat-error *ngIf="mountForm.get('isoVolid')?.hasError('required')">
              ISO selection is required
            </mat-error>
          </mat-form-field>

          <div *ngIf="isos().length === 0" class="empty-state">
            <mat-icon>disc_full</mat-icon>
            <p>No ISO images available on this node.</p>
            <p class="hint">Upload ISO images from the ISOs page first.</p>
          </div>
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()" [disabled]="submitting()">
        Cancel
      </button>
      <button 
        mat-raised-button 
        color="primary" 
        (click)="onMount()" 
        [disabled]="mountForm.invalid || loading() || submitting() || isos().length === 0">
        <mat-spinner *ngIf="submitting()" diameter="16"></mat-spinner>
        <span *ngIf="!submitting()">Mount ISO</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width {
      width: 100%;
      margin-bottom: 16px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
      gap: 16px;
    }

    .empty-state {
      text-align: center;
      padding: 32px;
      color: rgba(0, 0, 0, 0.54);
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: rgba(0, 0, 0, 0.38);
    }

    .empty-state p {
      margin: 8px 0;
    }

    .empty-state .hint {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.38);
    }

    button mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }
  `]
})
export class VMMountISODialogComponent implements OnInit {
  mountForm: FormGroup;
  isos = signal<ISO[]>([]);
  loading = signal(true);
  submitting = signal(false);

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<VMMountISODialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MountISODialogData,
    private vmService: VMService,
    private isoService: ISOService,
    private snackBar: MatSnackBar
  ) {
    this.mountForm = this.fb.group({
      isoVolid: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.loadISOs();
  }

  loadISOs(): void {
    this.loading.set(true);
    this.isoService.listNodeISOs(this.data.nodeId).subscribe({
      next: (isos) => {
        this.isos.set(isos);
        this.loading.set(false);
      },
      error: (err: any) => {
        console.error('Error loading ISOs:', err);
        this.snackBar.open('Failed to load available ISOs', 'Close', { duration: 5000 });
        this.loading.set(false);
      }
    });
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  onMount(): void {
    if (this.mountForm.invalid) {
      return;
    }

    this.submitting.set(true);
    const isoVolid = this.mountForm.get('isoVolid')?.value;

    this.vmService.mountISO(this.data.nodeId, this.data.vmid, isoVolid).subscribe({
      next: () => {
        this.snackBar.open('ISO mounted successfully', 'Close', { duration: 3000 });
        this.dialogRef.close(true);
      },
      error: (err: any) => {
        console.error('Error mounting ISO:', err);
        this.snackBar.open(
          `Failed to mount ISO: ${err.error?.detail || 'Unknown error'}`,
          'Close',
          { duration: 5000 }
        );
        this.submitting.set(false);
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
