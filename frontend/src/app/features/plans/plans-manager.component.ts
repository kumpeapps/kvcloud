import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { PlansService } from '../../core/services/plans.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-plans-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule],
  template: `
    <div class="page">
      <div class="header">
        <div>
          <h1>Plans Manager</h1>
          <div class="sub">Manage Cloud License plans, VPS plans, and resource groups</div>
        </div>
        <button mat-icon-button color="primary" (click)="refresh()" [disabled]="loading">
          <mat-icon>refresh</mat-icon>
        </button>
      </div>

      <mat-tab-group>
        <mat-tab label="Cloud License Plans">
          <div class="section grid-2">
            <mat-card>
              <mat-card-title>Create / Edit Cloud License</mat-card-title>
              <mat-card-content>
                <form [formGroup]="cloudForm" class="form-grid" (ngSubmit)="saveCloud()">
                  <mat-form-field appearance="outline">
                    <mat-label>Name</mat-label>
                    <input matInput formControlName="name" required>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Max VMs</mat-label>
                    <input matInput type="number" min="1" formControlName="max_vms" required>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Allow Self Approval</mat-label>
                    <mat-select formControlName="allow_self_approval">
                      <mat-option [value]="true">Yes</mat-option>
                      <mat-option [value]="false">No</mat-option>
                    </mat-select>
                  </mat-form-field>
                  <button mat-raised-button color="primary" type="submit" [disabled]="cloudForm.invalid || loading">
                    {{ loading ? 'Saving...' : 'Save Plan' }}
                  </button>
                </form>
              </mat-card-content>
            </mat-card>

            <mat-card>
              <mat-card-title>Assign Cloud License</mat-card-title>
              <mat-card-content>
                <form class="form-grid" (ngSubmit)="assignCloud()">
                  <mat-form-field appearance="outline">
                    <mat-label>User ID</mat-label>
                    <input matInput type="number" min="1" [(ngModel)]="assignUserId" name="assignUserId" required>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Plan</mat-label>
                    <mat-select [(ngModel)]="assignPlanId" name="assignPlanId" required>
                      <mat-option *ngFor="let p of cloudLicenses()" [value]="p.id">{{ p.name }}</mat-option>
                    </mat-select>
                  </mat-form-field>
                  <button mat-raised-button color="accent" type="submit" [disabled]="!assignUserId || !assignPlanId || loading">Assign</button>
                </form>
              </mat-card-content>
            </mat-card>
          </div>

          <mat-card class="mt">
            <mat-card-title>Cloud License Plans</mat-card-title>
            <mat-card-content>
              <table mat-table [dataSource]="cloudLicenses()" class="full-width" *ngIf="cloudLicenses().length; else noCloud">
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let p">{{ p.name }}</td>
                </ng-container>
                <ng-container matColumnDef="max_vms">
                  <th mat-header-cell *matHeaderCellDef>Max VMs</th>
                  <td mat-cell *matCellDef="let p">{{ p.max_vms }}</td>
                </ng-container>
                <ng-container matColumnDef="allow">
                  <th mat-header-cell *matHeaderCellDef>Self Approval</th>
                  <td mat-cell *matCellDef="let p">
                    <mat-chip [color]="p.allow_self_approval ? 'primary' : ''" selected>{{ p.allow_self_approval ? 'Yes' : 'No' }}</mat-chip>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="cloudColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: cloudColumns;"></tr>
              </table>
              <ng-template #noCloud><div class="empty">No cloud license plans yet.</div></ng-template>
            </mat-card-content>
          </mat-card>
        </mat-tab>

        <mat-tab label="VPS Plans">
          <div class="section grid-2">
            <mat-card>
              <mat-card-title>Create VPS Plan</mat-card-title>
              <mat-card-content>
                <form [formGroup]="vpsForm" class="form-grid" (ngSubmit)="saveVps()">
                  <mat-form-field appearance="outline">
                    <mat-label>Name</mat-label>
                    <input matInput formControlName="name" required>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>CPU Cores</mat-label>
                    <input matInput type="number" min="1" formControlName="cpu_cores" required>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>RAM (MB)</mat-label>
                    <input matInput type="number" min="256" formControlName="ram_mb" required>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Disk (GB)</mat-label>
                    <input matInput type="number" min="1" formControlName="disk_gb" required>
                  </mat-form-field>
                  <button mat-raised-button color="primary" type="submit" [disabled]="vpsForm.invalid || loading">
                    {{ loading ? 'Saving...' : 'Save Plan' }}
                  </button>
                </form>
              </mat-card-content>
            </mat-card>

            <mat-card class="mt">
              <mat-card-title>VPS Plans</mat-card-title>
              <mat-card-content>
                <table mat-table [dataSource]="vpsPlans()" class="full-width" *ngIf="vpsPlans().length; else noVps">
                  <ng-container matColumnDef="name">
                    <th mat-header-cell *matHeaderCellDef>Name</th>
                    <td mat-cell *matCellDef="let p">{{ p.name }}</td>
                  </ng-container>
                  <ng-container matColumnDef="cpu">
                    <th mat-header-cell *matHeaderCellDef>CPU</th>
                    <td mat-cell *matCellDef="let p">{{ p.cpu_cores }} cores</td>
                  </ng-container>
                  <ng-container matColumnDef="ram">
                    <th mat-header-cell *matHeaderCellDef>RAM</th>
                    <td mat-cell *matCellDef="let p">{{ p.ram_mb }} MB</td>
                  </ng-container>
                  <ng-container matColumnDef="disk">
                    <th mat-header-cell *matHeaderCellDef>Disk</th>
                    <td mat-cell *matCellDef="let p">{{ p.disk_gb }} GB</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="vpsColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: vpsColumns;"></tr>
                </table>
                <ng-template #noVps><div class="empty">No VPS plans yet.</div></ng-template>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>

        <mat-tab label="Resource Groups">
          <div class="section grid-2">
            <mat-card>
              <mat-card-title>Create IP Group</mat-card-title>
              <mat-card-content>
                <form class="form-grid" (ngSubmit)="createIpGroup()">
                  <mat-form-field appearance="outline">
                    <mat-label>Name</mat-label>
                    <input matInput [(ngModel)]="ipGroupName" name="ipGroupName" required>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Description</mat-label>
                    <input matInput [(ngModel)]="ipGroupDesc" name="ipGroupDesc">
                  </mat-form-field>
                  <button mat-raised-button color="primary" type="submit" [disabled]="!ipGroupName || loading">Create</button>
                </form>
                <div class="list" *ngIf="ipGroups().length">
                  <div class="list-title">Existing IP Groups</div>
                  <mat-list>
                    <mat-list-item *ngFor="let g of ipGroups()">
                      <div mat-line>{{ g.name }}</div>
                      <div mat-line class="sub">{{ g.description || '—' }}</div>
                      <div class="list-actions">
                        <button mat-icon-button color="primary" (click)="editIpGroup(g)"><mat-icon>edit</mat-icon></button>
                        <button mat-icon-button color="warn" (click)="deleteIpGroup(g)"><mat-icon>delete</mat-icon></button>
                      </div>
                    </mat-list-item>
                  </mat-list>
                </div>
              </mat-card-content>
            </mat-card>
            <mat-card>
              <mat-card-title>Create ISO Group</mat-card-title>
              <mat-card-content>
                <form class="form-grid" (ngSubmit)="createIsoGroup()">
                  <mat-form-field appearance="outline">
                    <mat-label>Name</mat-label>
                    <input matInput [(ngModel)]="isoGroupName" name="isoGroupName" required>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Description</mat-label>
                    <input matInput [(ngModel)]="isoGroupDesc" name="isoGroupDesc">
                  </mat-form-field>
                  <button mat-raised-button color="accent" type="submit" [disabled]="!isoGroupName || loading">Create</button>
                </form>
                <div class="list" *ngIf="isoGroups().length">
                  <div class="list-title">Existing ISO Groups</div>
                  <mat-list>
                    <mat-list-item *ngFor="let g of isoGroups()">
                      <div mat-line>{{ g.name }}</div>
                      <div mat-line class="sub">{{ g.description || '—' }}</div>
                      <div class="list-actions">
                        <button mat-icon-button color="primary" (click)="editIsoGroup(g)"><mat-icon>edit</mat-icon></button>
                        <button mat-icon-button color="warn" (click)="deleteIsoGroup(g)"><mat-icon>delete</mat-icon></button>
                      </div>
                    </mat-list-item>
                  </mat-list>
                </div>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .sub { color: rgba(0,0,0,0.6); font-size: 13px; }
    .section { padding: 16px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; align-items: end; }
    .full-width { width: 100%; }
    .mt { margin-top: 12px; }
    .empty { color: rgba(0,0,0,0.6); padding: 8px 0; }
    .list { margin-top: 12px; display: grid; gap: 8px; }
    .list-title { font-weight: 600; font-size: 13px; color: rgba(0,0,0,0.7); }
    .list-actions { margin-left: auto; display: flex; gap: 4px; }
  `]
})
export class PlansManagerComponent implements OnInit {
  cloudLicenses = signal<any[]>([]);
  vpsPlans = signal<any[]>([]);
  ipGroups = signal<any[]>([]);
  isoGroups = signal<any[]>([]);
  cloudColumns = ['name', 'max_vms', 'allow'];
  vpsColumns = ['name', 'cpu', 'ram', 'disk'];
  cloudForm = this.fb.group({
    name: ['', Validators.required],
    max_vms: [5, [Validators.required, Validators.min(1)]],
    allow_self_approval: [false, Validators.required]
  });
  vpsForm = this.fb.group({
    name: ['', Validators.required],
    cpu_cores: [2, [Validators.required, Validators.min(1)]],
    ram_mb: [2048, [Validators.required, Validators.min(256)]],
    disk_gb: [32, [Validators.required, Validators.min(1)]]
  });
  assignUserId: number | null = null;
  assignPlanId: number | null = null;
  ipGroupName = '';
  ipGroupDesc = '';
  isoGroupName = '';
  isoGroupDesc = '';
  loading = false;

