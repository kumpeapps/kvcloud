import { Component, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { PlansService } from '../../core/services/plans.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from '../../shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-plans-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule, ConfirmationDialogComponent],
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
              <mat-card-title>{{ editingCloudPlanId() ? 'Edit Cloud License' : 'Create Cloud License' }}</mat-card-title>
              <mat-card-content>
                <form [formGroup]="cloudForm" #cloudFormRef (ngSubmit)="saveCloud()">
                  <div class="form-section">
                    <h3>Plan Details</h3>
                    <div class="form-grid-2">
                      <mat-form-field appearance="outline">
                        <mat-label>Name</mat-label>
                        <input matInput formControlName="name" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Description</mat-label>
                        <input matInput formControlName="description">
                      </mat-form-field>
                    </div>
                  </div>

                  <div class="form-section">
                    <h3>Resource Limits</h3>
                    <div class="form-grid-2">
                      <mat-form-field appearance="outline">
                        <mat-label>Max VMs (0 = unlimited)</mat-label>
                        <input matInput type="number" min="0" formControlName="max_vms" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Max CPU Cores (0 = unlimited)</mat-label>
                        <input matInput type="number" min="0" formControlName="max_cpu_cores" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Max RAM (MB, 0 = unlimited)</mat-label>
                        <input matInput type="number" min="0" formControlName="max_ram_mb" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Max Disk (GB, 0 = unlimited)</mat-label>
                        <input matInput type="number" min="0" formControlName="max_disk_gb" required>
                      </mat-form-field>
                    </div>
                  </div>

                  <div class="form-section">
                    <h3>Feature Limits</h3>
                    <div class="form-grid-2">
                      <mat-form-field appearance="outline">
                        <mat-label>Max Snapshots (0 = unlimited)</mat-label>
                        <input matInput type="number" min="0" formControlName="max_snapshots" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Max Backups (0 = unlimited)</mat-label>
                        <input matInput type="number" min="0" formControlName="max_backups" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Max ISOs (0 = unlimited)</mat-label>
                        <input matInput type="number" min="0" formControlName="max_isos" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Max IPs (0 = unlimited)</mat-label>
                        <input matInput type="number" min="0" formControlName="max_ips" required>
                      </mat-form-field>
                    </div>
                  </div>

                  <div class="form-section">
                    <h3>Approval</h3>
                    <div class="form-grid-2">
                      <mat-form-field appearance="outline">
                        <mat-label>Allow Self Approval</mat-label>
                        <mat-select formControlName="allow_self_approval">
                          <mat-option [value]="true">Yes</mat-option>
                          <mat-option [value]="false">No</mat-option>
                        </mat-select>
                      </mat-form-field>
                    </div>
                  </div>

                  <div class="button-group mt">
                    <button mat-raised-button color="primary" type="submit" [disabled]="cloudForm.invalid || loading">
                      {{ loading ? 'Saving...' : (editingCloudPlanId() ? 'Update Plan' : 'Create Plan') }}
                    </button>
                    <button mat-raised-button type="button" (click)="cancelEditCloud()" *ngIf="editingCloudPlanId()">Cancel</button>
                  </div>
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
              <div class="cloud-plans-grid">
                <mat-card class="cloud-plan-card" *ngFor="let plan of cloudLicenses()">
                  <mat-card-header>
                    <mat-card-title>{{ plan.name }}</mat-card-title>
                    <div class="actions">
                      <button mat-icon-button (click)="editCloudPlan(plan)" title="Edit">
                        <mat-icon>edit</mat-icon>
                      </button>
                      <button mat-icon-button color="warn" (click)="deleteCloudPlan(plan)" title="Delete">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </div>
                  </mat-card-header>
                  <mat-card-content class="cloud-plan-specs">
                    <div class="spec-row" *ngIf="plan.description">
                      <strong>Description:</strong> {{ plan.description }}
                    </div>
                    <div class="spec-row">
                      <strong>Max VMs:</strong> {{ plan.max_vms || '∞' }}
                    </div>
                    <div class="spec-row">
                      <strong>Max CPU Cores:</strong> {{ plan.max_cpu_cores || '∞' }}
                    </div>
                    <div class="spec-row">
                      <strong>Max RAM:</strong> {{ plan.max_ram_mb || '∞' }} MB
                    </div>
                    <div class="spec-row">
                      <strong>Max Disk:</strong> {{ plan.max_disk_gb || '∞' }} GB
                    </div>
                    <div class="spec-row">
                      <strong>Max Snapshots:</strong> {{ plan.max_snapshots || '∞' }}
                    </div>
                    <div class="spec-row">
                      <strong>Max Backups:</strong> {{ plan.max_backups || '∞' }}
                    </div>
                    <div class="spec-row">
                      <strong>Max ISOs:</strong> {{ plan.max_isos || '∞' }}
                    </div>
                    <div class="spec-row">
                      <strong>Max IPs:</strong> {{ plan.max_ips || '∞' }}
                    </div>
                    <div class="spec-row">
                      <mat-chip [color]="plan.allow_self_approval ? 'primary' : ''">
                        {{ plan.allow_self_approval ? 'Self Approval Enabled' : 'Self Approval Disabled' }}
                      </mat-chip>
                    </div>
                  </mat-card-content>
                </mat-card>
              </div>
              <div class="empty" *ngIf="!cloudLicenses().length">No cloud license plans yet.</div>
            </mat-card-content>
          </mat-card>
        </mat-tab>

        <mat-tab label="VPS Plans">
          <div class="section">
            <mat-card>
              <mat-card-title>Create VPS Plan</mat-card-title>
              <mat-card-content>
                <form [formGroup]="vpsForm" (ngSubmit)="saveVps()">
                  <div class="form-section">
                    <h3>Hardware Configuration</h3>
                    <div class="form-grid-3">
                      <mat-form-field appearance="outline">
                        <mat-label>Name</mat-label>
                        <input matInput formControlName="name" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Description</mat-label>
                        <input matInput formControlName="description">
                      </mat-form-field>
                      <div></div>
                      
                      <mat-form-field appearance="outline">
                        <mat-label>CPU Cores</mat-label>
                        <input matInput type="number" min="1" formControlName="cpu_cores" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>CPU Sockets</mat-label>
                        <input matInput type="number" min="1" formControlName="cpu_sockets" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>CPU Type</mat-label>
                        <mat-select formControlName="cpu_type" required>
                          <mat-option value="host">Host</mat-option>
                          <mat-option value="qemu64">QEMU64</mat-option>
                          <mat-option value="kvm64">KVM64</mat-option>
                        </mat-select>
                      </mat-form-field>
                      
                      <mat-form-field appearance="outline">
                        <mat-label>RAM (MB)</mat-label>
                        <input matInput type="number" min="128" formControlName="ram_mb" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Disk (GB)</mat-label>
                        <input matInput type="number" min="1" formControlName="disk_gb" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Disk Type</mat-label>
                        <mat-select formControlName="disk_type" required>
                          <mat-option value="virtio">VirtIO</mat-option>
                          <mat-option value="scsi">SCSI</mat-option>
                          <mat-option value="ide">IDE</mat-option>
                        </mat-select>
                      </mat-form-field>
                    </div>
                  </div>

                  <div class="form-section">
                    <h3>Network Configuration</h3>
                    <div class="form-grid-3">
                      <mat-form-field appearance="outline">
                        <mat-label>Number of IPs</mat-label>
                        <input matInput type="number" min="1" formControlName="number_of_ips" required>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>IP Group (optional)</mat-label>
                        <mat-select formControlName="ip_group_id">
                          <mat-option [value]="null">None</mat-option>
                          <mat-option *ngFor="let g of ipGroups()" [value]="g.id">{{ g.name }}</mat-option>
                        </mat-select>
                      </mat-form-field>
                      <div></div>
                    </div>
                  </div>

                  <div class="form-section">
                    <h3>Operating System</h3>
                    <div class="form-grid-3">
                      <mat-form-field appearance="outline">
                        <mat-label>OS Template (optional)</mat-label>
                        <mat-select formControlName="os_template">
                          <mat-option [value]="null">None</mat-option>
                          <mat-option *ngFor="let t of osTemplates()" [value]="t.name">{{ t.label }}</mat-option>
                        </mat-select>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>ISO Group (optional)</mat-label>
                        <mat-select formControlName="iso_group_id">
                          <mat-option [value]="null">None</mat-option>
                          <mat-option *ngFor="let g of isoGroups()" [value]="g.id">{{ g.name }}</mat-option>
                        </mat-select>
                      </mat-form-field>
                      <div></div>
                    </div>
                  </div>

                  <div class="form-section">
                    <h3>Console & Access</h3>
                    <div class="checkbox-group">
                      <mat-checkbox formControlName="enable_vnc">Enable VNC Console</mat-checkbox>
                      <mat-checkbox formControlName="enable_serial">Enable Serial Console</mat-checkbox>
                      <mat-checkbox formControlName="virtio">Enable VirtIO Drivers</mat-checkbox>
                      <mat-checkbox formControlName="scsi">Enable SCSI Support</mat-checkbox>
                    </div>
                  </div>

                  <div class="form-section">
                    <h3>Pricing & Limits</h3>
                    <div class="form-grid-3">
                      <mat-form-field appearance="outline">
                        <mat-label>Price per Month (cents, optional)</mat-label>
                        <input matInput type="number" min="0" formControlName="price_per_month">
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Max Instances per User (optional)</mat-label>
                        <input matInput type="number" min="1" formControlName="max_instances_per_user">
                      </mat-form-field>
                      <div></div>
                    </div>
                  </div>

                  <div style="display: flex; gap: 8px;">
                    <button mat-raised-button color="primary" type="submit" [disabled]="vpsForm.invalid || loading">
                      {{ loading ? 'Saving...' : (editingPlanId() ? 'Update Plan' : 'Create Plan') }}
                    </button>
                    <button *ngIf="editingPlanId()" mat-stroked-button (click)="cancelEdit()" [disabled]="loading">
                      Cancel Edit
                    </button>
                  </div>
                </form>
              </mat-card-content>
            </mat-card>

            <mat-card class="mt vps-form-section">
              <mat-card-title>VPS Plans</mat-card-title>
              <mat-card-content>
                <div class="plans-list" *ngIf="vpsPlans().length; else noVps">
                  <mat-card *ngFor="let p of vpsPlans()" class="plan-card">
                    <mat-card-header>
                      <mat-card-title>{{ p.name }}</mat-card-title>
                      <mat-card-subtitle>{{ p.description }}</mat-card-subtitle>
                    </mat-card-header>
                    <mat-card-content>
                      <div class="spec-grid">
                        <div class="spec">
                          <div class="label">CPU</div>
                          <div class="value">{{ p.cpu_cores }} cores × {{ p.cpu_sockets }} socket(s) ({{ p.cpu_type }})</div>
                        </div>
                        <div class="spec">
                          <div class="label">RAM</div>
                          <div class="value">{{ p.ram_mb }}MB</div>
                        </div>
                        <div class="spec">
                          <div class="label">Disk</div>
                          <div class="value">{{ p.disk_gb }}GB ({{ p.disk_type }})</div>
                        </div>
                        <div class="spec">
                          <div class="label">Network</div>
                          <div class="value">{{ p.number_of_ips }} IP(s)</div>
                        </div>
                        <div class="spec" *ngIf="p.os_template">
                          <div class="label">OS Template</div>
                          <div class="value">{{ p.os_template }}</div>
                        </div>
                        <div class="spec" *ngIf="p.price_per_month">
                          <div class="label">Price</div>
                          <div class="value">{{ '$' }}{{ (p.price_per_month / 100).toFixed(2) }}/mo</div>
                        </div>
                      </div>
                      <div class="features">
                        <mat-chip *ngIf="p.enable_vnc" color="primary" selected>VNC Console</mat-chip>
                        <mat-chip *ngIf="p.enable_serial" color="accent" selected>Serial Console</mat-chip>
                        <mat-chip *ngIf="p.virtio">VirtIO</mat-chip>
                        <mat-chip *ngIf="p.scsi">SCSI</mat-chip>
                      </div>
                    </mat-card-content>
                    <mat-card-actions>
                      <button mat-icon-button color="primary" (click)="editVpsPlan(p)" [disabled]="loading">
                        <mat-icon>edit</mat-icon>
                      </button>
                      <button mat-icon-button color="warn" (click)="deleteVpsPlan(p)" [disabled]="loading">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </mat-card-actions>
                  </mat-card>
                </div>
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
    .sub { opacity: 0.6; font-size: 13px; }
    .plan-row { padding: 8px; border-radius: 4px; margin-bottom: 4px; }
    .plan-row:hover { background: rgba(255,255,255,0.05); }
    .plan-chip { font-size: 11px; }
    .section { padding: 16px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; align-items: end; }
    .form-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
    .form-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
    .form-section { margin-bottom: 24px; }
    .form-section h3 { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; }
    .checkbox-group { display: flex; flex-direction: column; gap: 8px; }
    .button-group { display: flex; gap: 8px; flex-wrap: wrap; }
    .full-width { width: 100%; }
    .mt { margin-top: 12px; }
    .empty { opacity: 0.6; padding: 8px 0; }
    .vm-item { padding: 4px 0; font-size: 13px; }
    .list { margin-top: 12px; display: grid; gap: 8px; }
    .list-title { font-weight: 600; font-size: 13px; opacity: 0.7; }
    .list-actions { margin-left: auto; display: flex; gap: 4px; }
    .plans-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 12px; }
    .plan-card { }
    .spec-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 12px; }
    .spec { }
    .spec .label { font-size: 12px; opacity: 0.6; margin-bottom: 4px; }
    .spec .value { font-weight: 500; font-size: 13px; }
    .features { display: flex; flex-wrap: wrap; gap: 8px; }
    .cloud-plans-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 12px; }
    .cloud-plan-card { }
    .cloud-plan-card mat-card-header { display: flex; justify-content: space-between; align-items: center; }
    .cloud-plan-card .actions { display: flex; gap: 4px; }
    .cloud-plan-specs { display: flex; flex-direction: column; gap: 8px; }
    .cloud-plan-specs .spec-row { font-size: 13px; }
    .cloud-plan-specs .spec-row strong { opacity: 0.7; }
  `]
})
export class PlansManagerComponent implements OnInit {
  @ViewChild('cloudFormRef') cloudFormRef?: ElementRef;
  cloudLicenses = signal<any[]>([]);
  vpsPlans = signal<any[]>([]);
  osTemplates = signal<any[]>([]);
  ipGroups = signal<any[]>([]);
  isoGroups = signal<any[]>([]);
  editingPlanId = signal<number | null>(null);
  editingCloudPlanId = signal<number | null>(null);
  cloudColumns = ['name', 'max_vms', 'allow'];
  vpsColumns = ['name', 'cpu', 'ram', 'disk'];
  cloudForm = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    max_vms: [5, [Validators.required, Validators.min(0)]],
    max_cpu_cores: [10, [Validators.required, Validators.min(0)]],
    max_ram_mb: [10240, [Validators.required, Validators.min(0)]],
    max_disk_gb: [100, [Validators.required, Validators.min(0)]],
    max_snapshots: [10, [Validators.required, Validators.min(0)]],
    max_backups: [5, [Validators.required, Validators.min(0)]],
    max_isos: [20, [Validators.required, Validators.min(0)]],
    max_ips: [10, [Validators.required, Validators.min(0)]],
    allow_self_approval: [false, Validators.required]
  });
  vpsForm = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    cpu_cores: [2, [Validators.required, Validators.min(1)]],
    cpu_sockets: [1, [Validators.required, Validators.min(1)]],
    cpu_type: ['host', Validators.required],
    ram_mb: [2048, [Validators.required, Validators.min(128)]],
    disk_gb: [32, [Validators.required, Validators.min(1)]],
    disk_type: ['virtio', Validators.required],
    number_of_ips: [1, [Validators.required, Validators.min(1)]],
    ip_group_id: [null],
    os_template: [''],
    iso_group_id: [null],
    enable_vnc: [false],
    enable_serial: [false],
    virtio: [true],
    scsi: [false],
    price_per_month: [null],
    max_instances_per_user: [null]
  });
  assignUserId: number | null = null;
  assignPlanId: number | null = null;
  ipGroupName = '';
  ipGroupDesc = '';
  isoGroupName = '';
  isoGroupDesc = '';
  loading = false;

  constructor(private plans: PlansService, private fb: FormBuilder, private snackBar: MatSnackBar, private dialog: MatDialog) {}

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
    this.plans.listOsTemplates().subscribe({
      next: (r) => this.osTemplates.set(r.templates || []),
      error: () => {},
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
    const planId = this.editingCloudPlanId();
    const request = planId
      ? this.plans.updateCloudLicense(planId, this.cloudForm.value)
      : this.plans.createCloudLicense(this.cloudForm.value);
    
    request.subscribe({
      next: () => {
        this.cloudForm.reset({ 
          allow_self_approval: false, 
          max_vms: 5,
          max_cpu_cores: 10,
          max_ram_mb: 10240,
          max_disk_gb: 100,
          max_snapshots: 10,
          max_backups: 5,
          max_isos: 20,
          max_ips: 10
        });
        this.editingCloudPlanId.set(null);
        this.refresh();
        this.snackBar.open(planId ? 'Cloud license plan updated' : 'Cloud license plan created', 'Close', { duration: 2500 });
      },
      error: () => this.loading = false
    });
  }

  saveVps(): void {
    if (this.vpsForm.invalid) return;
    this.loading = true;
    const planId = this.editingPlanId();
    const request = planId
      ? this.plans.updateVpsPlan(planId, this.vpsForm.value)
      : this.plans.createVpsPlan(this.vpsForm.value);
    
    request.subscribe({
      next: () => {
        this.vpsForm.reset({
          cpu_cores: 2,
          cpu_sockets: 1,
          cpu_type: 'host',
          ram_mb: 2048,
          disk_gb: 32,
          disk_type: 'virtio',
          number_of_ips: 1,
          ip_group_id: null,
          os_template: '',
          iso_group_id: null,
          enable_vnc: false,
          enable_serial: false,
          virtio: true,
          scsi: false,
          price_per_month: null,
          max_instances_per_user: null
        });
        this.editingPlanId.set(null);
        this.refresh();
        this.snackBar.open(planId ? 'VPS plan updated' : 'VPS plan created', 'Close', { duration: 2500 });
      },
      error: () => this.loading = false
    });
  }

  cancelEdit(): void {
    this.editingPlanId.set(null);
    this.vpsForm.reset({
      cpu_cores: 2,
      cpu_sockets: 1,
      cpu_type: 'host',
      ram_mb: 2048,
      disk_gb: 32,
      disk_type: 'virtio',
      number_of_ips: 1,
      ip_group_id: null,
      os_template: '',
      iso_group_id: null,
      enable_vnc: false,
      enable_serial: false,
      virtio: true,
      scsi: false,
      price_per_month: null,
      max_instances_per_user: null
    });
  }

  editCloudPlan(plan: any): void {
    this.editingCloudPlanId.set(plan.id);
    this.cloudForm.patchValue({
      name: plan.name,
      description: plan.description || '',
      max_vms: plan.max_vms || 5,
      max_cpu_cores: plan.max_cpu_cores || 10,
      max_ram_mb: plan.max_ram_mb || 10240,
      max_disk_gb: plan.max_disk_gb || 100,
      max_snapshots: plan.max_snapshots || 10,
      max_backups: plan.max_backups || 5,
      max_isos: plan.max_isos || 20,
      max_ips: plan.max_ips || 10,
      allow_self_approval: plan.allow_self_approval || false
    });
    setTimeout(() => this.cloudFormRef?.nativeElement.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  cancelEditCloud(): void {
    this.editingCloudPlanId.set(null);
    this.cloudForm.reset({ 
      allow_self_approval: false, 
      max_vms: 5,
      max_cpu_cores: 10,
      max_ram_mb: 10240,
      max_disk_gb: 100,
      max_snapshots: 10,
      max_backups: 5,
      max_isos: 20,
      max_ips: 10
    });
  }

  deleteCloudPlan(plan: any): void {
    this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: { title: 'Delete Cloud License Plan', message: `Delete "${plan.name}"? This action cannot be undone.` }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.loading = true;
        this.plans.deleteCloudLicense(plan.id).subscribe({
          next: () => {
            this.refresh();
            this.snackBar.open('Cloud license plan deleted', 'Close', { duration: 2500 });
          },
          error: () => this.loading = false
        });
      }
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

  editVpsPlan(plan: any): void {
    this.editingPlanId.set(plan.id);
    this.vpsForm.patchValue({
      name: plan.name,
      description: plan.description,
      cpu_cores: plan.cpu_cores,
      cpu_sockets: plan.cpu_sockets,
      cpu_type: plan.cpu_type,
      ram_mb: plan.ram_mb,
      disk_gb: plan.disk_gb,
      disk_type: plan.disk_type,
      number_of_ips: plan.number_of_ips,
      virtio: plan.virtio,
      scsi: plan.scsi,
      enable_vnc: plan.enable_vnc,
      enable_serial: plan.enable_serial,
      os_template: plan.os_template,
      ip_group_id: plan.ip_group_id,
      iso_group_id: plan.iso_group_id,
      price_per_month: plan.price_per_month,
      max_instances_per_user: plan.max_instances_per_user,
    });
    // Scroll to form
    document.querySelector('.vps-form-section')?.scrollIntoView({ behavior: 'smooth' });
  }

  deleteVpsPlan(plan: any): void {
    if (!confirm(`Delete VPS plan ${plan.name}? This action cannot be undone.`)) return;
    this.loading = true;
    this.plans.deleteVpsPlan(plan.id).subscribe({
      next: () => {
        this.refresh();
        this.snackBar.open('VPS plan deleted', 'Close', { duration: 2500 });
      },
      error: () => this.loading = false
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
