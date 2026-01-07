import { Component, Inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../shared/material.module';
import { MatTabsModule } from '@angular/material/tabs';
import { MatStepperModule } from '@angular/material/stepper';
import { SshKeyService } from '../../core/services/ssh-key.service';
import { VmUserService } from '../../core/services/vm-user.service';
import { ProvisioningService } from '../../core/services/provisioning.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-vm-cloud-init-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule, MatTabsModule, MatStepperModule],
  template: `
    <h2 mat-dialog-title>Cloud-init Configuration</h2>
    
    <mat-dialog-content>
      <mat-stepper #stepper linear>
        <!-- Step 1: Network Configuration -->
        <mat-step label="Network Configuration">
          <div class="step-content">
            <p class="step-subtitle">Configure IP, gateway, and DNS settings</p>
            <div *ngIf="networkConfig.ip_address" class="auto-config-hint success">
              <mat-icon>check_circle</mat-icon>
              Network settings auto-populated from assigned IP configuration
            </div>
            <div *ngIf="!networkConfig.ip_address" class="auto-config-hint warning">
              <mat-icon>info</mat-icon>
              No IP assigned yet. Configure manually or assign an IP first.
            </div>
            
            <div class="form-group">
              <mat-checkbox [(ngModel)]="networkConfig.enable_dhcp" class="full-width">
                Use DHCP instead of static IP
              </mat-checkbox>
            </div>

            <div *ngIf="!networkConfig.enable_dhcp" class="form-section">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>IP Address</mat-label>
                <input matInput [(ngModel)]="networkConfig.ip_address" placeholder="e.g., 192.168.1.100">
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Gateway</mat-label>
                <input matInput [(ngModel)]="networkConfig.gateway" placeholder="e.g., 192.168.1.1">
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>DNS Servers (comma-separated)</mat-label>
                <input matInput [(ngModel)]="networkConfig.dns_servers" placeholder="e.g., 8.8.8.8, 8.8.4.4">
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Hostname (Optional)</mat-label>
                <input matInput [(ngModel)]="networkConfig.hostname" placeholder="e.g., myvm">
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Domain Search (Optional)</mat-label>
                <input matInput [(ngModel)]="networkConfig.domain_search" placeholder="e.g., example.com">
              </mat-form-field>
            </div>

            <div class="step-actions">
              <button mat-button matStepperNext>Next</button>
            </div>
          </div>
        </mat-step>

        <!-- Step 2: Root User Configuration -->
        <mat-step label="Root User Setup">
          <div class="step-content">
            <p class="step-subtitle">Configure the root/default user for the VM</p>
            
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Username</mat-label>
              <input matInput [(ngModel)]="rootUser.username" placeholder="e.g., ubuntu, admin, root">
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Password (Optional)</mat-label>
              <input matInput [(ngModel)]="rootUser.password" type="password" placeholder="Leave empty for SSH-only access">
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>SSH Keys</mat-label>
              <mat-select [(ngModel)]="rootUser.sshKeyIds" multiple>
                <mat-option *ngFor="let key of userSshKeys()" [value]="key.id">
                  {{ key.name }}
                </mat-option>
              </mat-select>
              <mat-hint>Select one or more SSH keys for password-less login</mat-hint>
            </mat-form-field>

            <mat-checkbox [(ngModel)]="rootUser.sudo_access" class="full-width">
              Grant sudo access to this user
            </mat-checkbox>

            <div class="step-actions">
              <button mat-button matStepperPrevious>Back</button>
              <button mat-button matStepperNext>Next</button>
            </div>
          </div>
        </mat-step>

        <!-- Step 3: Additional Users -->
        <mat-step label="Additional Users (Optional)">
          <div class="step-content">
            <p class="step-subtitle">Create additional user accounts on the VM</p>

            <div class="users-list" *ngIf="additionalUsers().length > 0">
              <div *ngFor="let user of additionalUsers(); let i = index" class="user-card">
                <div class="user-header">
                  <h3>{{ user.username }}</h3>
                  <button mat-icon-button color="warn" (click)="removeAdditionalUser(i)">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
                <p>SSH Keys: {{ user.sshKeyIds?.length || 0 }} assigned</p>
              </div>
            </div>

            <div class="add-user-form">
              <h3>Add New User</h3>
              
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Username</mat-label>
                <input matInput [(ngModel)]="newAdditionalUser.username" placeholder="e.g., deploy, appuser">
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Password (Optional)</mat-label>
                <input matInput [(ngModel)]="newAdditionalUser.password" type="password">
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>SSH Keys</mat-label>
                <mat-select [(ngModel)]="newAdditionalUser.sshKeyIds" multiple>
                  <mat-option *ngFor="let key of userSshKeys()" [value]="key.id">
                    {{ key.name }}
                  </mat-option>
                </mat-select>
              </mat-form-field>

              <mat-checkbox [(ngModel)]="newAdditionalUser.sudo_access">
                Grant sudo access
              </mat-checkbox>

              <button mat-button color="primary" (click)="addAdditionalUser()" [disabled]="!newAdditionalUser.username">
                <mat-icon>person_add</mat-icon> Add User
              </button>
            </div>

            <div class="step-actions">
              <button mat-button matStepperPrevious>Back</button>
              <button mat-button matStepperNext>Next</button>
            </div>
          </div>
        </mat-step>

        <!-- Step 4: Review & Apply -->
        <mat-step label="Review & Apply">
          <div class="step-content">
            <p class="step-subtitle">Review your cloud-init configuration</p>

            <mat-card class="review-card">
              <mat-card-title>Network Configuration</mat-card-title>
              <mat-card-content>
                <p><strong>DHCP:</strong> {{ networkConfig.enable_dhcp ? 'Enabled' : 'Disabled (Static IP)' }}</p>
                <p *ngIf="!networkConfig.enable_dhcp"><strong>IP:</strong> {{ networkConfig.ip_address || 'Not set' }}</p>
                <p *ngIf="!networkConfig.enable_dhcp"><strong>Gateway:</strong> {{ networkConfig.gateway || 'Not set' }}</p>
                <p *ngIf="!networkConfig.enable_dhcp"><strong>DNS:</strong> {{ networkConfig.dns_servers || 'Default' }}</p>
                <p *ngIf="networkConfig.hostname"><strong>Hostname:</strong> {{ networkConfig.hostname }}</p>
              </mat-card-content>
            </mat-card>

            <mat-card class="review-card">
              <mat-card-title>Users</mat-card-title>
              <mat-card-content>
                <p><strong>Root/Default User:</strong> {{ rootUser.username }}</p>
                <p><strong>SSH Keys:</strong> {{ rootUser.sshKeyIds?.length || 0 }}</p>
                <p><strong>Sudo Access:</strong> {{ rootUser.sudo_access ? 'Yes' : 'No' }}</p>
                
                <div *ngIf="additionalUsers().length > 0" class="mt-2">
                  <p><strong>Additional Users: {{ additionalUsers().length }}</strong></p>
                  <ul>
                    <li *ngFor="let u of additionalUsers()">
                      {{ u.username }} ({{ u.sshKeyIds?.length || 0 }} SSH keys)
                    </li>
                  </ul>
                </div>
              </mat-card-content>
            </mat-card>

            <div class="step-actions">
              <button mat-button matStepperPrevious>Back</button>
              <button mat-raised-button color="primary" (click)="applyConfig()" [disabled]="isApplying">
                <mat-spinner *ngIf="isApplying" diameter="20" class="mr-2"></mat-spinner>
                {{ isApplying ? 'Applying...' : 'Apply Configuration' }}
              </button>
            </div>
          </div>
        </mat-step>
      </mat-stepper>
    </mat-dialog-content>
  `,
  styles: [`
    mat-dialog-content { padding: 24px 0; }
    .step-content { padding: 24px 16px; }
    .step-subtitle { color: #666; margin-top: 0; margin-bottom: 16px; }
    .step-actions { margin-top: 24px; display: flex; gap: 8px; justify-content: flex-end; }
    .form-group, .form-section { margin-bottom: 16px; }
    .full-width { width: 100%; }
    .users-list { margin-bottom: 24px; }
    .user-card { 
      border: 1px solid #e0e0e0; 
      border-radius: 4px; 
      padding: 12px; 
      margin-bottom: 8px;
    }
    .user-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
    }
    .user-header h3 { margin: 0; }
    .add-user-form { 
      border: 2px dashed #ccc; 
      border-radius: 4px; 
      padding: 16px; 
      background: #f9f9f9;
    }
    .add-user-form h3 { margin-top: 0; }
    .review-card { 
      margin-bottom: 16px; 
      background: var(--mdc-elevated-card-container-color, white);
      color: var(--mdc-theme-text-primary-on-background, rgba(0,0,0,0.87));
    }
    .mt-2 { margin-top: 16px; }
    .mr-2 { margin-right: 8px; }
    mat-spinner { display: inline-block; }
    .auto-config-hint { 
      padding: 12px; 
      border-radius: 4px; 
      font-size: 13px; 
      display: flex; 
      align-items: center; 
      gap: 8px; 
      margin-bottom: 16px; 
    }
    .auto-config-hint.success {
      background: rgba(76, 175, 80, 0.1);
      color: #2e7d32;
      border-left: 4px solid #4caf50;
    }
    .auto-config-hint.warning {
      background: rgba(255, 152, 0, 0.1);
      color: #e65100;
      border-left: 4px solid #ff9800;
    }
    .auto-config-hint mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .step-subtitle {
      color: var(--mdc-theme-text-secondary-on-background, rgba(0,0,0,0.6));
    }
    @media (prefers-color-scheme: dark) {
      .review-card {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.87);
      }
      .auto-config-hint.success {
        background: rgba(76, 175, 80, 0.2);
        color: #81c784;
      }
      .auto-config-hint.warning {
        background: rgba(255, 152, 0, 0.2);
        color: #ffb74d;
      }
      .step-subtitle {
        color: rgba(255, 255, 255, 0.6);
      }
    }
  `]
})
export class VmCloudInitConfigComponent implements OnInit {
  userSshKeys = signal<any[]>([]);
  additionalUsers = signal<any[]>([]);
  isApplying = false;