  constructor(private plans: PlansService, private fb: FormBuilder, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading = true;
    this.plans.listCloudLicenses().subscribe({
      next: (r) => this.cloudLicenses.set(r.plans || []),
      error: () => {},
      complete: () => this.loading = false
    });
    this.plans.listVpsPlans().subscribe({
      next: (r) => this.vpsPlans.set(r.plans || []),
      error: () => {},
      complete: () => this.loading = false
    });
    this.plans.listIpGroups().subscribe({
      next: (r) => this.ipGroups.set(r.groups || []),
      error: () => {},
    });
    this.plans.listIsoGroups().subscribe({
      next: (r) => this.isoGroups.set(r.groups || []),
      error: () => {},
    });
  }

  saveCloud(): void {
    if (this.cloudForm.invalid) return;
    this.loading = true;
    this.plans.createCloudLicense(this.cloudForm.value).subscribe({
      next: () => {
        this.cloudForm.reset({ allow_self_approval: false, max_vms: 5 });
        this.refresh();
        this.snackBar.open('Cloud license plan saved', 'Close', { duration: 2500 });
      },
      error: () => this.loading = false
    });
  }

  saveVps(): void {
    if (this.vpsForm.invalid) return;
    this.loading = true;
    this.plans.createVpsPlan(this.vpsForm.value).subscribe({
      next: () => {
        this.vpsForm.reset({ cpu_cores: 2, ram_mb: 2048, disk_gb: 32 });
        this.refresh();
        this.snackBar.open('VPS plan saved', 'Close', { duration: 2500 });
      },
      error: () => this.loading = false
    });
  }

