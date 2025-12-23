import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { CloudInitService, CloudInitProfile } from '../../core/services/cloud-init.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-cloud-init-profiles',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule, MatTabsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Cloud-init Profiles</h1>
        <p class="subtitle">Manage cloud-init provisioning profiles and per-VM overrides</p>
      </div>

      <mat-tab-group>
        <!-- Admin Profiles Tab -->
        <mat-tab label="Admin Profiles">
          <div class="tab-content">
            <div class="tab-intro">
              <p><strong>Admin Profiles</strong> are base configurations created by admins. When creating VMs, users can select a profile and optionally override specific settings on a per-VM basis.</p>
            </div>

            <div class="list-actions">
              <button mat-raised-button color="primary" (click)="openProfileBuilder()">
                <mat-icon>add</mat-icon> New Profile
              </button>
              <button mat-raised-button color="accent" (click)="openProfileBuilder()">
                <mat-icon>construction</mat-icon> Advanced Builder
              </button>
            </div>

            <table mat-table [dataSource]="profiles()" class="profiles-table" *ngIf="profiles().length; else empty">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Name</th>
                <td mat-cell *matCellDef="let p">
                  <strong>{{ p.name }}</strong>
                  <br>
                  <small *ngIf="p.description">{{ p.description }}</small>
                </td>
              </ng-container>

              <ng-container matColumnDef="features">
                <th mat-header-cell *matHeaderCellDef>Features</th>
                <td mat-cell *matCellDef="let p">
                  <mat-chip-set aria-label="Features">
                    @if (p.apt_update) {
                      <mat-chip>APT Update</mat-chip>
                    }
                    @if (p.install_docker) {
                      <mat-chip>Docker</mat-chip>
                    }
                    @if (p.ssh_authorized_keys && p.ssh_authorized_keys.length) {
                      <mat-chip>SSH Keys ({{ p.ssh_authorized_keys.length }})</mat-chip>
                    }
                    @if (p.packages && p.packages.length) {
                      <mat-chip>Packages ({{ p.packages.length }})</mat-chip>
                    }
                  </mat-chip-set>
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Actions</th>
                <td mat-cell *matCellDef="let p">
                  <button mat-icon-button color="primary" (click)="editProfile(p)" matTooltip="Edit">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button mat-icon-button color="warn" (click)="deleteProfile(p.id)" matTooltip="Delete">
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>
            <ng-template #empty>
              <p class="empty-message">No profiles created yet. Click "New Profile" to get started.</p>
            </ng-template>
          </div>
        </mat-tab>

        <!-- Quick Create Tab -->
        <mat-tab label="Quick Create">
          <div class="tab-content">
            <div class="tab-intro">
              <p><strong>Quick Create</strong> profile with essential settings. Use the Advanced Builder for more options.</p>
            </div>

            <form [formGroup]="quickForm" (ngSubmit)="createQuickProfile()" class="profile-form">
              <div class="form-row">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Profile Name *</mat-label>
                  <input matInput formControlName="name" placeholder="e.g., Ubuntu Server Basic" required>
                  <mat-error>Name is required</mat-error>
                </mat-form-field>
              </div>

              <div class="form-row">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Description</mat-label>
                  <textarea matInput formControlName="description" rows="2" placeholder="What is this profile for?"></textarea>
                </mat-form-field>
              </div>

              <h3>User Configuration</h3>
              <div class="form-row">
                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>Default User</mat-label>
                  <input matInput formControlName="default_user" placeholder="ubuntu">
                </mat-form-field>

                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>Default Password</mat-label>
                  <input matInput type="password" formControlName="default_password">
                </mat-form-field>
              </div>

              <mat-checkbox formControlName="disable_root">Disable root login</mat-checkbox>
              <mat-checkbox formControlName="ssh_pwauth">Allow SSH password authentication</mat-checkbox>

              <h3>Package Management</h3>
              <div class="form-row">
                <mat-checkbox formControlName="apt_update">Run apt update on first boot</mat-checkbox>
                <mat-checkbox formControlName="apt_upgrade">Run apt upgrade on first boot</mat-checkbox>
              </div>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Packages to Install</mat-label>
                <textarea matInput formControlName="packages_text" rows="4" placeholder="curl&#10;git&#10;htop"></textarea>
                <mat-hint>One package per line</mat-hint>
              </mat-form-field>

              <h3>SSH Keys</h3>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>SSH Public Keys</mat-label>
                <textarea matInput formControlName="ssh_authorized_keys_text" rows="4" placeholder="ssh-rsa AAAAB3..."></textarea>
                <mat-hint>One SSH key per line</mat-hint>
              </mat-form-field>

              <h3>System</h3>
              <div class="form-row">
                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>Timezone</mat-label>
                  <input matInput formControlName="timezone" placeholder="UTC">
                </mat-form-field>

                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>Locale</mat-label>
                  <input matInput formControlName="locale" placeholder="en_US.UTF-8">
                </mat-form-field>
              </div>

              <h3>Docker (Optional)</h3>
              <mat-checkbox formControlName="install_docker">Install Docker automatically</mat-checkbox>
              @if (quickForm.get('install_docker')?.value) {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Docker Compose Path</mat-label>
                  <input matInput formControlName="docker_compose_path" placeholder="/root/docker-compose.yml">
                </mat-form-field>

                <mat-checkbox formControlName="start_docker_compose">Auto-start Docker Compose on boot</mat-checkbox>
              }

              <div class="actions">
                <button mat-raised-button color="primary" type="submit" [disabled]="!quickForm.valid">
                  <mat-icon>save</mat-icon> Create Profile
                </button>
                <button mat-button type="button" (click)="resetQuickForm()">Clear</button>
              </div>
            </form>
          </div>
        </mat-tab>

        <!-- Per-VM Overrides Guide Tab -->
        <mat-tab label="Per-VM Overrides Guide">
          <div class="tab-content guide-content">
            <h2>Combining Profiles with Per-VM Overrides</h2>
            
            <mat-card>
              <mat-card-header>
                <mat-card-title>Workflow</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <ol>
                  <li><strong>Admin creates profiles:</strong> Define base configurations in the Admin Profiles tab</li>
                  <li><strong>User creates VM:</strong> Select an optional profile from the VM creation wizard</li>
                  <li><strong>User adds overrides:</strong> The "Provisioning" step in VM creation allows users to override any per-VM setting (user, SSH keys, packages, etc.)</li>
                  <li><strong>System merges configuration:</strong> Backend merges profile settings with per-VM overrides (per-VM overrides take precedence)</li>
                  <li><strong>Cloud-init is applied:</strong> The merged configuration is written to the VM via cloud-init</li>
                </ol>
              </mat-card-content>
            </mat-card>

            <mat-card>
              <mat-card-header>
                <mat-card-title>Example: Base Profile + Per-VM Overrides</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="example-box">
                  <h4>Admin Profile: "Production Ubuntu"</h4>
                  <ul>
                    <li>Default user: ubuntu</li>
                    <li>SSH pwauth: enabled</li>
                    <li>APT update: yes, APT upgrade: yes</li>
                    <li>Packages: curl, git, htop, nginx</li>
                  </ul>

                  <h4>User VM Creation: web-server-01</h4>
                  <ul>
                    <li>Selects: "Production Ubuntu" profile</li>
                    <li>Overrides in Provisioning step:
                      <ul>
                        <li>Default password: <em>different for this VM</em></li>
                        <li>SSH keys: <em>team's public keys (added to profile's list)</em></li>
                        <li>Additional packages: <em>postgresql, redis (merged with profile packages)</em></li>
                      </ul>
                    </li>
                  </ul>

                  <h4>Result</h4>
                  <ul>
                    <li>Default user: ubuntu (from profile)</li>
                    <li>SSH password: <em>VM-specific value</em> (override)</li>
                    <li>SSH keys: <em>profile + VM team keys</em> (merged)</li>
                    <li>Packages: curl, git, htop, nginx, postgresql, redis (merged)</li>
                  </ul>
                </div>
              </mat-card-content>
            </mat-card>

            <mat-card>
              <mat-card-header>
                <mat-card-title>Merge Behavior</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <table class="behavior-table">
                  <tr>
                    <th>Field Type</th>
                    <th>Merge Behavior</th>
                    <th>Example</th>
                  </tr>
                  <tr>
                    <td><strong>Scalar (String, Number, Bool)</strong></td>
                    <td>Per-VM override replaces profile value</td>
                    <td>default_user, timezone, ssh_pwauth</td>
                  </tr>
                  <tr>
                    <td><strong>List (Packages, SSH Keys)</strong></td>
                    <td>Per-VM items added to profile list (no duplicates)</td>
                    <td>["nginx", "curl"] + ["redis"] = ["nginx", "curl", "redis"]</td>
                  </tr>
                </table>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .page-container { padding: 16px; max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0 0 8px 0; }
    .page-header .subtitle { color: #666; margin: 0; }
    .tab-content { padding: 24px; }
    .tab-intro { background: #f5f5f5; padding: 16px; border-radius: 4px; margin-bottom: 24px; }
    .tab-intro p { margin: 0; color: #666; }
    .form-row { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
    .half-width { flex: 1; min-width: 250px; }
    .full-width { width: 100%; }
    .actions { margin-top: 24px; display: flex; gap: 8px; }
    .profiles-table { width: 100%; margin-top: 16px; }
    .list-actions { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .empty-message { padding: 48px 16px; text-align: center; color: #999; }
    .profile-form { max-width: 800px; margin-top: 16px; }
    mat-checkbox { display: block; margin-bottom: 12px; }
    h3 { margin-top: 24px; margin-bottom: 16px; }

    .guide-content { max-width: 900px; margin: 0 auto; }
    .example-box { background: #f9f9f9; padding: 16px; border-left: 4px solid #1976d2; border-radius: 4px; margin: 16px 0; }
    .example-box h4 { margin-top: 12px; }
    .example-box ul { margin: 8px 0; }
    .behavior-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .behavior-table th, .behavior-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    .behavior-table th { background: #f5f5f5; font-weight: 600; }
    .behavior-table tr:last-child td { border-bottom: none; }
  `]
})
export class CloudInitProfilesComponent implements OnInit {
  profiles = signal<CloudInitProfile[]>([]);
  displayedColumns = ['name', 'features', 'actions'];
  quickForm!: FormGroup;

  constructor(
    private cloudInitService: CloudInitService,
    private snackBar: MatSnackBar,
    private router: Router,
    private fb: FormBuilder
  ) {
    this.initQuickForm();
  }

  ngOnInit(): void {
    this.loadProfiles();
  }

  private initQuickForm(): void {
    this.quickForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      default_user: ['ubuntu'],
      default_password: [''],
      disable_root: [false],
      ssh_pwauth: [true],
      apt_update: [true],
      apt_upgrade: [false],
      packages_text: [''],
      ssh_authorized_keys_text: [''],
      timezone: [''],
      locale: [''],
      install_docker: [false],
      docker_compose_path: ['/root/docker-compose.yml'],
      start_docker_compose: [false]
    });
  }

  private loadProfiles(): void {
    this.cloudInitService.listProfiles().subscribe({
      next: (res) => {
        this.profiles.set(res.profiles || []);
      },
      error: (err) => {
        this.snackBar.open('Failed to load profiles', 'Close', { duration: 3000 });
      }
    });
  }

  createQuickProfile(): void {
    if (!this.quickForm.valid) {
      this.snackBar.open('Please fill in required fields', 'Close', { duration: 3000 });
      return;
    }

    const formValue = this.quickForm.value;
    const packages = (formValue.packages_text || '')
      .split('\n')
      .map((p: string) => p.trim())
      .filter((p: string) => p);

    const sshKeys = (formValue.ssh_authorized_keys_text || '')
      .split('\n')
      .map((k: string) => k.trim())
      .filter((k: string) => k);

    const profile: CloudInitProfile = {
      name: formValue.name,
      description: formValue.description,
      default_user: formValue.default_user,
      default_password: formValue.default_password,
      disable_root: formValue.disable_root,
      ssh_pwauth: formValue.ssh_pwauth,
      apt_update: formValue.apt_update,
      apt_upgrade: formValue.apt_upgrade,
      apt_reboot_if_required: false,
      packages,
      ssh_authorized_keys: sshKeys,
      timezone: formValue.timezone,
      locale: formValue.locale,
      install_docker: formValue.install_docker,
      docker_compose_path: formValue.docker_compose_path,
      start_docker_compose: formValue.start_docker_compose
    };

    this.cloudInitService.createProfile(profile).subscribe({
      next: () => {
        this.snackBar.open('Profile created successfully', 'Close', { duration: 3000 });
        this.resetQuickForm();
        this.loadProfiles();
      },
      error: (err) => {
        this.snackBar.open('Failed to create profile: ' + (err.error?.detail || 'Unknown error'), 'Close', { duration: 4000 });
      }
    });
  }

  editProfile(profile: CloudInitProfile): void {
    this.router.navigate(['/cloud-init/builder'], { queryParams: { id: profile.id } });
  }

  deleteProfile(id: number | undefined): void {
    if (!id) return;
    if (confirm('Are you sure you want to delete this profile?')) {
      this.cloudInitService.deleteProfile(id).subscribe({
        next: () => {
          this.snackBar.open('Profile deleted', 'Close', { duration: 3000 });
          this.loadProfiles();
        },
        error: (err) => {
          this.snackBar.open('Failed to delete profile', 'Close', { duration: 4000 });
        }
      });
    }
  }

  openProfileBuilder(): void {
    this.router.navigate(['/cloud-init/builder']);
  }

  resetQuickForm(): void {
    this.initQuickForm();
  }
}

