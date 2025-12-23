import { Component, OnInit, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material.module';
import { MatDialog } from '@angular/material/dialog';
import { VmComposeEditDialogComponent } from './vm-compose-edit-dialog.component';
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
                <div class="config-item">
                  <span class="config-label">Docker Registry URL</span>
                  <input matInput [(ngModel)]="overrides.docker_registry_url" placeholder="registry.example.com">
                </div>
                <div class="config-item">
                  <span class="config-label">Docker Registry Username</span>
                  <input matInput [(ngModel)]="overrides.docker_registry_username" placeholder="username">
                </div>
                <div class="config-item">
                  <span class="config-label">Docker Registry Password</span>
                  <input matInput type="password" [(ngModel)]="overrides.docker_registry_password" placeholder="password/token">
                </div>
              </div>

              <!-- Multi Compose Files -->
              <div class="config-grid">
                <div class="config-item">
                  <span class="config-label">Compose Files (agent)</span>
                  <div *ngIf="composeFiles.length; else noCompose">
                    <div class="compose-chip" *ngFor="let cf of composeFiles">
                      <div>
                        <strong>{{ cf.service_name || 'unnamed' }}</strong>
                        <div class="compose-meta">{{ cf.path }}</div>
                        <div class="compose-meta">Start on deploy: {{ cf.start_on_deploy ? 'Yes' : 'No' }} · Start on boot: {{ cf.start_on_boot ? 'Yes' : 'No' }}</div>
                        <div class="compose-meta" *ngIf="cf.template_id">Template #{{ cf.template_id }}</div>
                      </div>
                      <button mat-stroked-button color="primary" (click)="editCompose(cf)">Edit</button>
                      <button mat-stroked-button color="warn" (click)="removeCompose(cf)">Remove</button>
                    </div>
                  </div>
                  <ng-template #noCompose>
                    <div class="empty-section">No compose files added yet.</div>
                  </ng-template>
                </div>

                <div class="config-item">
                  <span class="config-label">Add Compose File</span>
                  <input matInput [(ngModel)]="newCompose.path" placeholder="/root/docker-compose.yml">
                  <input matInput [(ngModel)]="newCompose.service_name" placeholder="Service name (required for boot startup)" required>
                  <textarea matInput rows="4" [(ngModel)]="newCompose.content" placeholder="version: '3'&#10;services:&#10;  web: ..."></textarea>
                  <div style="display:flex; gap:12px; flex-wrap: wrap; align-items:center;">
                    <mat-checkbox [(ngModel)]="newCompose.start_on_deploy">Start on deploy</mat-checkbox>
                    <mat-checkbox [(ngModel)]="newCompose.start_on_boot">Start on boot</mat-checkbox>
                    <mat-checkbox [(ngModel)]="newCompose.update_on_template_update">Auto-update from template</mat-checkbox>
                  </div>
                  <button mat-raised-button color="primary" (click)="addComposeFile()" [disabled]="!newCompose.content || !newCompose.service_name">Add Compose</button>
                </div>

                <div class="config-item">
                  <span class="config-label">Add From Template</span>
                  <mat-form-field appearance="outline">
                    <mat-label>Select template</mat-label>
                    <mat-select [(ngModel)]="selectedTemplateId">
                      <mat-option [value]="null">None</mat-option>
                      <mat-option *ngFor="let tpl of composeTemplates" [value]="tpl.id">{{ tpl.name }}</mat-option>
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Service name</mat-label>
                    <input matInput [(ngModel)]="newCompose.service_name" placeholder="e.g. web, api" required>
                  </mat-form-field>
                  <textarea matInput rows="4" [(ngModel)]="templateVarsText" placeholder='{"project":"demo"}'>
                  </textarea>
                  <small>Provide JSON for template variables.</small>
                  <div style="display:flex; gap:12px; flex-wrap: wrap; align-items:center;">
                    <mat-checkbox [(ngModel)]="newCompose.start_on_deploy">Start on deploy</mat-checkbox>
                    <mat-checkbox [(ngModel)]="newCompose.start_on_boot">Start on boot</mat-checkbox>
                    <mat-checkbox [(ngModel)]="newCompose.update_on_template_update">Auto-update when template changes</mat-checkbox>
                  </div>
                  <button mat-stroked-button color="accent" (click)="addComposeFromTemplate()" [disabled]="!selectedTemplateId || !newCompose.service_name">Use Template</button>
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
              <div style="display:flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                <button mat-raised-button color="primary" (click)="applyOverrides(true)" [disabled]="savingOverrides">
                  <mat-icon>save</mat-icon>
                  Save
                </button>
                <button mat-stroked-button (click)="resetOverrides()" [disabled]="savingOverrides">Reset</button>
                <button mat-stroked-button color="accent" (click)="retryProvision()" [disabled]="savingOverrides">
                  <mat-icon>replay</mat-icon>
                  Retry Provision via Guest Agent
                </button>
                <button mat-stroked-button color="primary" (click)="installAgent()" [disabled]="installingAgent">
                  <mat-icon>cloud_download</mat-icon>
                  {{ installingAgent ? 'Installing Agent...' : (agentInstalled ? 'Reinstall Agent' : 'Install Agent') }}
                </button>
                <span class="chip" [ngClass]="agentInstalled ? 'chip-generated' : 'chip'" *ngIf="agentInstalled !== null">
                  <mat-icon style="vertical-align: middle; font-size:16px">{{ agentInstalled ? 'task_alt' : 'report_problem' }}</mat-icon>
                  Agent: {{ agentInstalled ? 'Installed' : 'Not Installed' }}
                  <span *ngIf="agentLastCheckin"> · Last check-in: {{ agentLastCheckin }}</span>
                </span>
              </div>

              <!-- Pending Provision Alert -->
              <div *ngIf="pendingProvision" class="pending-provision-alert">
                <mat-icon color="accent">schedule</mat-icon>
                <div>
                  <strong>Pending Provision Queued</strong>
                  <p>The agent will execute provisioning on next check-in.</p>
                  <details *ngIf="pendingProvisionConfig">
                    <summary>View Configuration</summary>
                    <pre>{{ pendingProvisionConfig | json }}</pre>
                  </details>
                </div>
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

    .pending-provision-alert {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-top: 16px;
      padding: 12px;
      background: #fff3cd;
      border-left: 4px solid #ff9800;
      border-radius: 4px;
    }

    .pending-provision-alert strong {
      display: block;
      margin-bottom: 4px;
    }

    .pending-provision-alert p {
      margin: 4px 0;
      font-size: 0.875rem;
    }

    .pending-provision-alert details {
      margin-top: 8px;
    }

    .pending-provision-alert summary {
      cursor: pointer;
      font-size: 0.875rem;
      color: #1976d2;
    }

    .pending-provision-alert pre {
      margin-top: 8px;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 0.75rem;
      overflow-x: auto;
    }

    .compose-chip {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .compose-meta {
      font-size: 12px;
      color: #555;
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
    docker_registry_url: '',
    docker_registry_username: '',
    docker_registry_password: '',
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

  // Agent status
  agentInstalled: boolean | null = null;
  agentLastCheckin: string | null = null;
  installingAgent: boolean = false;
  agentStatusError: string | null = null;

  // Pending provision status
  pendingProvision: boolean = false;
  pendingProvisionConfig: any = null;

  // Compose templates/files
  composeTemplates: any[] = [];
  composeFiles: any[] = [];
  newCompose: any = {
    path: '/root/docker-compose.yml',
    service_name: '',
    content: '',
    start_on_deploy: false,
    start_on_boot: false,
    update_on_template_update: false
  };
  selectedTemplateId: number | null = null;
  templateVarsText: string = '{}';

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadConfig();
    this.loadProfiles();
    this.loadAgentStatus();
    this.loadPendingProvision();
    this.loadComposeTemplates();
    this.loadComposeFiles();
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

  loadAgentStatus(): void {
    const url = `${environment.apiUrl}/provision/agent/status/${this.vmid}`;
    this.http.get<any>(url).subscribe({
      next: (resp) => {
        this.agentInstalled = !!resp?.agent_installed;
        this.agentLastCheckin = resp?.last_checkin || null;
      },
      error: (err) => {
        // Non-fatal; may be 404 if assignment not found
        this.agentStatusError = err?.error?.detail || null;
        this.agentInstalled = null;
      }
    });
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
      provision_via_guest_agent: false,
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
      docker_registry_url: this.overrides.docker_registry_url || null,
      docker_registry_username: this.overrides.docker_registry_username || null,
      docker_registry_password: this.overrides.docker_registry_password || null,
      timezone: this.overrides.timezone || null,
      locale: this.overrides.locale || null
    };

    const url = `${environment.apiUrl}/cloud-init/vm/${this.nodeId}/${this.vmid}/apply-overrides`;
    this.http.post(url, payload).subscribe({
      next: (resp: any) => {
        const queueAgent = withProvision;
        const finish = () => {
          this.savingOverrides = false;
          this.refreshPreview();
        };

        if (queueAgent) {
          this.queueAgentProvision(true, finish);
        } else {
          this.snackBar.open('Overrides saved. Retry Provision to apply via agent.', 'Close', { duration: 5000 });
          finish();
        }
      },
      error: (err) => {
        console.error('Error applying overrides:', err);
        this.saveError = err?.error?.detail || 'Failed to apply overrides';
        this.savingOverrides = false;
      }
    });
  }

  retryProvision(): void {
    this.queueAgentProvision(false);
  }

  private buildAgentProvisionPayload(): any {
    const sshKeys = this.overrides_ssh_keys_text
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    return {
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
      docker_registry_url: this.overrides.docker_registry_url || null,
      docker_registry_username: this.overrides.docker_registry_username || null,
      docker_registry_password: this.overrides.docker_registry_password || null,
      write_network: true,
    };
  }

  private queueAgentProvision(fromSave: boolean, onDone?: () => void): void {
    const payload = this.buildAgentProvisionPayload();
    const url = `${environment.apiUrl}/vms/${this.nodeId}/${this.vmid}/queue-provision`;
    this.http.post(url, payload).subscribe({
      next: () => {
        const msg = fromSave ? 'Saved and queued for agent provisioning.' : 'Provisioning queued for agent to execute.';
        this.snackBar.open(msg, 'Close', { duration: 4000 });
        this.loadPendingProvision();
        this.refreshPreview();
        if (onDone) onDone();
      },
      error: (err) => {
        console.error('Error queueing provision:', err);
        this.snackBar.open(err?.error?.detail?.message || 'Provisioning failed', 'Close', { duration: 5000 });
        if (onDone) onDone();
      }
    });
  }

  installAgent(): void {
    this.installingAgent = true;
    const url = `${environment.apiUrl}/provision/agent/install/${this.nodeId}/${this.vmid}`;
    this.http.post<any>(url, {}).subscribe({
      next: (resp) => {
        this.snackBar.open('Agent installed successfully.', 'Close', { duration: 4000 });
        this.installingAgent = false;
        this.agentInstalled = true;
        this.loadAgentStatus();
      },
      error: (err) => {
        console.error('Error installing agent:', err);
        this.snackBar.open(err?.error?.detail || 'Agent installation failed', 'Close', { duration: 5000 });
        this.installingAgent = false;
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
      docker_registry_url: '',
      docker_registry_username: '',
      docker_registry_password: '',
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
    if (overrides.docker_registry_url) {
      this.overrides.docker_registry_url = overrides.docker_registry_url;
    }
    if (overrides.docker_registry_username) {
      this.overrides.docker_registry_username = overrides.docker_registry_username;
    }
    if (overrides.docker_registry_password) {
      this.overrides.docker_registry_password = overrides.docker_registry_password;
    }
    if (overrides.timezone) {
      this.overrides.timezone = overrides.timezone;
    }
    if (overrides.locale) {
      this.overrides.locale = overrides.locale;
    }
  }

  loadComposeTemplates(): void {
    this.http.get<any[]>(`${environment.apiUrl}/vms/compose-templates`).subscribe({
      next: (resp: any) => {
        this.composeTemplates = resp || [];
      },
      error: (err) => {
        console.error('Failed to load compose templates', err);
      }
    });
  }

  loadComposeFiles(): void {
    const url = `${environment.apiUrl}/vms/${this.nodeId}/${this.vmid}/compose-files`;
    this.http.get<any[]>(url).subscribe({
      next: (resp) => {
        this.composeFiles = resp || [];
      },
      error: (err) => {
        console.error('Failed to load compose files', err);
      }
    });
  }

  addComposeFile(): void {
    const url = `${environment.apiUrl}/vms/${this.nodeId}/${this.vmid}/compose-files`;
    this.http.post<any>(url, this.newCompose).subscribe({
      next: () => {
        this.snackBar.open('Compose file added', 'Close', { duration: 3000 });
        this.loadComposeFiles();
        this.loadPendingProvision();
        this.newCompose = {
          path: '/root/docker-compose.yml',
          service_name: '',
          content: '',
          start_on_deploy: false,
          start_on_boot: false,
          update_on_template_update: false
        };
      },
      error: (err) => {
        console.error('Failed to add compose file', err);
        this.snackBar.open(err?.error?.detail || 'Failed to add compose', 'Close', { duration: 4000 });
      }
    });
  }

  private parseTemplateVars(): any {
    try {
      return this.templateVarsText ? JSON.parse(this.templateVarsText) : {};
    } catch (e) {
      this.snackBar.open('Invalid JSON for template variables', 'Close', { duration: 4000 });
      return null;
    }
  }

  addComposeFromTemplate(): void {
    if (!this.selectedTemplateId) {
      this.snackBar.open('Select a template first', 'Close', { duration: 3000 });
      return;
    }
    if (!this.newCompose.service_name) {
      this.snackBar.open('Service name is required', 'Close', { duration: 3000 });
      return;
    }
    const vars = this.parseTemplateVars();
    if (vars === null) return;
    const url = `${environment.apiUrl}/vms/${this.nodeId}/${this.vmid}/compose-from-template`;
    const payload = {
      template_id: this.selectedTemplateId,
      variables: vars,
      path: this.newCompose.path,
      service_name: this.newCompose.service_name,
      start_on_deploy: this.newCompose.start_on_deploy,
      start_on_boot: this.newCompose.start_on_boot,
      update_on_template_update: this.newCompose.update_on_template_update
    };
    this.http.post<any>(url, payload).subscribe({
      next: () => {
        this.snackBar.open('Compose added from template', 'Close', { duration: 3000 });
        this.loadComposeFiles();
        this.loadPendingProvision();
      },
      error: (err) => {
        console.error('Failed to add from template', err);
        this.snackBar.open(err?.error?.detail || 'Failed to add from template', 'Close', { duration: 4000 });
      }
    });
  }

  removeCompose(entry: any): void {
    if (!entry?.id) {
      this.snackBar.open('Missing compose id; refresh and try again', 'Close', { duration: 3000 });
      return;
    }
    const url = `${environment.apiUrl}/vms/${this.nodeId}/${this.vmid}/compose-files/${entry.id}`;
    this.http.delete<any>(url).subscribe({
      next: () => {
        this.snackBar.open('Compose removed', 'Close', { duration: 3000 });
        this.loadComposeFiles();
        this.loadPendingProvision();
      },
      error: (err) => {
        console.error('Failed to remove compose', err);
        this.snackBar.open(err?.error?.detail || 'Failed to remove compose', 'Close', { duration: 4000 });
      }
    });
  }

  editCompose(entry: any): void {
    if (!entry?.id) {
      this.snackBar.open('Missing compose id; refresh and try again', 'Close', { duration: 3000 });
      return;
    }
    const dialogRef = this.dialog.open(VmComposeEditDialogComponent, {
      width: '800px',
      data: {
        id: entry.id,
        path: entry.path,
        service_name: entry.service_name || '',
        content: entry.content,
        start_on_deploy: !!entry.start_on_deploy,
        start_on_boot: !!entry.start_on_boot,
        update_on_template_update: !!entry.update_on_template_update
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (!result) return; // cancelled
      const url = `${environment.apiUrl}/vms/${this.nodeId}/${this.vmid}/compose-files/${entry.id}`;
      const updateData = {
        path: result.path,
        service_name: result.service_name,
        content: result.content,
        start_on_deploy: !!result.start_on_deploy,
        start_on_boot: !!result.start_on_boot,
        update_on_template_update: !!result.update_on_template_update
      };
      this.http.put<any>(url, updateData).subscribe({
        next: () => {
          this.snackBar.open('Compose file updated', 'Close', { duration: 3000 });
          this.loadComposeFiles();
          this.loadPendingProvision();
        },
        error: (err) => {
          console.error('Failed to update compose', err);
          this.snackBar.open(err?.error?.detail || 'Failed to update compose', 'Close', { duration: 4000 });
        }
      });
    });
  }

  loadPendingProvision(): void {
    const url = `${environment.apiUrl}/vms/${this.nodeId}/${this.vmid}/pending-provision`;
    this.http.get<any>(url).subscribe({
      next: (resp) => {
        this.pendingProvision = resp.provision_pending || false;
        this.pendingProvisionConfig = resp.pending_config || null;
      },
      error: (err) => {
        console.error('Error loading pending provision:', err);
      }
    });
  }
}
