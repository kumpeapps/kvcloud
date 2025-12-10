import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CloudInitService } from '../../core/services/cloud-init.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-vm-cloud-init-apply-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>cloud</mat-icon>
      Apply Cloud-init
    </h2>
    <mat-dialog-content>
      <p>Select a profile to apply to VM {{data.vmid}} on node {{data.nodeId}}.</p>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Profile</mat-label>
        <mat-select [(value)]="selectedProfileId" (selectionChange)="onProfileChange($event.value)">
          <mat-option *ngFor="let p of profiles" [value]="p.id">{{ p.name }}</mat-option>
        </mat-select>
      </mat-form-field>

      <div *ngIf="selectedProfile">
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>Profile Details</mat-panel-title>
          </mat-expansion-panel-header>
          <pre>{{ selectedProfile | json }}</pre>
        </mat-expansion-panel>
      </div>
      <mat-divider class="mt-2"></mat-divider>
      <div class="info-banner">
        <mat-icon>cloud_done</mat-icon>
        Network settings will be applied automatically from the VM's assigned IP configuration.
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-raised-button color="primary" (click)="apply()" [disabled]="!selectedProfile">Apply</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    pre {
      background: #263238;
      color: #aed581;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid rgba(0,0,0,0.12);
      max-height: 220px;
      overflow: auto;
      font-size: 13px;
      line-height: 1.5;
    }
    .mt-2 { margin-top: 12px; }
    .info-banner, .warning-banner { 
      padding: 12px; 
      border-radius: 4px; 
      display: flex; 
      align-items: center; 
      gap: 8px; 
      margin: 12px 0;
      font-size: 14px;
    }
    .info-banner { 
      background: rgba(25, 118, 210, 0.10);
      color: #1976d2;
      border-left: 4px solid #1976d2;
    }
    .warning-banner { 
      background: rgba(255, 152, 0, 0.1); 
      color: #e65100;
      border-left: 4px solid #ff9800;
    }
    .info-banner mat-icon, .warning-banner mat-icon { 
      font-size: 20px; 
      width: 20px; 
      height: 20px; 
    }
    @media (prefers-color-scheme: dark) {
      .info-banner { 
        background: rgba(25, 118, 210, 0.20); 
        color: #90caf9;
      }
      .warning-banner { 
        background: rgba(255, 152, 0, 0.2); 
        color: #ffb74d;
      }
    }
  `]
})
export class VmCloudInitApplyDialogComponent implements OnInit {
  profiles: any[] = [];
  selectedProfileId: number | null = null;

  get selectedProfile(): any | null {
    return this.profiles.find(p => p.id === this.selectedProfileId) || null;
  }

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { nodeId: number; vmid: number },
    public dialogRef: MatDialogRef<VmCloudInitApplyDialogComponent>,
    private cloudInit: CloudInitService,
    private snackBar: MatSnackBar,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadProfiles();
    this.loadCurrentCloudInitConfig();
  }

  loadProfiles(): void {
    this.cloudInit.listProfiles().subscribe({
      next: (res) => this.profiles = res.profiles || [],
      error: () => this.snackBar.open('Failed to load profiles', 'Close', { duration: 3000 })
    });
  }


  loadCurrentCloudInitConfig(): void {
    const url = `${environment.apiUrl}/vms/node/${this.data.nodeId}/vm/${this.data.vmid}/config`;
    this.http.get<any>(url).subscribe({
      next: (config) => {
        console.log('[CloudInit Dialog] Current VM config:', config);
        // Pre-populate fields from current VM configuration
        if (config?.ciuser) {
          // Try to find a profile matching this user
          const matchingProfile = this.profiles.find(p => p.default_user === config.ciuser);
          if (matchingProfile) {
            this.selectedProfileId = matchingProfile.id;
            this.onProfileChange(matchingProfile.id);
          }
        }
        // Network settings are derived automatically by backend; no manual overrides
      },
      error: (err) => {
        console.log('[CloudInit Dialog] Could not load current config:', err);
        // Continue - current config is optional
      }
    });
  }

  apply(): void {
    const p = this.selectedProfile;
    if (!p) return;
    const payload: any = { node_id: this.data.nodeId, vmid: this.data.vmid };
    ['ciuser','cipassword','sshkeys'].forEach(k => { if (p[k]) payload[k] = p[k]; });
    this.cloudInit.apply(payload).subscribe({
      next: () => {
        this.snackBar.open('Cloud-init applied', 'Close', { duration: 3000 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.snackBar.open(err.error?.detail || 'Failed to apply cloud-init', 'Close', { duration: 4000 });
      }
    });
  }

  onProfileChange(profileId: number): void {
    this.selectedProfileId = profileId;
  }
}