  networkConfig: any = {
    enable_dhcp: false,
    ip_address: '',
    gateway: '',
    dns_servers: '',
    hostname: '',
    domain_search: ''
  };

  rootUser: any = {
    username: 'ubuntu',
    password: '',
    sshKeyIds: [],
    sudo_access: true
  };

  newAdditionalUser: any = {
    username: '',
    password: '',
    sshKeyIds: [],
    sudo_access: false
  };

  constructor(
    public dialogRef: MatDialogRef<VmCloudInitConfigComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private sshKeyService: SshKeyService,
    private vmUserService: VmUserService,
    private provisioningService: ProvisioningService,
    private snackBar: MatSnackBar,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadUserSshKeys();
    this.loadVmNetworkConfig();
  }

  loadVmNetworkConfig(): void {
    // data.vmId is passed from vm-detail component
    const vmid = this.data.vmId || this.data.vmid;
    console.log('[CloudInit Config] Component data:', this.data);
    console.log('[CloudInit Config] Resolved VM ID:', vmid);
    
    if (!vmid) {
      console.error('[CloudInit Config] No VM ID provided to cloud-init config');
      return;
    }
    
    const url = `${environment.apiUrl}/vm-users/network/${vmid}`;
    console.log('[CloudInit Config] Fetching network config from:', url);
    
    this.http.get<{ config: any }>(url).subscribe({
      next: (resp) => {
        console.log('[CloudInit Config] Full API Response:', JSON.stringify(resp, null, 2));
        console.log('[CloudInit Config] Config object:', resp.config);
        console.log('[CloudInit Config] Config is null?', resp.config === null);
        console.log('[CloudInit Config] Config is undefined?', resp.config === undefined);
        
        if (resp.config) {
          // Auto-populate network config from existing VM configuration
          this.networkConfig = {
            enable_dhcp: resp.config.enable_dhcp || false,
            ip_address: resp.config.ip_address || '',
            gateway: resp.config.gateway || '',
            dns_servers: resp.config.dns_servers || '',
            hostname: resp.config.hostname || '',
            domain_search: resp.config.domain_search || ''
          };
          console.log('[CloudInit Config] Auto-populated network config:', this.networkConfig);
        } else {
          console.log('[CloudInit Config] No config in response - response.config is null/undefined');
        }
      },
      error: (err) => {
        console.error('[CloudInit Config] Error loading network config:', err);
        console.error('[CloudInit Config] Error status:', err.status);
        console.error('[CloudInit Config] Error message:', err.message);
        // No existing config, keep defaults
      }
    });
  }

