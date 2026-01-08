import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { ProvisioningService, ProvisioningProfile } from '../../core/services/provisioning.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-provisioning-profiles',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule, MatTabsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Provisioning Profiles</h1>
        <p class="subtitle">Manage VM provisioning profiles using KVCloud Agent</p>
      </div>

      <!-- Info Banner -->
      <mat-card class="info-banner">
        <mat-card-content>
          <div class="banner-content">
            <mat-icon class="info-icon">info</mat-icon>
            <div>
              <strong>Agent-Based Provisioning</strong>
              <p>KVCloud uses an intelligent agent-based provisioning system. The kvcloud-agent runs on your VMs and automatically applies configurations including users, packages, Docker containers, network settings, and more. Profiles created here serve as base templates that can be customized per-VM.</p>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-tab-group>
        <!-- Admin Profiles Tab -->
        <mat-tab label="Provisioning Profiles">
          <div class="tab-content">
            <div class="tab-intro">
              <p><strong>Provisioning Profiles</strong> are reusable configurations applied by the KVCloud Agent. When creating VMs, select a profile and optionally override settings on a per-VM basis.</p>
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
              <p><strong>Quick Create</strong> a provisioning profile with essential settings. Use the Advanced Builder for more options.</p>
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

        <!-- How It Works Tab -->
        <mat-tab label="How It Works">
          <div class="tab-content guide-content">
            <h2>Agent-Based Provisioning System</h2>
            
            <mat-card>
              <mat-card-header>
                <mat-card-title><mat-icon>architecture</mat-icon> Overview</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <p>KVCloud uses an intelligent agent-based provisioning system that reliably configures VMs even when network connectivity or guest services are intermittent.</p>
                <ol>
                  <li><strong>Agent Installation:</strong> The kvcloud-agent is installed on VMs via QEMU Guest Agent during VM creation</li>
                  <li><strong>Configuration Polling:</strong> The agent polls the KVCloud API every 60 seconds for pending provisioning tasks</li>
                  <li><strong>Task Execution:</strong> When tasks are found, the agent executes them locally (users, packages, Docker, network, etc.)</li>
                  <li><strong>Status Reporting:</strong> Results are reported back to the API, including success/failure and detailed logs</li>
                  <li><strong>Persistence:</strong> The agent survives reboots and retries failed operations automatically</li>
                </ol>
              </mat-card-content>
            </mat-card>

            <mat-card>
              <mat-card-header>
                <mat-card-title><mat-icon>merge_type</mat-icon> Profile Merging & Per-VM Overrides</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="example-box">
                  <h4>Base Profile: "Production Ubuntu"</h4>
                  <ul>
                    <li>Default user: ubuntu</li>
                    <li>SSH pwauth: enabled</li>
                    <li>APT update: yes, APT upgrade: yes</li>
                    <li>Packages: curl, git, htop, nginx</li>
                  </ul>

                  <h4>VM Creation: web-server-01</h4>
                  <ul>
                    <li>Selected Profile: "Production Ubuntu"</li>
                    <li>Per-VM Overrides:
                      <ul>
                        <li>Default password: <em>custom password</em></li>
                        <li>SSH keys: <em>team's additional keys</em></li>
                        <li>Additional packages: <em>postgresql, redis</em></li>
                      </ul>
                    </li>
                  </ul>

                  <h4>Final Configuration Applied by Agent</h4>
                  <ul>
                    <li>Default user: ubuntu (from profile)</li>
                    <li>Password: <em>custom password</em> (VM override)</li>
                    <li>SSH keys: <em>profile keys + team keys</em> (merged)</li>
                    <li>Packages: curl, git, htop, nginx, postgresql, redis (merged)</li>
                  </ul>
                </div>

                <h4>Merge Rules</h4>
                <table class="behavior-table">
                  <tr>
                    <th>Field Type</th>
                    <th>Merge Behavior</th>
                    <th>Example</th>
                  </tr>
                  <tr>
                    <td><strong>Scalar Values</strong></td>
                    <td>VM override replaces profile value</td>
                    <td>default_user, timezone, ssh_pwauth</td>
                  </tr>
                  <tr>
                    <td><strong>Lists</strong></td>
                    <td>VM items are added to profile list (no duplicates)</td>
                    <td>packages, ssh_authorized_keys</td>
                  </tr>
                </table>
              </mat-card-content>
            </mat-card>

            <mat-card>
              <mat-card-header>
                <mat-card-title><mat-icon>power_settings_new</mat-icon> What the Agent Can Do</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <ul>
                  <li><strong>User Management:</strong> Create users, set passwords, configure sudo access, SSH keys</li>
                  <li><strong>Package Management:</strong> Install packages via apt, configure repositories</li>
                  <li><strong>Docker:</strong> Install Docker, configure registry authentication, deploy Docker Compose stacks</li>
                  <li><strong>Network:</strong> Configure static IPs, DNS, hostnames via netplan</li>
                  <li><strong>System:</strong> Set timezone, locale, expand root filesystem after disk resize</li>
                  <li><strong>Persistence:</strong> Survives reboots, retries failed operations, reports detailed logs</li>
                </ul>
              </mat-card-content>
            </mat-card>

            <mat-card>
              <mat-card-header>
                <mat-card-title><mat-icon>bug_report</mat-icon> Troubleshooting</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <p>If provisioning fails or doesn't apply:</p>
                <ul>
                  <li>Check VM has QEMU Guest Agent installed and running</li>
                  <li>Verify kvcloud-agent service is active: <code>systemctl status kvcloud-agent</code></li>
                  <li>View agent logs: <code>journalctl -u kvcloud-agent -n 50</code> or <code>/var/log/kvcloud-agent.log</code></li>
                  <li>Ensure VM can reach KVCloud API (network connectivity)</li>
                  <li>Trigger manual provisioning from VM details page</li>
                </ul>
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
    
    .info-banner { margin-bottom: 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .info-banner mat-card-content { padding: 16px; }
    .banner-content { display: flex; align-items: flex-start; gap: 16px; }
    .banner-content .info-icon { font-size: 32px; width: 32px; height: 32px; flex-shrink: 0; }
    .banner-content strong { display: block; margin-bottom: 4px; font-size: 16px; }
    .banner-content p { margin: 0; opacity: 0.95; line-height: 1.5; }
    
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
    .guide-content h2 { margin-bottom: 24px; opacity: 0.87; }
    .guide-content mat-card { margin-bottom: 24px; }
    .guide-content mat-card-header { background: #f5f5f5; padding: 16px; }
    .guide-content mat-card-title { display: flex; align-items: center; gap: 8px; font-size: 18px; }
    .guide-content mat-card-title mat-icon { color: #1976d2; }
    .guide-content mat-card-content { padding: 20px; }
    .guide-content ul { line-height: 1.8; }
    .guide-content code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    
    .example-box { background: #f9f9f9; padding: 16px; border-left: 4px solid #1976d2; border-radius: 4px; margin: 16px 0; }
    .example-box h4 { margin-top: 12px; color: #1976d2; }
    .example-box ul { margin: 8px 0; }
    .behavior-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .behavior-table th, .behavior-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    .behavior-table th { background: #f5f5f5; font-weight: 600; }
    .behavior-table tr:last-child td { border-bottom: none; }
  `]
})
export class ProvisioningProfilesComponent implements OnInit {
  profiles = signal<ProvisioningProfile[]>([]);
  displayedColumns = ['name', 'features', 'actions'];
  quickForm!: FormGroup;

  constructor(
    private provisioningService: ProvisioningService,
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
    this.provisioningService.listProfiles().subscribe({
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

    const profile: ProvisioningProfile = {
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

    this.provisioningService.createProfile(profile).subscribe({
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

  editProfile(profile: ProvisioningProfile): void {
    this.router.navigate(['/provisioning/builder'], { queryParams: { id: profile.id } });
  }

  deleteProfile(id: number | undefined): void {
    if (!id) return;
    if (confirm('Are you sure you want to delete this profile?')) {
      this.provisioningService.deleteProfile(id).subscribe({
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
    this.router.navigate(['/provisioning/builder']);
  }

  resetQuickForm(): void {
    this.initQuickForm();
  }
}