  assignCloud(): void {
    if (!this.assignUserId || !this.assignPlanId) return;
    this.loading = true;
    this.plans.assignCloudLicense(this.assignUserId, this.assignPlanId).subscribe({
      next: () => {
        this.assignUserId = null;
        this.assignPlanId = null;
        this.loading = false;
        this.snackBar.open('Plan assigned to user', 'Close', { duration: 2500 });
      },
      error: () => this.loading = false
    });
  }

  createIpGroup(): void {
    if (!this.ipGroupName) return;
    this.loading = true;
    this.plans.createIpGroup({ name: this.ipGroupName, description: this.ipGroupDesc }).subscribe({
      next: () => {
        this.ipGroupName = '';
        this.ipGroupDesc = '';
        this.loading = false;
        this.refresh();
        this.snackBar.open('IP group created', 'Close', { duration: 2500 });
      },
      error: () => this.loading = false
    });
  }

  createIsoGroup(): void {
    if (!this.isoGroupName) return;
    this.loading = true;
    this.plans.createIsoGroup({ name: this.isoGroupName, description: this.isoGroupDesc }).subscribe({
      next: () => {
        this.isoGroupName = '';
        this.isoGroupDesc = '';
        this.loading = false;
        this.refresh();
        this.snackBar.open('ISO group created', 'Close', { duration: 2500 });
      },
      error: () => this.loading = false
    });
  }

  editIpGroup(group: any): void {
    const name = prompt('New name', group.name) ?? group.name;
    const description = prompt('Description', group.description || '') ?? group.description;
    this.plans.updateIpGroup(group.id, { name, description }).subscribe(() => {
      this.refresh();
      this.snackBar.open('IP group updated', 'Close', { duration: 2000 });
    });
  }

  deleteIpGroup(group: any): void {
    if (!confirm(`Delete IP group ${group.name}?`)) return;
    this.plans.deleteIpGroup(group.id).subscribe(() => {
      this.refresh();
      this.snackBar.open('IP group deleted', 'Close', { duration: 2000 });
    });
  }

  editIsoGroup(group: any): void {
    const name = prompt('New name', group.name) ?? group.name;
    const description = prompt('Description', group.description || '') ?? group.description;
    this.plans.updateIsoGroup(group.id, { name, description }).subscribe(() => {
      this.refresh();
      this.snackBar.open('ISO group updated', 'Close', { duration: 2000 });
    });
  }

  deleteIsoGroup(group: any): void {
    if (!confirm(`Delete ISO group ${group.name}?`)) return;
    this.plans.deleteIsoGroup(group.id).subscribe(() => {
      this.refresh();
      this.snackBar.open('ISO group deleted', 'Close', { duration: 2000 });
    });
  }
}