  loadUserSshKeys(): void {
    this.sshKeyService.listMyKeys().subscribe({
      next: (res) => {
        this.userSshKeys.set(res.keys?.filter(k => k.is_active) || []);
      },
      error: (err) => {
        this.snackBar.open('Failed to load SSH keys', 'Close', { duration: 3000 });
      }
    });
  }

  isNetworkValid(): boolean {
    if (this.networkConfig.enable_dhcp) return true;
    return !!this.networkConfig.ip_address && !!this.networkConfig.gateway;
  }

  isRootUserValid(): boolean {
    return !!this.rootUser.username && (!!this.rootUser.password || this.rootUser.sshKeyIds?.length > 0);
  }

  addAdditionalUser(): void {
    if (!this.newAdditionalUser.username) {
      this.snackBar.open('Username is required', 'Close', { duration: 3000 });
      return;
    }
    
    this.additionalUsers.update(users => [
      ...users,
      {
        username: this.newAdditionalUser.username,
        password: this.newAdditionalUser.password,
        sshKeyIds: [...(this.newAdditionalUser.sshKeyIds || [])],
        sudo_access: this.newAdditionalUser.sudo_access
      }
    ]);

    this.newAdditionalUser = {
      username: '',
      password: '',
      sshKeyIds: [],
      sudo_access: false
    };

    this.snackBar.open('User added', 'Close', { duration: 2000 });
  }

