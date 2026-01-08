import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material.module';
import { VmRequestsService } from '../../../core/services/vm-requests.service';

@Component({
  selector: 'app-vm-requests-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  template: `
    <div class="page">
      <div class="header">
        <div>
          <h1>VM Requests Approvals</h1>
          <div class="sub">{{ filtered().length }} requests • {{ approvedCount() }} approved • {{ pendingCount() }} pending</div>
        </div>
        <div class="controls">
          <mat-form-field appearance="outline" class="filter">
            <mat-label>Status</mat-label>
            <mat-select [(value)]="statusFilter" (selectionChange)="applyFilters()">
              <mat-option value="">All</mat-option>
              <mat-option value="pending">Pending</mat-option>
              <mat-option value="approved">Approved</mat-option>
              <mat-option value="fulfilled">Fulfilled</mat-option>
              <mat-option value="denied">Denied</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="filter">
            <mat-label>User ID</mat-label>
            <input matInput type="number" [(ngModel)]="userFilter" (ngModelChange)="applyFilters()" placeholder="e.g. 1">
          </mat-form-field>
          <button mat-icon-button color="primary" (click)="refresh()" [disabled]="loading">
            <mat-icon>refresh</mat-icon>
          </button>
        </div>
      </div>

      <mat-card>
        <mat-card-content>
          <table mat-table [dataSource]="filtered()" class="full-width" *ngIf="filtered().length; else empty">
            <ng-container matColumnDef="id">
              <th mat-header-cell *matHeaderCellDef>ID</th>
              <td mat-cell *matCellDef="let r">#{{ r.id }}</td>
            </ng-container>

            <ng-container matColumnDef="user">
              <th mat-header-cell *matHeaderCellDef>User</th>
              <td mat-cell *matCellDef="let r">{{ r.user_id || '—' }}</td>
            </ng-container>

            <ng-container matColumnDef="plan">
              <th mat-header-cell *matHeaderCellDef>Plan</th>
              <td mat-cell *matCellDef="let r">{{ r.plan_id || '—' }}</td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let r">
                <mat-chip [color]="statusColor(r.status)" selected>{{ r.status }}</mat-chip>
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let r">
                <div class="actions">
                  <button mat-stroked-button color="primary" (click)="approve(r.id)" [disabled]="loading || r.status === 'approved' || r.status === 'fulfilled'">Approve</button>
                  <button mat-raised-button color="accent" (click)="fulfill(r.id)" [disabled]="loading || r.status !== 'approved'">Fulfill</button>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
          <ng-template #empty>
            <div class="empty">No requests match the filters.</div>
          </ng-template>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .header { display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
    .controls { display: flex; gap: 12px; align-items: center; }
    .filter { width: 180px; }
    .sub { opacity: 0.6; font-size: 13px; margin-top: 4px; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; }
    .empty { padding: 12px; opacity: 0.6; }
  `]
})
export class VmRequestsApprovalsComponent implements OnInit {
  requests = signal<any[]>([]);
  filtered = signal<any[]>([]);
  statusFilter = '';
  userFilter: number | null = null;
  loading = false;
  displayedColumns = ['id', 'user', 'plan', 'status', 'actions'];
  approvedCount = computed(() => this.filtered().filter(r => r.status === 'approved').length);
  pendingCount = computed(() => this.filtered().filter(r => r.status === 'pending').length);
  constructor(private requestsSvc: VmRequestsService) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading = true;
    this.requestsSvc.listAll().subscribe({
      next: (r) => {
        this.requests.set(r.requests || []);
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  approve(id: number): void {
    this.loading = true;
    this.requestsSvc.approve(id).subscribe({
      next: () => this.refresh(),
      error: () => this.loading = false
    });
  }

  fulfill(id: number): void {
    this.loading = true;
    this.requestsSvc.fulfill(id).subscribe({
      next: () => this.refresh(),
      error: () => this.loading = false
    });
  }

   applyFilters(): void {
    const list = this.requests();
    const status = this.statusFilter;
    const userId = this.userFilter;
    const filtered = list.filter(r => {
      const statusOk = !status || r.status === status;
      const userOk = !userId || r.user_id === userId;
      return statusOk && userOk;
    });
    this.filtered.set(filtered);
  }

  statusColor(status: string): string {
    switch (status) {
      case 'approved': return 'primary';
      case 'fulfilled': return 'accent';
      case 'denied': return 'warn';
      default: return '';
    }
  }
}
