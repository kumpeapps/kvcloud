import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { SshKeyService } from '../../core/services/ssh-key.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-ssh-keys',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule, MatTabsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>SSH Keys</h1>
        <p class="subtitle">Manage your SSH keys for VM access</p>
      </div>

      <mat-tab-group>
        <mat-tab label="My SSH Keys">
          <div class="tab-content">
            <div class="list-actions">
              <button mat-raised-button color="primary" (click)="selectedTabIndex = 1">
                <mat-icon>add</mat-icon> Add SSH Key
              </button>
            </div>

            <table mat-table [dataSource]="sshKeys()" class="keys-table" *ngIf="sshKeys().length; else empty">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Key Name</th>
                <td mat-cell *matCellDef="let k">{{ k.name }}</td>
              </ng-container>

              <ng-container matColumnDef="fingerprint">
                <th mat-header-cell *matHeaderCellDef>Fingerprint</th>
                <td mat-cell *matCellDef="let k">
                  <code class="fingerprint">{{ k.fingerprint || 'N/A' }}</code>
                </td>
              </ng-container>

              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let k">
                  <mat-chip [highlighted]="k.is_active">
                    {{ k.is_active ? 'Active' : 'Inactive' }}
                  </mat-chip>
                </td>
              </ng-container>

              <ng-container matColumnDef="created">
                <th mat-header-cell *matHeaderCellDef>Created</th>
                <td mat-cell *matCellDef="let k">{{ k.created_at | date: 'short' }}</td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Actions</th>
                <td mat-cell *matCellDef="let k">
                  <button mat-icon-button color="accent" (click)="toggleKey(k.id)" [matTooltip]="k.is_active ? 'Disable' : 'Enable'">
                    <mat-icon>{{ k.is_active ? 'toggle_on' : 'toggle_off' }}</mat-icon>
                  </button>
                  <button mat-icon-button color="warn" (click)="deleteKey(k.id)" matTooltip="Delete">
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>
            <ng-template #empty>
              <p class="empty-message">No SSH keys yet. Add your first key to get started.</p>
            </ng-template>
          </div>
        </mat-tab>

        <mat-tab label="Add SSH Key">
          <div class="tab-content">
            <mat-card>
              <mat-card-title>Add New SSH Key</mat-card-title>
              <mat-card-content>
                <form (ngSubmit)="addKey()" #form="ngForm">
                  <div class="form-group">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Key Name *</mat-label>
                      <input matInput [(ngModel)]="newKey.name" name="name" placeholder="e.g., home-laptop" required>
                      <mat-hint>A friendly name to identify this key</mat-hint>
                    </mat-form-field>
                  </div>

                  <div class="form-group">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Public Key (OpenSSH format) *</mat-label>
                      <textarea matInput [(ngModel)]="newKey.publicKey" name="publicKey" rows="6" placeholder="ssh-rsa AAAAB3NzaC1..." required></textarea>
                      <mat-hint>Paste your public key here (usually starts with ssh-rsa, ssh-ed25519, etc.)</mat-hint>
                    </mat-form-field>
                  </div>

                  <div class="form-group">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Fingerprint (Optional)</mat-label>
                      <input matInput [(ngModel)]="newKey.fingerprint" name="fingerprint" placeholder="SHA256:...">
                      <mat-hint>MD5 or SHA256 fingerprint of the key</mat-hint>
                    </mat-form-field>
                  </div>

                  <div class="actions">
                    <button mat-raised-button color="primary" [disabled]="!newKey.name || !newKey.publicKey" type="submit">
                      <mat-icon>save</mat-icon> Add SSH Key
                    </button>
                    <button mat-button type="button" (click)="resetForm()">Clear</button>
                  </div>
                </form>

                <mat-divider class="mt-3"></mat-divider>

                <div class="help-section mt-3">
                  <h3>How to generate SSH keys:</h3>
                  <ol>
                    <li><code>ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa</code></li>
                    <li>Copy the content of <code>~/.ssh/id_rsa.pub</code></li>
                    <li>Paste it in the "Public Key" field above</li>
                  </ol>
                </div>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .page-container { padding: 16px; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0 0 4px 0; }
    .subtitle { margin: 0; color: #999; font-size: 14px; }
    .tab-content { padding: 24px; }
    .list-actions { margin-bottom: 16px; }
    .keys-table { width: 100%; }
    .fingerprint { font-size: 12px; overflow-wrap: break-word; }
    .form-group { margin-bottom: 16px; }
    .full-width { width: 100%; }
    .actions { margin-top: 16px; display: flex; gap: 8px; }
    .empty-message { padding: 32px; text-align: center; color: #999; }
    .mt-3 { margin-top: 16px; }
    .help-section { padding: 16px; background: #f5f5f5; border-radius: 4px; }
    .help-section h3 { margin-top: 0; }
    .help-section ol { padding-left: 20px; }
    .help-section code { background: #fff; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  `]
})
export class SshKeysComponent implements OnInit {
  sshKeys = signal<any[]>([]);
  displayedColumns = ['name', 'fingerprint', 'status', 'created', 'actions'];
  newKey: any = { name: '', publicKey: '', fingerprint: '' };
  selectedTabIndex = 0;

  constructor(private sshKeyService: SshKeyService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.loadKeys();
  }

  loadKeys(): void {
    this.sshKeyService.listMyKeys().subscribe({
      next: (res) => {
        this.sshKeys.set(res.keys || []);
      },
      error: (err) => {
        this.snackBar.open('Failed to load SSH keys', 'Close', { duration: 3000 });
      }
    });
  }

  addKey(): void {
    if (!this.newKey.name || !this.newKey.publicKey) {
      this.snackBar.open('Key name and public key are required', 'Close', { duration: 3000 });
      return;
    }

    this.sshKeyService.createKey(this.newKey.name, this.newKey.publicKey, this.newKey.fingerprint).subscribe({
      next: () => {
        this.snackBar.open('SSH key added successfully', 'Close', { duration: 3000 });
        this.resetForm();
        this.selectedTabIndex = 0;
        this.loadKeys();
      },
      error: (err) => {
        this.snackBar.open(err.error?.detail || 'Failed to add SSH key', 'Close', { duration: 4000 });
      }
    });
  }

  deleteKey(id: number): void {
    if (confirm('Delete this SSH key?')) {
      this.sshKeyService.deleteKey(id).subscribe({
        next: () => {
          this.snackBar.open('SSH key deleted', 'Close', { duration: 3000 });
          this.loadKeys();
        },
        error: (err) => {
          this.snackBar.open(err.error?.detail || 'Failed to delete SSH key', 'Close', { duration: 4000 });
        }
      });
    }
  }

  toggleKey(id: number): void {
    this.sshKeyService.toggleKey(id).subscribe({
      next: () => {
        this.snackBar.open('SSH key updated', 'Close', { duration: 3000 });
        this.loadKeys();
      },
      error: (err) => {
        this.snackBar.open(err.error?.detail || 'Failed to update SSH key', 'Close', { duration: 4000 });
      }
    });
  }

  resetForm(): void {
    this.newKey = { name: '', publicKey: '', fingerprint: '' };
  }
}
