import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { BackupPlanService, BackupPlan } from '../../core/services/backup-plan.service';
import { BackupPlanFormDialogComponent } from './backup-plan-form-dialog.component';

@Component({
  selector: 'app-backup-plans',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatProgressBarModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Backup Plans</h1>
        <button mat-raised-button color="primary" (click)="createPlan()">
          <mat-icon>backup</mat-icon>
          Create Backup Plan
        </button>
      </div>

      <div class="table-container">
        <table mat-table [dataSource]="plans" class="plans-table">
          <!-- Name Column -->
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let plan">
              <strong>{{ plan.name }}</strong>
              <div class="description" *ngIf="plan.description">
                {{ plan.description }}
              </div>
            </td>
          </ng-container>

          <!-- VM Column -->
          <ng-container matColumnDef="vmid">
            <th mat-header-cell *matHeaderCellDef>VM ID</th>
            <td mat-cell *matCellDef="let plan">{{ plan.vmid }}</td>
          </ng-container>

          <!-- Schedule Column -->
          <ng-container matColumnDef="schedule">
            <th mat-header-cell *matHeaderCellDef>Schedule</th>
            <td mat-cell *matCellDef="let plan">
              <mat-chip color="primary">
                {{ formatSchedule(plan) }}
              </mat-chip>
            </td>
          </ng-container>

          <!-- Storage Column -->
          <ng-container matColumnDef="storage">
            <th mat-header-cell *matHeaderCellDef>Storage</th>
            <td mat-cell *matCellDef="let plan">
              {{ plan.storage }}
              <div class="config-details">
                <mat-chip class="mini-chip">{{ plan.mode }}</mat-chip>
                <mat-chip class="mini-chip">{{ plan.compress }}</mat-chip>
              </div>
            </td>
          </ng-container>

          <!-- Retention Column -->
          <ng-container matColumnDef="retention">
            <th mat-header-cell *matHeaderCellDef>Retention</th>
            <td mat-cell *matCellDef="let plan">
              <span *ngIf="plan.retention_count">Keep {{ plan.retention_count }}</span>
              <span *ngIf="plan.retention_days">{{ plan.retention_days }}d</span>
              <span *ngIf="!plan.retention_count && !plan.retention_days">None</span>
            </td>
          </ng-container>

          <!-- Next Run Column -->
          <ng-container matColumnDef="next_run">
            <th mat-header-cell *matHeaderCellDef>Next Run</th>
            <td mat-cell *matCellDef="let plan">
              <span *ngIf="plan.next_run_at">
                {{ plan.next_run_at | date: 'short' }}
              </span>
              <span *ngIf="!plan.next_run_at">-</span>
            </td>
          </ng-container>

          <!-- Status Column -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let plan">
              <mat-slide-toggle
                [checked]="plan.is_active"
                (change)="togglePlan(plan)">
                {{ plan.is_active ? 'Active' : 'Inactive' }}
              </mat-slide-toggle>
              <div class="stats">
                <mat-chip 
                  [color]="plan.last_status === 'success' ? 'primary' : plan.last_status === 'failed' ? 'warn' : 'accent'"
                  class="mini-chip"
                  *ngIf="plan.last_status">
                  {{ plan.last_status }}
                </mat-chip>
                <span class="success-rate" *ngIf="plan.run_count > 0">
                  {{ getSuccessRate(plan) }}% success
                </span>
              </div>
            </td>
          </ng-container>

          <!-- Stats Column -->
          <ng-container matColumnDef="stats">
            <th mat-header-cell *matHeaderCellDef>Runs</th>
            <td mat-cell *matCellDef="let plan">
              <div class="run-stats">
                <div>Total: {{ plan.run_count }}</div>
                <div class="success-count">✓ {{ plan.success_count }}</div>
                <div class="failure-count" *ngIf="plan.failure_count > 0">✗ {{ plan.failure_count }}</div>
              </div>
            </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>Actions</th>
            <td mat-cell *matCellDef="let plan">
              <button mat-icon-button (click)="runNow(plan)" matTooltip="Run now">
                <mat-icon>play_arrow</mat-icon>
              </button>
              <button mat-icon-button (click)="editPlan(plan)" matTooltip="Edit">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="deletePlan(plan)" matTooltip="Delete">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 24px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .page-header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 500;
    }

    .table-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .plans-table {
      width: 100%;
    }

    .description {
      font-size: 12px;
      opacity: 0.6;
      margin-top: 4px;
    }

    .config-details {
      display: flex;
      gap: 4px;
      margin-top: 4px;
    }

    .stats {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 8px;
    }

    .success-rate {
      font-size: 11px;
      opacity: 0.6;
    }

    .run-stats {
      font-size: 12px;
      line-height: 1.5;
    }

    .success-count {
      color: #4caf50;
    }

    .failure-count {
      color: #f44336;
    }

    .mini-chip {
      font-size: 10px;
      height: 20px;
    }

    mat-chip {
      font-size: 12px;
    }
  `]
})
export class BackupPlansComponent implements OnInit {
  plans: BackupPlan[] = [];
  displayedColumns = ['name', 'vmid', 'schedule', 'storage', 'retention', 'next_run', 'status', 'stats', 'actions'];

  constructor(
    private planService: BackupPlanService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadPlans();
  }

  loadPlans(): void {
    this.planService.getPlans().subscribe({
      next: (plans) => {
        this.plans = plans;
      },
      error: (error) => {
        this.snackBar.open('Failed to load backup plans', 'Close', { duration: 3000 });
        console.error('Error loading plans:', error);
      }
    });
  }

  createPlan(): void {
    const dialogRef = this.dialog.open(BackupPlanFormDialogComponent, {
      width: '700px',
      data: { mode: 'create' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadPlans();
        this.snackBar.open('Backup plan created successfully', 'Close', { duration: 3000 });
      }
    });
  }

  editPlan(plan: BackupPlan): void {
    const dialogRef = this.dialog.open(BackupPlanFormDialogComponent, {
      width: '700px',
      data: { mode: 'edit', plan }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadPlans();
        this.snackBar.open('Backup plan updated successfully', 'Close', { duration: 3000 });
      }
    });
  }

  togglePlan(plan: BackupPlan): void {
    this.planService.updatePlan(plan.id, { 
      is_active: !plan.is_active 
    }).subscribe({
      next: () => {
        plan.is_active = !plan.is_active;
        this.snackBar.open(
          `Backup plan ${plan.is_active ? 'activated' : 'deactivated'}`,
          'Close',
          { duration: 3000 }
        );
      },
      error: (error) => {
        this.snackBar.open('Failed to update backup plan', 'Close', { duration: 3000 });
        console.error('Error updating plan:', error);
      }
    });
  }

  runNow(plan: BackupPlan): void {
    if (!confirm(`Run backup plan "${plan.name}" now?`)) {
      return;
    }

    this.planService.runPlan(plan.id).subscribe({
      next: () => {
        this.snackBar.open('Backup plan triggered successfully', 'Close', { duration: 3000 });
        setTimeout(() => this.loadPlans(), 1000);
      },
      error: (error) => {
        this.snackBar.open('Failed to run backup plan', 'Close', { duration: 3000 });
        console.error('Error running plan:', error);
      }
    });
  }

  deletePlan(plan: BackupPlan): void {
    if (!confirm(`Are you sure you want to delete backup plan "${plan.name}"?`)) {
      return;
    }

    this.planService.deletePlan(plan.id).subscribe({
      next: () => {
        this.loadPlans();
        this.snackBar.open('Backup plan deleted successfully', 'Close', { duration: 3000 });
      },
      error: (error) => {
        this.snackBar.open('Failed to delete backup plan', 'Close', { duration: 3000 });
        console.error('Error deleting plan:', error);
      }
    });
  }

  formatSchedule(plan: BackupPlan): string {
    switch (plan.schedule_type) {
      case 'hourly':
        return `Hourly at :${plan.minute || 0}`;
      case 'daily':
        return `Daily at ${plan.hour || 0}:${(plan.minute || 0).toString().padStart(2, '0')}`;
      case 'weekly':
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `Weekly ${days[plan.day_of_week || 0]} ${plan.hour || 0}:${(plan.minute || 0).toString().padStart(2, '0')}`;
      case 'monthly':
        return `Monthly day ${plan.day_of_month || 1} at ${plan.hour || 0}:${(plan.minute || 0).toString().padStart(2, '0')}`;
      case 'custom':
        return plan.cron_expression || 'Custom';
      default:
        return plan.schedule_type;
    }
  }

  getSuccessRate(plan: BackupPlan): number {
    if (plan.run_count === 0) return 0;
    return Math.round((plan.success_count / plan.run_count) * 100);
  }
}
