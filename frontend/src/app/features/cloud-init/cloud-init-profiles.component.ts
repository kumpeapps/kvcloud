import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { CloudInitService } from '../../core/services/cloud-init.service';
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
      </div>

      <mat-tab-group>
        <mat-tab label="Profiles List">
          <div class="tab-content">
            <div class="list-actions">
              <button mat-raised-button color="primary" (click)="openProfileBuilder()">
                <mat-icon>construction</mat-icon> Comprehensive Profile Builder
              </button>
              <button mat-raised-button color="accent" (click)="openCreateDialog()">
                <mat-icon>add</mat-icon> Quick Create
              </button>
            </div>

            <table mat-table [dataSource]="profiles()" class="profiles-table" *ngIf="profiles().length; else empty">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Name</th>
                <td mat-cell *matCellDef="let p">{{ p.name }}</td>
              </ng-container>

              <ng-container matColumnDef="description">
                <th mat-header-cell *matHeaderCellDef>Description</th>
                <td mat-cell *matCellDef="let p">{{ p.description || '-' }}</td>
              </ng-container>

              <ng-container matColumnDef="ciuser">
                <th mat-header-cell *matHeaderCellDef>CI User</th>
                <td mat-cell *matCellDef="let p">{{ p.ciuser || '-' }}</td>
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

        <mat-tab label="Create Profile">
          <div class="tab-content">
            <form class="profile-form" (ngSubmit)="createProfile()" #form="ngForm">
              <div class="form-row">
                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>Name *</mat-label>
                  <input matInput [(ngModel)]="newProfile.name" name="name" required>
                </mat-form-field>

                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>Description</mat-label>
                  <input matInput [(ngModel)]="newProfile.description" name="description">
                </mat-form-field>
              </div>

              <div class="form-row">
                <mat-form-field appearance="outline" class="third-width">
                  <mat-label>CI User</mat-label>
                  <input matInput [(ngModel)]="newProfile.ciuser" name="ciuser">
                </mat-form-field>

                <mat-form-field appearance="outline" class="third-width">
                  <mat-label>CI Password</mat-label>
                  <input matInput [(ngModel)]="newProfile.cipassword" name="cipassword" type="password">
                </mat-form-field>

                <mat-form-field appearance="outline" class="third-width">
                  <mat-label>SSH Keys</mat-label>
                  <textarea matInput [(ngModel)]="newProfile.sshkeys" name="sshkeys" rows="3"></textarea>
                </mat-form-field>
              </div>

              <div class="form-row">
                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>User Data</mat-label>
                  <textarea matInput [(ngModel)]="newProfile.userdata" name="userdata" rows="6"></textarea>
                </mat-form-field>

                <mat-form-field appearance="outline" class="half-width">
                  <mat-label>Meta Data</mat-label>
                  <textarea matInput [(ngModel)]="newProfile.meta_data" name="meta_data" rows="6"></textarea>
                </mat-form-field>
              </div>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Network Config</mat-label>
                <textarea matInput [(ngModel)]="newProfile.network_config" name="network_config" rows="6"></textarea>
              </mat-form-field>

              <div class="actions">
                <button mat-raised-button color="primary" [disabled]="!newProfile.name" type="submit">
                  <mat-icon>save</mat-icon> Create Profile
                </button>
                <button mat-button type="button" (click)="resetForm()">Clear</button>
              </div>
            </form>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .page-container { padding: 16px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .tab-content { padding: 16px; }
    .form-row { display: flex; gap: 16px; margin-bottom: 16px; }
    .half-width { flex: 1; }
    .third-width { flex: 1; }
    .full-width { width: 100%; }
    .actions { margin-top: 16px; display: flex; gap: 8px; }
    .profiles-table { width: 100%; margin-top: 16px; }
    .list-actions { display: flex; gap: 8px; margin-bottom: 16px; }
    .empty-message { padding: 32px; text-align: center; color: #999; }
  `]
})
export class CloudInitProfilesComponent implements OnInit {
  profiles = signal<any[]>([]);
  displayedColumns = ['name', 'description', 'ciuser', 'actions'];
  newProfile: any = { name: '', description: '', ciuser: '', cipassword: '', sshkeys: '', userdata: '', meta_data: '', network_config: '' };
  editingProfile: any = null;

  constructor(
    private cloudInit: CloudInitService, 
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadProfiles();
  }

  loadProfiles(): void {
    this.cloudInit.listProfiles().subscribe({
      next: (res) => {
        this.profiles.set(res.profiles || []);
      },
      error: (err) => {
        this.snackBar.open('Failed to load profiles', 'Close', { duration: 3000 });
      }
    });
  }

  createProfile(): void {
    if (!this.newProfile.name) {
      this.snackBar.open('Name is required', 'Close', { duration: 3000 });
      return;
    }

    if (this.editingProfile) {
      // Update existing
      this.cloudInit.updateProfile(this.editingProfile.id, this.newProfile).subscribe({
        next: () => {
          this.snackBar.open('Profile updated', 'Close', { duration: 3000 });
          this.resetForm();
          this.loadProfiles();
        },
        error: (err) => {
          this.snackBar.open(err.error?.detail || 'Failed to update profile', 'Close', { duration: 4000 });
        }
      });
    } else {
      // Create new
      this.cloudInit.createProfile(this.newProfile).subscribe({
        next: () => {
          this.snackBar.open('Profile created', 'Close', { duration: 3000 });
          this.resetForm();
          this.loadProfiles();
        },
        error: (err) => {
          this.snackBar.open(err.error?.detail || 'Failed to create profile', 'Close', { duration: 4000 });
        }
      });
    }
  }

  editProfile(profile: any): void {
    // Navigate to the comprehensive builder for editing
    this.router.navigate(['/cloud-init/builder'], { 
      queryParams: { id: profile.id } 
    });
  }

  deleteProfile(id: number): void {
    if (confirm('Are you sure you want to delete this profile?')) {
      this.cloudInit.deleteProfile(id).subscribe({
        next: () => {
          this.snackBar.open('Profile deleted', 'Close', { duration: 3000 });
          this.loadProfiles();
        },
        error: (err) => {
          this.snackBar.open(err.error?.detail || 'Failed to delete profile', 'Close', { duration: 4000 });
        }
      });
    }
  }

  openCreateDialog(): void {
    this.resetForm();
  }

  openProfileBuilder(): void {
    this.router.navigate(['/cloud-init/builder']);
  }

  resetForm(): void {
    this.newProfile = { name: '', description: '', ciuser: '', cipassword: '', sshkeys: '', userdata: '', meta_data: '', network_config: '' };
    this.editingProfile = null;
  }
}

