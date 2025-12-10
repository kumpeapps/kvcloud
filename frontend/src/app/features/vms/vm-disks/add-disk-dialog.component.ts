import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-add-disk-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule
  ],
  template: `
    <h2 mat-dialog-title>Add New Disk</h2>
    <mat-dialog-content>
      <form [formGroup]="diskForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Storage</mat-label>
          <input matInput formControlName="storage" placeholder="local-lvm">
          @if (diskForm.get('storage')?.hasError('required')) {
            <mat-error>Storage is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Size (GB)</mat-label>
          <input matInput type="number" formControlName="size" placeholder="32">
          @if (diskForm.get('size')?.hasError('required')) {
            <mat-error>Size is required</mat-error>
          }
          @if (diskForm.get('size')?.hasError('min')) {
            <mat-error>Size must be at least 1 GB</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Disk Type</mat-label>
          <mat-select formControlName="type">
            <mat-option value="scsi">SCSI</mat-option>
            <mat-option value="sata">SATA</mat-option>
            <mat-option value="virtio">VirtIO</mat-option>
            <mat-option value="ide">IDE</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Format</mat-label>
          <mat-select formControlName="format">
            <mat-option value="raw">Raw</mat-option>
            <mat-option value="qcow2">QCOW2</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Cache Mode</mat-label>
          <mat-select formControlName="cache">
            <mat-option value="none">None</mat-option>
            <mat-option value="writeback">Writeback</mat-option>
            <mat-option value="writethrough">Writethrough</mat-option>
            <mat-option value="directsync">Directsync</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Discard/TRIM</mat-label>
          <mat-select formControlName="discard">
            <mat-option value="on">On</mat-option>
            <mat-option value="off">Off</mat-option>
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" 
              (click)="onSubmit()" 
              [disabled]="!diskForm.valid">
        Add Disk
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 400px;
      padding: 20px 24px;
    }

    .full-width {
      width: 100%;
      margin-bottom: 15px;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }
  `]
})
export class AddDiskDialogComponent {
  diskForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddDiskDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.diskForm = this.fb.group({
      storage: ['local-lvm', Validators.required],
      size: [32, [Validators.required, Validators.min(1)]],
      type: ['scsi', Validators.required],
      format: ['raw', Validators.required],
      cache: ['none'],
      discard: ['on']
    });
  }

  onCancel() {
    this.dialogRef.close();
  }

  onSubmit() {
    if (this.diskForm.valid) {
      this.dialogRef.close(this.diskForm.value);
    }
  }
}
