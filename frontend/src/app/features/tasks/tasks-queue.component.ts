import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TasksService, TaskStatus } from '../../core/services/tasks.service';
import { Observable, timer } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { MaterialModule } from '../../shared/material.module';

@Component({
  selector: 'app-tasks-queue',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  template: `
    <div class="tasks-page">
      <h2>Task Queue</h2>
      <p class="hint">Long-running operations like template creation appear here.</p>

      <mat-tab-group>
        <mat-tab label="Active">
          <div *ngIf="(tasks$ | async) as tasks; else loading">
            <ng-container *ngIf="tasks.length; else empty">
              <table class="tasks-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Message</th>
                    <th>Image</th>
                    <th>Template VMID</th>
                    <th>Node</th>
                    <th>Started</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let t of tasks">
                    <td>{{ t.id }}</td>
                    <td>{{ t.status }}</td>
                    <td>
                      <div class="progress">
                        <div class="bar" [style.width.%]="t.progress"></div>
                      </div>
                      <span class="pct">{{ t.progress }}%</span>
                    </td>
                    <td>{{ t.message }}</td>
                    <td>{{ t.image_name || '-' }}</td>
                    <td>{{ t.template_vmid || '-' }}</td>
                    <td>{{ t.node_name || '-' }}</td>
                    <td>{{ t.started_at || '-' }}</td>
                    <td>{{ t.completed_at || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </ng-container>
          </div>
        </mat-tab>

        <mat-tab label="History">
          <div class="history-actions">
            <button mat-raised-button color="warn" (click)="onClearHistory()">Clear History</button>
          </div>
          <div *ngIf="(history$ | async) as history; else loading">
            <ng-container *ngIf="history.length; else emptyHistory">
              <table class="tasks-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Message</th>
                    <th>Image</th>
                    <th>Template VMID</th>
                    <th>Node</th>
                    <th>Started</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let t of history">
                    <td>{{ t.id }}</td>
                    <td>{{ t.status }}</td>
                    <td>{{ t.progress }}%</td>
                    <td>{{ t.message }}</td>
                    <td>{{ t.image_name || '-' }}</td>
                    <td>{{ t.template_vmid || '-' }}</td>
                    <td>{{ t.node_name || '-' }}</td>
                    <td>{{ t.started_at || '-' }}</td>
                    <td>{{ t.completed_at || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </ng-container>
          </div>
          <ng-template #emptyHistory>
            <div class="empty">No tasks in history.</div>
          </ng-template>
        </mat-tab>
      </mat-tab-group>

      <ng-template #loading>
        <div class="loading">Loading tasks…</div>
      </ng-template>

      <ng-template #empty>
        <div class="empty">No active tasks.</div>
      </ng-template>
    </div>
  `,
  styles: [
    `
    .tasks-page { padding: 16px; }
    .hint { color: #666; margin-bottom: 12px; }
    .history-actions { margin: 8px 0 12px; }
    .tasks-table { width: 100%; border-collapse: collapse; }
    .tasks-table th, .tasks-table td { padding: 8px; border-bottom: 1px solid #e0e0e0; }
    .progress { width: 120px; height: 8px; background: #eee; border-radius: 4px; position: relative; display: inline-block; margin-right: 8px; }
    .progress .bar { height: 100%; background: #3f51b5; border-radius: 4px; }
    .pct { font-size: 12px; color: #555; }
    .loading, .empty { color: #888; }
    `
  ]
})
export class TasksQueueComponent {
  private tasksService = inject(TasksService);

  tasks$: Observable<TaskStatus[]> = timer(0, 2000).pipe(
    startWith(0),
    switchMap(() => this.tasksService.listTasks())
  );

  history$: Observable<TaskStatus[]> = timer(0, 5000).pipe(
    startWith(0),
    switchMap(() => this.tasksService.listHistory())
  );

  onClearHistory() {
    this.tasksService.clearHistory().subscribe(() => {
      // Trigger immediate refresh of history after clearing
      this.history$ = timer(0, 5000).pipe(
        startWith(0),
        switchMap(() => this.tasksService.listHistory())
      );
    });
  }
}
