import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-resize-disk-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  template: `
    <h2 mat-dialog-title>Resize Disk {{ data.disk.device }}</h2>
    <mat-dialog-content>
      <p class="info-text">
        <strong>Note:</strong> You can only increase disk size. The size parameter should be in the format "+XG" (e.g., "+10G" to add 10GB).
      </p>
      <form [formGroup]="resizeForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Size to Add</mat-label>
          <input matInput formControlName="size" placeholder="+10G">
          @if (resizeForm.get('size')?.hasError('required')) {
            <mat-error>Size is required</mat-error>
          }
          @if (resizeForm.get('size')?.hasError('pattern')) {
            <mat-error>Size must be in format +XG (e.g., +10G)</mat-error>
          }
          <mat-hint>Enter size in format: +10G</mat-hint>
        </mat-form-field>

        <div class="current-info">
          <p><strong>Current Storage:</strong> {{ data.disk.storage }}</p>
          <p><strong>Current Size:</strong> {{ data.disk.size || 'Unknown' }}</p>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" 
              (click)="onSubmit()" 
              [disabled]="!resizeForm.valid">
        Resize
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 400px;
      padding: 20px 24px;
    }

    .info-text {
      background-color: #e3f2fd;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 20px;
      color: #1976d2;
    }

    .full-width {
      width: 100%;
      margin-bottom: 15px;
    }

    .current-info {
      background-color: #f5f5f5;
      padding: 12px;
      border-radius: 4px;
      margin-top: 15px;
    }

    .current-info p {
      margin: 5px 0;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }
  `]
})
export class ResizeDiskDialogComponent {
  resizeForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<ResizeDiskDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.resizeForm = this.fb.group({
      size: ['', [Validators.required, Validators.pattern(/^\+\d+[KMGT]$/)]]
    });
  }

  onCancel() {
    this.dialogRef.close();
  }

  onSubmit() {
    if (this.resizeForm.valid) {
      this.dialogRef.close(this.resizeForm.value);
    }
  }
}
