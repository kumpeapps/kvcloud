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

import { SnapshotScheduleService, SnapshotSchedule } from '../../core/services/snapshot-schedule.service';
import { SnapshotScheduleFormDialogComponent } from './snapshot-schedule-form-dialog.component';

@Component({
  selector: 'app-snapshot-schedules',
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
    MatSlideToggleModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Snapshot Schedules</h1>
        <button mat-raised-button color="primary" (click)="createSchedule()">
          <mat-icon>schedule</mat-icon>
          Create Schedule
        </button>
      </div>

      <div class="table-container">
        <table mat-table [dataSource]="schedules" class="schedules-table">
          <!-- Name Column -->
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let schedule">
              <strong>{{ schedule.name }}</strong>
              <div class="description" *ngIf="schedule.description">
                {{ schedule.description }}
              </div>
            </td>
          </ng-container>

          <!-- VM Column -->
          <ng-container matColumnDef="vmid">
            <th mat-header-cell *matHeaderCellDef>VM ID</th>
            <td mat-cell *matCellDef="let schedule">{{ schedule.vmid }}</td>
          </ng-container>

          <!-- Schedule Column -->
          <ng-container matColumnDef="schedule">
            <th mat-header-cell *matHeaderCellDef>Schedule</th>
            <td mat-cell *matCellDef="let schedule">
              <mat-chip [color]="getScheduleColor(schedule.schedule_type)">
                {{ formatSchedule(schedule) }}
              </mat-chip>
            </td>
          </ng-container>

          <!-- Retention Column -->
          <ng-container matColumnDef="retention">
            <th mat-header-cell *matHeaderCellDef>Retention</th>
            <td mat-cell *matCellDef="let schedule">
              <span *ngIf="schedule.retention_count">Keep {{ schedule.retention_count }}</span>
              <span *ngIf="schedule.retention_days">{{ schedule.retention_days }}d</span>
              <span *ngIf="!schedule.retention_count && !schedule.retention_days">None</span>
            </td>
          </ng-container>

          <!-- Next Run Column -->
          <ng-container matColumnDef="next_run">
            <th mat-header-cell *matHeaderCellDef>Next Run</th>
            <td mat-cell *matCellDef="let schedule">
              <span *ngIf="schedule.next_run_at">
                {{ schedule.next_run_at | date: 'short' }}
              </span>
              <span *ngIf="!schedule.next_run_at">-</span>
            </td>
          </ng-container>

          <!-- Status Column -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let schedule">
              <mat-slide-toggle
                [checked]="schedule.is_active"
                (change)="toggleSchedule(schedule)">
                {{ schedule.is_active ? 'Active' : 'Inactive' }}
              </mat-slide-toggle>
              <div class="last-status" *ngIf="schedule.last_status">
                <mat-chip 
                  [color]="schedule.last_status === 'success' ? 'primary' : 'warn'"
                  class="mini-chip">
                  {{ schedule.last_status }}
                </mat-chip>
              </div>
            </td>
          </ng-container>

          <!-- Stats Column -->
          <ng-container matColumnDef="stats">
            <th mat-header-cell *matHeaderCellDef>Runs</th>
            <td mat-cell *matCellDef="let schedule">
              {{ schedule.run_count }}
            </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>Actions</th>
            <td mat-cell *matCellDef="let schedule">
              <button mat-icon-button (click)="runNow(schedule)" matTooltip="Run now">
                <mat-icon>play_arrow</mat-icon>
              </button>
              <button mat-icon-button (click)="editSchedule(schedule)" matTooltip="Edit">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="deleteSchedule(schedule)" matTooltip="Delete">
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

    .schedules-table {
      width: 100%;
    }

    .description {
      font-size: 12px;
      opacity: 0.6;
      margin-top: 4px;
    }

    .last-status {
      margin-top: 4px;
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
export class SnapshotSchedulesComponent implements OnInit {
  schedules: SnapshotSchedule[] = [];
  displayedColumns = ['name', 'vmid', 'schedule', 'retention', 'next_run', 'status', 'stats', 'actions'];

  constructor(
    private scheduleService: SnapshotScheduleService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadSchedules();
  }

  loadSchedules(): void {
    this.scheduleService.getSchedules().subscribe({
      next: (schedules) => {
        this.schedules = schedules;
      },
      error: (error) => {
        this.snackBar.open('Failed to load schedules', 'Close', { duration: 3000 });
        console.error('Error loading schedules:', error);
      }
    });
  }

  createSchedule(): void {
    const dialogRef = this.dialog.open(SnapshotScheduleFormDialogComponent, {
      width: '700px',
      data: { mode: 'create' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadSchedules();
        this.snackBar.open('Schedule created successfully', 'Close', { duration: 3000 });
      }
    });
  }

  editSchedule(schedule: SnapshotSchedule): void {
    const dialogRef = this.dialog.open(SnapshotScheduleFormDialogComponent, {
      width: '700px',
      data: { mode: 'edit', schedule }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadSchedules();
        this.snackBar.open('Schedule updated successfully', 'Close', { duration: 3000 });
      }
    });
  }

  toggleSchedule(schedule: SnapshotSchedule): void {
    this.scheduleService.updateSchedule(schedule.id, { 
      is_active: !schedule.is_active 
    }).subscribe({
      next: () => {
        schedule.is_active = !schedule.is_active;
        this.snackBar.open(
          `Schedule ${schedule.is_active ? 'activated' : 'deactivated'}`,
          'Close',
          { duration: 3000 }
        );
      },
      error: (error) => {
        this.snackBar.open('Failed to update schedule', 'Close', { duration: 3000 });
        console.error('Error updating schedule:', error);
      }
    });
  }

  runNow(schedule: SnapshotSchedule): void {
    if (!confirm(`Run snapshot schedule "${schedule.name}" now?`)) {
      return;
    }

    this.scheduleService.runSchedule(schedule.id).subscribe({
      next: () => {
        this.snackBar.open('Schedule triggered successfully', 'Close', { duration: 3000 });
        setTimeout(() => this.loadSchedules(), 1000);
      },
      error: (error) => {
        this.snackBar.open('Failed to run schedule', 'Close', { duration: 3000 });
        console.error('Error running schedule:', error);
      }
    });
  }

  deleteSchedule(schedule: SnapshotSchedule): void {
    if (!confirm(`Are you sure you want to delete schedule "${schedule.name}"?`)) {
      return;
    }

    this.scheduleService.deleteSchedule(schedule.id).subscribe({
      next: () => {
        this.loadSchedules();
        this.snackBar.open('Schedule deleted successfully', 'Close', { duration: 3000 });
      },
      error: (error) => {
        this.snackBar.open('Failed to delete schedule', 'Close', { duration: 3000 });
        console.error('Error deleting schedule:', error);
      }
    });
  }

  formatSchedule(schedule: SnapshotSchedule): string {
    switch (schedule.schedule_type) {
      case 'hourly':
        return `Hourly at :${schedule.minute || 0}`;
      case 'daily':
        return `Daily at ${schedule.hour || 0}:${(schedule.minute || 0).toString().padStart(2, '0')}`;
      case 'weekly':
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `Weekly ${days[schedule.day_of_week || 0]} ${schedule.hour || 0}:${(schedule.minute || 0).toString().padStart(2, '0')}`;
      case 'monthly':
        return `Monthly day ${schedule.day_of_month || 1} at ${schedule.hour || 0}:${(schedule.minute || 0).toString().padStart(2, '0')}`;
      case 'custom':
        return schedule.cron_expression || 'Custom';
      default:
        return schedule.schedule_type;
    }
  }

  getScheduleColor(type: string): string {
    const colorMap: { [key: string]: string } = {
      'hourly': 'primary',
      'daily': 'accent',
      'weekly': 'primary',
      'monthly': 'accent',
      'custom': 'warn'
    };
    return colorMap[type] || 'primary';
  }
}