  removeAdditionalUser(index: number): void {
    this.additionalUsers.update(users => users.filter((_, i) => i !== index));
  }

  applyConfig(): void {
    this.isApplying = true;

    const vmid = this.data.vmId || this.data.vmid;
    const nodeId = this.data.nodeId;

    // Apply network config
    this.vmUserService.setNetworkConfig(
      vmid,
      nodeId,
      this.networkConfig
    ).subscribe({
      next: () => {
        // Create root user
        this.createUsers();
      },
      error: (err) => {
        this.isApplying = false;
        this.snackBar.open(err.error?.detail || 'Failed to apply network config', 'Close', { duration: 4000 });
      }
    });
  }

  createUsers(): void {
    const allUsers = [this.rootUser, ...this.additionalUsers()];
    let createdCount = 0;
    const vmid = this.data.vmId || this.data.vmid;
    const nodeId = this.data.nodeId;

    allUsers.forEach(user => {
      this.vmUserService.createVmUser(
        vmid,
        nodeId,
        user.username,
        user.password || null,
        user.shell || '/bin/bash',
        user.sudo_access,
        null,
        user.sshKeyIds || []
      ).subscribe({
        next: () => {
          createdCount++;
          if (createdCount === allUsers.length) {
            this.isApplying = false;
            this.snackBar.open('Cloud-init configuration applied successfully!', 'Close', { duration: 4000 });
            this.dialogRef.close(true);
          }
        },
        error: (err) => {
          this.isApplying = false;
          this.snackBar.open(err.error?.detail || `Failed to create user ${user.username}`, 'Close', { duration: 4000 });
        }
      });
    });
  }
}
