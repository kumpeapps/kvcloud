import { Component, OnInit, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material.module';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { MatSnackBar } from '@angular/material/snack-bar';

interface CloudInitPreview {
  yaml: string;
  variables: any;
  network_config: any;
  proxmox_config: any;
  yaml_source?: 'snippet' | 'generated';
  overrides?: any;
}

interface CloudInitProfileListItem {
  id: number;
  name: string;
}

@Component({
  selector: 'app-vm-cloud-init-display',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  template: `
    <mat-card class="cloud-init-card">
      <mat-card-header>
        <mat-icon mat-card-avatar color="primary">cloud_queue</mat-icon>
        <mat-card-title>Provisioning</mat-card-title>
        <div class="header-actions">
          <button mat-icon-button (click)="refreshPreview()" [disabled]="loading()" matTooltip="Refresh">
            <mat-icon>refresh</mat-icon>
          </button>
        </div>
      </mat-card-header>

      <mat-card-content>
        <div *ngIf="loading()" class="loading-state">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Loading provisioning configuration...</p>
        </div>

        <div *ngIf="!loading() && error()" class="error-state">
          <mat-icon color="warn">error</mat-icon>
          <p>{{ error() }}</p>
        </div>

        <div *ngIf="!loading() && !error() && !hasConfig()" class="no-config-state">
          <mat-icon>info</mat-icon>
          <p>No provisioning configuration found for this VM</p>
          <p class="hint">Apply provisioning overrides to configure this VM</p>
        </div>

        <div *ngIf="!loading() && !error() && hasConfig()" class="config-container">
          <!-- Removed Cloud-Init Fields Summary -->

          <!-- Overrides Form -->
          <mat-expansion-panel class="config-section" [expanded]="true">
            <mat-expansion-panel-header>
              <mat-panel-title>
                <mat-icon>tune</mat-icon>
                Per-VM Overrides & Provisioning
              </mat-panel-title>
            </mat-expansion-panel-header>

            <div class="section-content">
              <!-- Base Profile (optional, shown only when accessible) -->
              <div class="config-grid" *ngIf="profiles.length > 0">
                <div class="config-item">
                  <span class="config-label">Base Profile (optional)</span>
                  <mat-form-field appearance="outline">
                    <mat-select placeholder="Select a profile" [(ngModel)]="selectedProfileId">
                      <mat-option [value]="null">None</mat-option>
                      <mat-option *ngFor="let p of profiles" [value]="p.id">{{ p.name }}</mat-option>
                    </mat-select>
                  </mat-form-field>
                </div>
              </div>

              <!-- User & Auth -->
              <div class="config-grid">
                <div class="config-item">
                  <span class="config-label">Username</span>
                  <input matInput placeholder="debian" [(ngModel)]="overrides.default_user">
                </div>
                <div class="config-item">
                  <span class="config-label">Password</span>
                  <input matInput type="password" placeholder="Optional (hashed recommended)" [(ngModel)]="overrides.default_password">
                  <small>Tip: Use mkpasswd -m sha-512 to generate a hash</small>
                </div>
                <div class="config-item">
                  <span class="config-label">SSH Keys (one per line)</span>
                  <textarea matInput rows="4" [(ngModel)]="overrides_ssh_keys_text" placeholder="ssh-ed25519 AAAA... user@example"></textarea>
                </div>
                <div class="config-item">
                  <mat-checkbox [(ngModel)]="overrides.ssh_pwauth">Allow SSH password auth</mat-checkbox>
                </div>
              </div>

              <!-- Packages -->
              <div class="config-grid">
                <div class="config-item">
                  <span class="config-label">Packages (comma-separated)</span>
                  <input matInput [(ngModel)]="overrides_packages_text" placeholder="curl, htop, docker.io">
                </div>
                <div class="config-item">
                  <mat-checkbox [(ngModel)]="overrides.apt_update">Run apt update</mat-checkbox>
                </div>
                <div class="config-item">
                  <mat-checkbox [(ngModel)]="overrides.apt_upgrade">Run apt upgrade</mat-checkbox>
                </div>
                <div class="config-item">
                  <mat-checkbox [(ngModel)]="overrides.apt_reboot_if_required">Reboot if required</mat-checkbox>
                </div>
              </div>

              <!-- Docker Compose -->
              <div class="config-grid">
                <div class="config-item">
                  <span class="config-label">Compose Path</span>
                  <input matInput [(ngModel)]="overrides.docker_compose_path" placeholder="/root/docker-compose.yml">
                </div>
                <div class="config-item">
                  <span class="config-label">Compose Content</span>
                  <textarea matInput rows="6" [(ngModel)]="overrides.docker_compose_content" placeholder="version: '3'\nservices:\n  ..."></textarea>
                </div>
                <div class="config-item">
                  <mat-checkbox [(ngModel)]="overrides.start_docker_compose">Start after provisioning</mat-checkbox>
                </div>
              </div>

              <!-- Locale/Time -->
              <div class="config-grid">
                <div class="config-item">
                  <span class="config-label">Timezone</span>
                  <input matInput [(ngModel)]="overrides.timezone" placeholder="America/New_York">
                </div>
                <div class="config-item">
                  <span class="config-label">Locale</span>
                  <input matInput [(ngModel)]="overrides.locale" placeholder="en_US.UTF-8">
                </div>
              </div>

              <!-- Actions -->
              <div style="display:flex; gap: 12px;">
                <button mat-raised-button color="primary" (click)="applyOverrides(true)" [disabled]="savingOverrides">
                  <mat-icon>save</mat-icon>
                  Save & Redeploy (and Provision)
                </button>
                <button mat-stroked-button (click)="resetOverrides()" [disabled]="savingOverrides">Reset</button>
                <button mat-stroked-button color="accent" (click)="retryProvision()" [disabled]="savingOverrides">
                  <mat-icon>replay</mat-icon>
                  Retry Provision via Guest Agent
                </button>
              </div>
              <div class="reboot-note">
                <mat-icon>info</mat-icon>
                <div>
                  <div>
                    Cloud-init ISO is updated. If this VM has already booted, run a clean and reboot inside the guest to re-apply changes.
                  </div>
                  <pre class="cmd">sudo cloud-init clean --logs && sudo reboot</pre>
                </div>
              </div>
              <div *ngIf="saveError" class="error-state" style="align-items:flex-start;">
                <mat-icon color="warn">error</mat-icon>
                <p>{{ saveError }}</p>
              </div>
            </div>
          </mat-expansion-panel>

          <!-- Provisioning Result -->
          <mat-expansion-panel class="config-section" [expanded]="false" *ngIf="provisionResult">
            <mat-expansion-panel-header>
              <mat-panel-title>
                <mat-icon>task_alt</mat-icon>
                Last Provisioning Result
              </mat-panel-title>
            </mat-expansion-panel-header>
            <div class="section-content">
              <div class="config-grid">
                <div class="config-item" *ngFor="let s of provisionResult.steps || []">
                  <span class="config-label">{{ s.step }}</span>
                  <span class="config-value">{{ s.status }}</span>
                  <span *ngIf="s.detail" class="config-value">{{ s.detail }}</span>
                </div>
                <div class="config-item" *ngIf="provisionResult.error">
                  <span class="config-label">Error</span>
                  <span class="config-value">{{ provisionResult.error }}</span>
                </div>
              </div>
            </div>
          </mat-expansion-panel>

          <!-- Removed YAML Preview -->

          <!-- Network Config -->
          <mat-expansion-panel class="config-section" *ngIf="preview()?.network_config">
            <mat-expansion-panel-header>
              <mat-panel-title>
                <mat-icon>language</mat-icon>
                Network Configuration
              </mat-panel-title>
            </mat-expansion-panel-header>

            <div class="section-content">
              <div class="config-grid">
                <div class="config-item" *ngIf="preview()?.network_config?.ip_address">
                  <span class="config-label">IP Address:</span>
                  <code class="config-value">{{ preview()?.network_config?.ip_address }}</code>
                </div>
                <div class="config-item" *ngIf="preview()?.network_config?.gateway">
                  <span class="config-label">Gateway:</span>
                  <code class="config-value">{{ preview()?.network_config?.gateway }}</code>
                </div>
                <div class="config-item" *ngIf="preview()?.network_config?.dns_servers?.length">
                  <span class="config-label">DNS Servers:</span>
                  <code class="config-value">{{ preview()?.network_config?.dns_servers?.join(', ') }}</code>
                </div>
                <div class="config-item" *ngIf="preview()?.network_config?.enable_dhcp">
                  <span class="config-label">DHCP:</span>
                  <span class="config-value">Enabled</span>
                </div>
              </div>
            </div>
          </mat-expansion-panel>

          <!-- Guest Agent Note -->
          <div class="reboot-note">
            <mat-icon>info</mat-icon>
            <div>
              <div>
                Provisioning runs via QEMU Guest Agent. Ensure the agent is installed and enabled in the guest image.
              </div>
              <pre class="cmd">sudo systemctl enable --now qemu-guest-agent</pre>
            </div>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .cloud-init-card {
      margin-bottom: 24px;
    }

    .loading-state,
    .error-state,
    .no-config-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      text-align: center;
      gap: 16px;
    }

    .error-state {
      color: var(--mdc-theme-error, #f44336);
    }

    .config-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .config-section {
      border: 1px solid rgba(0, 0, 0, 0.12);
    }

    .section-content {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .config-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .config-label {
      font-weight: 500;
      color: rgba(0, 0, 0, 0.87);
      font-size: 14px;
    }

    .config-value {
      background-color: #f5f5f5;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      word-break: break-all;
      color: #333;
    }

    .ssh-keys-display {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ssh-key {
      background-color: #f5f5f5;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      word-break: break-all;
      color: #333;
      border-left: 3px solid #1976d2;
      padding-left: 10px;
    }

    .empty-section {
      padding: 16px;
      text-align: center;
      color: rgba(0, 0, 0, 0.54);
      font-style: italic;
    }

    mat-expansion-panel-header {
      background-color: #fafafa;
    }

    mat-icon {
      margin-right: 8px;
    }

    .header-actions {
      margin-left: auto;
    }

    .yaml-section .yaml-content {
      padding: 0;
    }

    .yaml-display {
      margin: 0;
      padding: 1rem;
      background-color: #263238;
      color: #aed581;
      border-radius: 0;
      overflow-x: auto;
      font-family: 'Roboto Mono', 'Courier New', monospace;
      font-size: 0.875rem;
      line-height: 1.5;
      white-space: pre;
    }

    .no-config-state .hint {
      margin-top: 0.5rem;
      font-size: 0.875rem;
      opacity: 0.7;
    }

    .reboot-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 12px;
      padding: 8px 12px;
      background: #f5f5f5;
      border-left: 3px solid #1976d2;
      border-radius: 4px;
    }

    .reboot-note .cmd {
      margin: 6px 0 0 0;
      background: #263238;
      color: #c3e88d;
      padding: 8px;
      border-radius: 4px;
      font-family: 'Roboto Mono', 'Courier New', monospace;
      font-size: 12px;
    }

    .chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 18px;
      background: #e0e0e0;
      color: #333;
      border: 1px solid transparent;
    }
    .chip-snippet {
      background: #e8f5e9;
      color: #2e7d32;
      border-color: #2e7d32;
    }
    .chip-generated {
      background: #fff8e1;
      color: #f57c00;
      border-color: #f57c00;
    }
  `]
})
export class VmCloudInitDisplayComponent implements OnInit {
  @Input() nodeId!: number;
  @Input() vmid!: number;

