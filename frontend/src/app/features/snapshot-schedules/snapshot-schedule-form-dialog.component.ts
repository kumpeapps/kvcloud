import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { SnapshotScheduleService } from '../../core/services/snapshot-schedule.service';
import { ClusterService } from '../../core/services/cluster.service';

@Component({
  selector: 'app-snapshot-schedule-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSnackBarModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'Create' : 'Edit' }} Snapshot Schedule</h2>
    
    <mat-dialog-content>
      <form [formGroup]="scheduleForm" class="schedule-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" placeholder="Daily backup">
          <mat-error *ngIf="scheduleForm.get('name')?.hasError('required')">
            Name is required
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <textarea matInput formControlName="description" rows="2"></textarea>
        </mat-form-field>

        <div class="form-row">
          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Node</mat-label>
            <mat-select formControlName="node_id">
              <mat-option *ngFor="let node of nodes" [value]="node.id">
                {{ node.name }}
              </mat-option>
            </mat-select>
            <mat-error *ngIf="scheduleForm.get('node_id')?.hasError('required')">
              Node is required
            </mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline" class="half-width">
            <mat-label>VM ID</mat-label>
            <input matInput type="number" formControlName="vmid">
            <mat-error *ngIf="scheduleForm.get('vmid')?.hasError('required')">
              VM ID is required
            </mat-error>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Schedule Type</mat-label>
          <mat-select formControlName="schedule_type" (selectionChange)="onScheduleTypeChange()">
            <mat-option value="hourly">Hourly</mat-option>
            <mat-option value="daily">Daily</mat-option>
            <mat-option value="weekly">Weekly</mat-option>
            <mat-option value="monthly">Monthly</mat-option>
            <mat-option value="custom">Custom (Cron)</mat-option>
          </mat-select>
        </mat-form-field>

        <!-- Hourly Schedule -->
        <div *ngIf="scheduleForm.get('schedule_type')?.value === 'hourly'" class="schedule-config">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Minute</mat-label>
            <input matInput type="number" formControlName="minute" min="0" max="59">
            <mat-hint>At which minute of the hour (0-59)</mat-hint>
          </mat-form-field>
        </div>

        <!-- Daily Schedule -->
        <div *ngIf="scheduleForm.get('schedule_type')?.value === 'daily'" class="schedule-config">
          <div class="form-row">
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>Hour</mat-label>
              <input matInput type="number" formControlName="hour" min="0" max="23">
            </mat-form-field>
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>Minute</mat-label>
              <input matInput type="number" formControlName="minute" min="0" max="59">
            </mat-form-field>
          </div>
        </div>

        <!-- Weekly Schedule -->
        <div *ngIf="scheduleForm.get('schedule_type')?.value === 'weekly'" class="schedule-config">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Day of Week</mat-label>
            <mat-select formControlName="day_of_week">
              <mat-option [value]="0">Sunday</mat-option>
              <mat-option [value]="1">Monday</mat-option>
              <mat-option [value]="2">Tuesday</mat-option>
              <mat-option [value]="3">Wednesday</mat-option>
              <mat-option [value]="4">Thursday</mat-option>
              <mat-option [value]="5">Friday</mat-option>
              <mat-option [value]="6">Saturday</mat-option>
            </mat-select>
          </mat-form-field>
          <div class="form-row">
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>Hour</mat-label>
              <input matInput type="number" formControlName="hour" min="0" max="23">
            </mat-form-field>
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>Minute</mat-label>
              <input matInput type="number" formControlName="minute" min="0" max="59">
            </mat-form-field>
          </div>
        </div>

        <!-- Monthly Schedule -->
        <div *ngIf="scheduleForm.get('schedule_type')?.value === 'monthly'" class="schedule-config">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Day of Month</mat-label>
            <input matInput type="number" formControlName="day_of_month" min="1" max="31">
          </mat-form-field>
          <div class="form-row">
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>Hour</mat-label>
              <input matInput type="number" formControlName="hour" min="0" max="23">
            </mat-form-field>
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>Minute</mat-label>
              <input matInput type="number" formControlName="minute" min="0" max="59">
            </mat-form-field>
          </div>
        </div>

        <!-- Custom Cron -->
        <div *ngIf="scheduleForm.get('schedule_type')?.value === 'custom'" class="schedule-config">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Cron Expression</mat-label>
            <input matInput formControlName="cron_expression" placeholder="0 2 * * *">
            <mat-hint>Standard cron format: minute hour day month day-of-week</mat-hint>
          </mat-form-field>
        </div>

        <!-- Retention -->
        <div class="section-header">Retention Policy</div>
        <div class="form-row">
          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Keep Last N Snapshots</mat-label>
            <input matInput type="number" formControlName="retention_count" min="0">
            <mat-hint>0 = keep all</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" class="half-width">
            <mat-label>Keep For Days</mat-label>
            <input matInput type="number" formControlName="retention_days" min="0">
            <mat-hint>0 = keep forever</mat-hint>
          </mat-form-field>
        </div>

        <!-- Options -->
        <div class="section-header">Options</div>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Naming Pattern</mat-label>
          <input matInput formControlName="naming_pattern" placeholder="auto-&#123;timestamp&#125;">
          <mat-hint>Use &#123;timestamp&#125; for automatic timestamp</mat-hint>
        </mat-form-field>

        <div class="checkbox-row">
          <mat-checkbox formControlName="include_ram">Include RAM State</mat-checkbox>
          <mat-checkbox formControlName="is_active">Active</mat-checkbox>
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button 
        mat-raised-button 
        color="primary" 
        (click)="onSubmit()"
        [disabled]="!scheduleForm.valid || loading">
        {{ loading ? 'Saving...' : 'Save' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .schedule-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px 0;
      min-width: 500px;
    }

    .full-width {
      width: 100%;
    }

    .form-row {
      display: flex;
      gap: 16px;
    }

    .half-width {
      flex: 1;
    }

    .checkbox-row {
      display: flex;
      gap: 24px;
      align-items: center;
    }

    .section-header {
      font-weight: 500;
      font-size: 14px;
      opacity: 0.87;
      margin-top: 8px;
      margin-bottom: -8px;
    }

    .schedule-config {
      padding: 12px;
      background: rgba(0, 0, 0, 0.02);
      border-radius: 4px;
    }

    mat-dialog-content {
      max-height: 70vh;
      overflow-y: auto;
    }
  `]
})
export class SnapshotScheduleFormDialogComponent implements OnInit {
  scheduleForm: FormGroup;
  loading = false;
  nodes: any[] = [];

  constructor(
    private fb: FormBuilder,
    private scheduleService: SnapshotScheduleService,
    private clusterService: ClusterService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<SnapshotScheduleFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { mode: 'create' | 'edit'; schedule?: any }
  ) {
    this.scheduleForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      node_id: [null, Validators.required],
      vmid: [null, [Validators.required, Validators.min(100)]],
      schedule_type: ['daily', Validators.required],
      cron_expression: [''],
      hour: [0],
      minute: [0],
      day_of_week: [0],
      day_of_month: [1],
      retention_count: [0],
      retention_days: [0],
      naming_pattern: ['auto-{timestamp}'],
      include_ram: [false],
      is_active: [true]
    });
  }

  ngOnInit(): void {
    this.loadNodes();

    if (this.data.mode === 'edit' && this.data.schedule) {
      this.scheduleForm.patchValue(this.data.schedule);
    }

    this.onScheduleTypeChange();
  }

  loadNodes(): void {
    this.clusterService.getNodes().subscribe({
      next: (nodes) => {
        this.nodes = nodes;
      },
      error: (error) => {
        console.error('Error loading nodes:', error);
      }
    });
  }

  onScheduleTypeChange(): void {
    const type = this.scheduleForm.get('schedule_type')?.value;
    
    // Reset validators
    this.scheduleForm.get('cron_expression')?.clearValidators();
    this.scheduleForm.get('hour')?.clearValidators();
    this.scheduleForm.get('minute')?.clearValidators();
    this.scheduleForm.get('day_of_week')?.clearValidators();
    this.scheduleForm.get('day_of_month')?.clearValidators();

    // Set validators based on type
    if (type === 'custom') {
      this.scheduleForm.get('cron_expression')?.setValidators([Validators.required]);
    } else if (type === 'hourly') {
      this.scheduleForm.get('minute')?.setValidators([Validators.required, Validators.min(0), Validators.max(59)]);
    } else if (type === 'daily') {
      this.scheduleForm.get('hour')?.setValidators([Validators.required, Validators.min(0), Validators.max(23)]);
      this.scheduleForm.get('minute')?.setValidators([Validators.required, Validators.min(0), Validators.max(59)]);
    } else if (type === 'weekly') {
      this.scheduleForm.get('day_of_week')?.setValidators([Validators.required]);
      this.scheduleForm.get('hour')?.setValidators([Validators.required, Validators.min(0), Validators.max(23)]);
      this.scheduleForm.get('minute')?.setValidators([Validators.required, Validators.min(0), Validators.max(59)]);
    } else if (type === 'monthly') {
      this.scheduleForm.get('day_of_month')?.setValidators([Validators.required, Validators.min(1), Validators.max(31)]);
      this.scheduleForm.get('hour')?.setValidators([Validators.required, Validators.min(0), Validators.max(23)]);
      this.scheduleForm.get('minute')?.setValidators([Validators.required, Validators.min(0), Validators.max(59)]);
    }

    // Update validity
    Object.keys(this.scheduleForm.controls).forEach(key => {
      this.scheduleForm.get(key)?.updateValueAndValidity();
    });
  }

  onSubmit(): void {
    if (this.scheduleForm.invalid) {
      return;
    }

    this.loading = true;
    const formValue = this.scheduleForm.value;

    if (this.data.mode === 'create') {
      this.scheduleService.createSchedule(formValue).subscribe({
        next: () => {
          this.dialogRef.close(true);
        },
        error: (error) => {
          this.loading = false;
          this.snackBar.open(
            error.error?.detail || 'Failed to create schedule',
            'Close',
            { duration: 3000 }
          );
        }
      });
    } else {
      this.scheduleService.updateSchedule(this.data.schedule.id, formValue).subscribe({
        next: () => {
          this.dialogRef.close(true);
        },
        error: (error) => {
          this.loading = false;
          this.snackBar.open(
            error.error?.detail || 'Failed to update schedule',
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
