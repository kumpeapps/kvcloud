import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../shared/material.module';
import { QuotaService, UserQuota } from '../../core/services/quota.service';

@Component({
  selector: 'app-quota-form-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>account_box</mat-icon>
      {{ isEdit ? 'Edit' : 'Create' }} User Quota
    </h2>

    <mat-dialog-content>
      <form [formGroup]="quotaForm" class="quota-form">
        <!-- VM Limits -->
        <div class="section-header">Virtual Machine Limits</div>
        
        <div class="form-row">
          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Max VMs</mat-label>
            <input matInput type="number" formControlName="max_vms" min="0">
            <mat-hint>Maximum total VMs (null = unlimited)</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Max Running VMs</mat-label>
            <input matInput type="number" formControlName="max_running_vms" min="0">
            <mat-hint>Max VMs running simultaneously</mat-hint>
          </mat-form-field>
        </div>

        <!-- Per-VM Resource Limits -->
        <div class="section-header">Per-VM Resource Limits</div>
        
        <div class="form-row">
          <mat-form-field appearance="outline" class="third-width">
            <mat-label>Max CPU per VM</mat-label>
            <input matInput type="number" formControlName="max_cpu_per_vm" min="1">
            <mat-hint>CPU cores</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="third-width">
            <mat-label>Max Memory per VM</mat-label>
            <input matInput type="number" formControlName="max_memory_per_vm" min="512">
            <mat-hint>MB</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="third-width">
            <mat-label>Max Disk per VM</mat-label>
            <input matInput type="number" formControlName="max_disk_per_vm" min="1">
            <mat-hint>GB</mat-hint>
          </mat-form-field>
        </div>

        <!-- Total Resource Limits -->
        <div class="section-header">Total Resource Limits</div>
        
        <div class="form-row">
          <mat-form-field appearance="outline" class="third-width">
            <mat-label>Max Total CPU</mat-label>
            <input matInput type="number" formControlName="max_total_cpu" min="1">
            <mat-hint>Total cores across all VMs</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="third-width">
            <mat-label>Max Total Memory</mat-label>
            <input matInput type="number" formControlName="max_total_memory" min="512">
            <mat-hint>Total MB</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="third-width">
            <mat-label>Max Total Disk</mat-label>
            <input matInput type="number" formControlName="max_total_disk" min="1">
            <mat-hint>Total GB</mat-hint>
          </mat-form-field>
        </div>

        <!-- Storage & Network Limits -->
        <div class="section-header">Storage & Network Limits</div>
        
        <div class="form-row">
          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Max Snapshots per VM</mat-label>
            <input matInput type="number" formControlName="max_snapshots_per_vm" min="0">
          </mat-form-field>

          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Max Backups</mat-label>
            <input matInput type="number" formControlName="max_backups" min="0">
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Max NICs per VM</mat-label>
            <input matInput type="number" formControlName="max_network_interfaces_per_vm" min="1">
          </mat-form-field>

          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Max IP Addresses</mat-label>
            <input matInput type="number" formControlName="max_ip_addresses" min="1">
          </mat-form-field>
        </div>

        <!-- Feature Permissions -->
        <div class="section-header">Feature Permissions</div>
        
        <div class="permissions-grid">
          <mat-checkbox formControlName="can_create_templates">
            Can Create Templates
          </mat-checkbox>
          
          <mat-checkbox formControlName="can_clone_vms">
            Can Clone VMs
          </mat-checkbox>
          
          <mat-checkbox formControlName="can_use_iso_library">
            Can Use ISO Library
          </mat-checkbox>
          
          <mat-checkbox formControlName="can_access_console">
            Can Access Console
          </mat-checkbox>
        </div>

        <!-- Notes -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Notes</mat-label>
          <textarea matInput formControlName="notes" rows="3" 
                    placeholder="Additional notes about this quota..."></textarea>
        </mat-form-field>

        <!-- Current Usage (Edit mode only) -->
        <div *ngIf="quotaData as quota" class="current-usage">
          <div class="section-header">Current Usage</div>
          <div class="usage-stats">
            <div class="usage-item">
              <span class="label">VMs:</span>
              <span class="value">{{ quota.current_vms }}</span>
            </div>
            <div class="usage-item">
              <span class="label">Running VMs:</span>
              <span class="value">{{ quota.current_running_vms }}</span>
            </div>
            <div class="usage-item">
              <span class="label">Total CPU:</span>
              <span class="value">{{ quota.current_total_cpu }} cores</span>
            </div>
            <div class="usage-item">
              <span class="label">Total Memory:</span>
              <span class="value">{{ quota.current_total_memory }} MB</span>
            </div>
            <div class="usage-item">
              <span class="label">Total Disk:</span>
              <span class="value">{{ quota.current_total_disk }} GB</span>
            </div>
          </div>
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()" [disabled]="loading">Cancel</button>
      <button mat-raised-button color="primary" (click)="onSubmit()" [disabled]="loading || quotaForm.invalid">
        {{ loading ? 'Saving...' : (isEdit ? 'Update' : 'Create') }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .quota-form {
      padding: 10px 0;
      
      .section-header {
        font-size: 14px;
        font-weight: 600;
        color: #666;
        margin: 20px 0 10px;
        padding-bottom: 5px;
        border-bottom: 1px solid #eee;
      }

      .form-row {
        display: flex;
        gap: 15px;
        margin-bottom: 10px;

        .half-width {
          flex: 1;
        }

        .third-width {
          flex: 1;
        }
      }

      .full-width {
        width: 100%;
      }

      .permissions-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
        margin: 15px 0;
      }

      .current-usage {
        margin-top: 20px;
        padding: 15px;
        background-color: #f5f5f5;
        border-radius: 4px;

        .usage-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-top: 10px;

          .usage-item {
            .label {
              font-weight: 500;
              margin-right: 5px;
            }

            .value {
              color: #1976d2;
              font-weight: 600;
            }
          }
        }
      }
    }

    h2 {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    mat-dialog-content {
      max-height: 70vh;
      overflow-y: auto;
    }
  `]
})
export class QuotaFormDialogComponent implements OnInit {
  quotaForm: FormGroup;
  loading = false;
  isEdit = false;
  quotaData?: UserQuota;

  constructor(
    private fb: FormBuilder,
    private quotaService: QuotaService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<QuotaFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { userId: number; quota?: UserQuota }
  ) {
    this.quotaForm = this.fb.group({
      max_vms: [null],
      max_running_vms: [null],
      max_cpu_per_vm: [null],
      max_memory_per_vm: [null],
      max_disk_per_vm: [null],
      max_total_cpu: [null],
      max_total_memory: [null],
      max_total_disk: [null],
      max_snapshots_per_vm: [null],
      max_backups: [null],
      max_network_interfaces_per_vm: [null],
      max_ip_addresses: [null],
      can_create_templates: [false],
      can_clone_vms: [true],
      can_use_iso_library: [true],
      can_access_console: [true],
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.isEdit = !!(this.data && this.data.quota);
    this.quotaData = this.data?.quota;
    if (this.quotaData) {
      this.quotaForm.patchValue(this.quotaData);
    }
  }

  onSubmit(): void {
    if (this.quotaForm.invalid) {
      return;
    }

    this.loading = true;
    const formValue = this.quotaForm.value;

    if (this.quotaData) {
      // Update existing quota
      this.quotaService.updateQuota(this.quotaData.id, formValue).subscribe({
        next: () => {
          this.snackBar.open('Quota updated successfully', 'Close', { duration: 3000 });
          this.dialogRef.close(true);
        },
        error: (error) => {
          this.loading = false;
          this.snackBar.open(
            error.error?.detail || 'Failed to update quota',
            'Close',
            { duration: 3000 }
          );
        }
      });
    } else {
      // Create new quota
      const request = { ...formValue, user_id: this.data.userId };
      this.quotaService.createQuota(request).subscribe({
        next: () => {
          this.snackBar.open('Quota created successfully', 'Close', { duration: 3000 });
          this.dialogRef.close(true);
        },
        error: (error) => {
          this.loading = false;
          this.snackBar.open(
            error.error?.detail || 'Failed to create quota',
            'Close',
            { duration: 3000 }
          );
        }
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