  preview = signal<CloudInitPreview | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  provisionResult: any = null;

  // Overrides state
  overrides: any = {
    default_user: '',
    default_password: '',
    ssh_pwauth: true,
    packages: [],
    apt_update: true,
    apt_upgrade: false,
    apt_reboot_if_required: false,
    docker_compose_content: '',
    docker_compose_path: '/root/docker-compose.yml',
    start_docker_compose: false,
    timezone: '',
    locale: ''
  };
  overrides_ssh_keys_text = '';
  overrides_packages_text = '';
  savingOverrides = false;
  saveError: string | null = null;

  // Profiles
  profiles: CloudInitProfileListItem[] = [];
  selectedProfileId: number | null = null;

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadConfig();
    this.loadProfiles();
  }

  loadConfig(): void {
    this.loading.set(true);
    this.error.set(null);

    const url = `${environment.apiUrl}/cloud-init/vm/${this.nodeId}/${this.vmid}/preview`;
    this.http.get<CloudInitPreview>(url).subscribe({
      next: (response) => {
        this.preview.set(response);
        this.applyPreviewOverrides(response.overrides);
        // Capture provision result if backend included it
        if ((response as any)?.provision_result) {
          this.provisionResult = (response as any).provision_result;
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading provisioning preview:', err);
        this.error.set('Failed to load provisioning configuration');
        this.loading.set(false);
      }
    });
  }

  refreshPreview(): void {
    this.loadConfig();
  }

  loadProfiles(): void {
    this.http.get<{ profiles: CloudInitProfileListItem[] }>(`${environment.apiUrl}/cloud-init/profiles`).subscribe({
      next: (resp) => {
        this.profiles = resp?.profiles || [];
      },
      error: () => {
        // Non-fatal if access denied (non-admins)
        this.profiles = [];
      }
    });
  }

  hasConfig(): boolean {
    const p = this.preview();
    if (!p) return false;
    
    const cfg = p.proxmox_config;
    return !!(
      cfg?.ciuser ||
      cfg?.has_cipassword ||
      cfg?.has_sshkeys ||
      cfg?.ipconfig0 ||
      cfg?.nameserver ||
      cfg?.searchdomain ||
      p.yaml
    );
  }

  applyOverrides(withProvision: boolean = false): void {
    this.saveError = null;
    this.savingOverrides = true;

    const sshKeys = this.overrides_ssh_keys_text
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const packages = this.overrides_packages_text
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const payload: any = {
      node_id: this.nodeId,
      vmid: this.vmid,
      profile_id: this.selectedProfileId,
      provision_via_guest_agent: withProvision,
      default_user: this.overrides.default_user || null,
      default_password: this.overrides.default_password || null,
      ssh_authorized_keys: sshKeys.length ? sshKeys : null,
      ssh_pwauth: this.overrides.ssh_pwauth,
      packages: packages.length ? packages : null,
      apt_update: this.overrides.apt_update,
      apt_upgrade: this.overrides.apt_upgrade,
      apt_reboot_if_required: this.overrides.apt_reboot_if_required,
      docker_compose_content: this.overrides.docker_compose_content || null,
      docker_compose_path: this.overrides.docker_compose_path || null,
      start_docker_compose: this.overrides.start_docker_compose,
      timezone: this.overrides.timezone || null,
      locale: this.overrides.locale || null
    };

    const url = `${environment.apiUrl}/cloud-init/vm/${this.nodeId}/${this.vmid}/apply-overrides`;
    this.http.post(url, payload).subscribe({
      next: (resp: any) => {
        const msg = withProvision ? 'Overrides applied and guest provisioning started.' : 'Overrides saved. Retry Provision to apply via guest agent.';
        this.snackBar.open(msg, 'Close', { duration: 5000 });
        if (resp?.provision_result) {
          this.provisionResult = resp.provision_result;
        }
        this.savingOverrides = false;
        this.refreshPreview();
      },
      error: (err) => {
        console.error('Error applying overrides:', err);
        this.saveError = err?.error?.detail || 'Failed to apply overrides';
        this.savingOverrides = false;
      }
    });
  }

  retryProvision(): void {
    // Build payload from current overrides state
    const sshKeys = this.overrides_ssh_keys_text
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const payload: any = {
      node_id: this.nodeId,
      vmid: this.vmid,
      default_user: this.overrides.default_user || null,
      default_password: this.overrides.default_password || null,
      ssh_authorized_keys: sshKeys.length ? sshKeys : null,
      ssh_pwauth: this.overrides.ssh_pwauth,
      packages: this.overrides_packages_text.split(',').map(p => p.trim()).filter(p => p.length > 0),
      hostname: this.preview()?.variables?.vm_hostname || this.preview()?.variables?.vm_name || `vm-${this.vmid}`,
      timezone: this.overrides.timezone || null,
      docker_compose_content: this.overrides.docker_compose_content || null,
      docker_compose_path: this.overrides.docker_compose_path || null,
      start_docker_compose: this.overrides.start_docker_compose,
      write_network: true,
    };

    const url = `${environment.apiUrl}/provision/vm/guest-agent`;
    this.http.post(url, payload).subscribe({
      next: (resp: any) => {
        this.snackBar.open('Guest-agent provisioning executed.', 'Close', { duration: 4000 });
        this.provisionResult = resp?.result || null;
        this.refreshPreview();
      },
      error: (err) => {
        console.error('Error provisioning via agent:', err);
        this.snackBar.open(err?.error?.detail?.message || 'Provisioning failed', 'Close', { duration: 5000 });
      }
    });
  }

  resetOverrides(): void {
    this.overrides = {
      default_user: '',
      default_password: '',
      ssh_pwauth: true,
      packages: [],
      apt_update: true,
      apt_upgrade: false,
      apt_reboot_if_required: false,
      docker_compose_content: '',
      docker_compose_path: '/root/docker-compose.yml',
      start_docker_compose: false,
      timezone: '',
      locale: ''
    };
    this.overrides_ssh_keys_text = '';
    this.overrides_packages_text = '';
    this.saveError = null;
  }

  private applyPreviewOverrides(overrides: any): void {
    if (!overrides) return;

    this.overrides.default_user = overrides.default_user ?? this.overrides.default_user;
    // do not prefill password; keep blank for safety
    if (Array.isArray(overrides.ssh_authorized_keys)) {
      this.overrides_ssh_keys_text = overrides.ssh_authorized_keys.join('\n');
    }
    if (typeof overrides.ssh_pwauth === 'boolean') {
      this.overrides.ssh_pwauth = overrides.ssh_pwauth;
    }
    if (Array.isArray(overrides.packages)) {
      this.overrides_packages_text = overrides.packages.join(', ');
    }
    if (typeof overrides.apt_update === 'boolean') {
      this.overrides.apt_update = overrides.apt_update;
    }
    if (typeof overrides.apt_upgrade === 'boolean') {
      this.overrides.apt_upgrade = overrides.apt_upgrade;
    }
    if (typeof overrides.apt_reboot_if_required === 'boolean') {
      this.overrides.apt_reboot_if_required = overrides.apt_reboot_if_required;
    }
    if (overrides.docker_compose_path) {
      this.overrides.docker_compose_path = overrides.docker_compose_path;
    }
    if (overrides.docker_compose_content) {
      this.overrides.docker_compose_content = overrides.docker_compose_content;
    }
    if (typeof overrides.start_docker_compose === 'boolean') {
      this.overrides.start_docker_compose = overrides.start_docker_compose;
    }
    if (overrides.timezone) {
      this.overrides.timezone = overrides.timezone;
    }
    if (overrides.locale) {
      this.overrides.locale = overrides.locale;
    }
  }
}
