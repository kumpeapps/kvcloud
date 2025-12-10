import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { VMService } from '../../../core/services/vm.service';

export interface CloneVmDialogData {
  nodeId: number;
  sourceVmid: number;
  sourceName: string;
  isTemplate: boolean;
}

@Component({
  selector: 'app-clone-vm-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatIconModule,
    ReactiveFormsModule
  ],
  template: `
    <h2 mat-dialog-title>Clone {{ data.isTemplate ? 'Template' : 'VM' }}</h2>
    
    <mat-dialog-content>
      <div class="source-info">
        <h3>Source {{ data.isTemplate ? 'Template' : 'VM' }}</h3>
        <p><strong>Name:</strong> {{ data.sourceName }}</p>
        <p><strong>VMID:</strong> {{ data.sourceVmid }}</p>
      </div>

      <form [formGroup]="cloneForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>New VMID</mat-label>
          <input matInput 
                 type="number" 
                 formControlName="newid" 
                 placeholder="Enter new VM ID">
          <mat-hint>Must be unique and not already in use</mat-hint>
          <mat-error *ngIf="cloneForm.get('newid')?.hasError('required')">
            VM ID is required
          </mat-error>
          <mat-error *ngIf="cloneForm.get('newid')?.hasError('min')">
            VM ID must be at least 100
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>New VM Name</mat-label>
          <input matInput 
                 formControlName="name" 
                 placeholder="Enter VM name (optional)">
          <mat-hint>Leave empty to auto-generate from template name</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Clone Type</mat-label>
          <mat-select formControlName="full">
            <mat-option [value]="1">Full Clone (Independent copy)</mat-option>
            <mat-option [value]="0">Linked Clone (Faster, depends on source)</mat-option>
          </mat-select>
          <mat-hint>Full clone is recommended for production use</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Target Storage (optional)</mat-label>
          <input matInput 
                 formControlName="storage" 
                 placeholder="Leave empty for default">
          <mat-hint>Storage location for cloned VM disks</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description (optional)</mat-label>
          <textarea matInput 
                    formControlName="description" 
                    rows="3"
                    placeholder="Add a description for this VM..."></textarea>
        </mat-form-field>

        <div class="info-banner">
          <mat-icon>info</mat-icon>
          <div>
            <strong>Clone Process:</strong>
            <p>Cloning {{ data.isTemplate ? 'a template' : 'this VM' }} will create a new independent VM. 
            Full clones take longer but are completely independent. 
            Linked clones are faster but require the source {{ data.isTemplate ? 'template' : 'VM' }} to remain available.</p>
          </div>
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
              (click)="cloneVm()" 
              [disabled]="cloneForm.invalid || loading">
        <mat-spinner *ngIf="loading" diameter="20"></mat-spinner>
        <span *ngIf="!loading">Clone {{ data.isTemplate ? 'Template' : 'VM' }}</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 550px;
      padding-top: 20px;
    }

    .source-info {
      background-color: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      margin-bottom: 20px;

      h3 {
        margin-top: 0;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 500;
        text-transform: uppercase;
        color: rgba(0, 0, 0, 0.6);
      }

      p {
        margin: 4px 0;
      }
    }

    .full-width {
      width: 100%;
      margin-bottom: 16px;
    }

    .info-banner {
      display: flex;
      gap: 12px;
      background-color: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;

      mat-icon {
        color: #2196f3;
        flex-shrink: 0;
      }

      strong {
        display: block;
        margin-bottom: 4px;
      }

      p {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
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
export class CloneVmDialogComponent implements OnInit {
  cloneForm: FormGroup;
  loading = false;
  error: string | null = null;

  constructor(
    private fb: FormBuilder,
    private vmService: VMService,
    private dialogRef: MatDialogRef<CloneVmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CloneVmDialogData
  ) {
    this.cloneForm = this.fb.group({
      newid: ['', [Validators.required, Validators.min(100)]],
      name: [''],
      full: [1, Validators.required],
      storage: [''],
      description: ['']
    });
  }

  ngOnInit(): void {
    // Generate suggested VMID (source + 1000 or next available)
    const suggestedVmid = this.data.sourceVmid + 1000;
    this.cloneForm.patchValue({ newid: suggestedVmid });
  }

  cloneVm(): void {
    if (this.cloneForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = null;

    const formValue = this.cloneForm.value;
    const cloneData = {
      newid: formValue.newid,
      name: formValue.name || undefined,
      full: formValue.full,
      storage: formValue.storage || undefined,
      description: formValue.description || undefined
    };

    this.vmService.cloneVm(this.data.nodeId, this.data.sourceVmid, cloneData)
      .subscribe({
        next: (response) => {
          console.log('Clone task started:', response);
          this.dialogRef.close({
            success: true,
            newVmid: cloneData.newid,
            taskId: response.upid
          });
        },
        error: (error) => {
          console.error('Failed to clone VM:', error);
          this.error = error.error?.detail || 'Failed to clone VM. Please try again.';
          this.loading = false;
        }
      });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
