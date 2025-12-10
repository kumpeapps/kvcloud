import { Component, OnInit, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../../shared/material.module';
import { ClusterService, ClusterNode } from '../../../core/services/cluster.service';

@Component({
  selector: 'app-node-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Edit Node' : 'Add Node' }}</h2>
    
    <mat-dialog-content>
      <form [formGroup]="form" class="form-container">
        <!-- Proxmox Configuration Section -->
        <div class="section-title">Proxmox API Credentials</div>
        
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Node Name</mat-label>
          <input matInput formControlName="name" required>
          <mat-hint>Display name for this node</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Host/IP Address</mat-label>
          <input matInput formControlName="host" required>
          <mat-hint>IP address or hostname of the Proxmox node</mat-hint>
        </mat-form-field>

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Port</mat-label>
            <input matInput type="number" formControlName="port" required>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>API Username</mat-label>
          <input matInput formControlName="username" required>
          <mat-hint>Proxmox API user (e.g., root&#64;pam)</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>API Password</mat-label>
          <input matInput type="password" formControlName="password" required>
        </mat-form-field>

        <mat-checkbox formControlName="verify_ssl" class="full-width">
          Verify SSL Certificate
        </mat-checkbox>

        <!-- SSH Configuration Section -->
        <div class="section-title" style="margin-top: 24px;">SSH Credentials (for Cloud Image Downloads)</div>
        
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>SSH Username</mat-label>
          <input matInput formControlName="ssh_username">
          <mat-hint>Username for SSH access (default: root)</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>SSH Password</mat-label>
          <input matInput type="password" formControlName="ssh_password">
          <mat-hint>Password for SSH access (optional)</mat-hint>
        </mat-form-field>

        @if (error()) {
          <mat-error class="error-message">
            {{ error() }}
          </mat-error>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" 
              (click)="onSubmit()"
              [disabled]="form.invalid || loading()">
        {{ isEdit ? 'Update' : 'Add' }} Node
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 600px;
      padding: 20px 0;
    }

    .full-width {
      width: 100%;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .section-title {
      font-size: 14px;
      font-weight: 500;
      color: #1976d2;
      margin-bottom: 8px;
      margin-top: 16px;
    }

    .error-message {
      color: #f44336;
      margin-top: 8px;
    }

    mat-dialog-actions {
      padding: 16px 0;
    }
  `]
})
export class NodeFormDialogComponent implements OnInit {
  form!: FormGroup;
  isEdit = false;
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(
    private fb: FormBuilder,
    private clusterService: ClusterService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<NodeFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { clusterId: number; node?: ClusterNode }
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    if (this.data.node) {
      this.isEdit = true;
      this.form.patchValue(this.data.node);
    }
  }

  private initForm(): void {
    this.form = this.fb.group({
      name: ['', Validators.required],
      host: ['', Validators.required],
      port: [8006, [Validators.required, Validators.min(1)]],
      username: ['', Validators.required],
      password: ['', Validators.required],
      ssh_username: ['root'],
      ssh_password: [''],
      verify_ssl: [false]
    });
  }

  onSubmit(): void {
    if (!this.form.valid) return;

    this.loading.set(true);
    this.error.set(null);

    const formValue = this.form.value;
    const payload = {
      cluster_id: this.data.clusterId,
      name: formValue.name,
      host: formValue.host,
      port: formValue.port,
      username: formValue.username,
      password: formValue.password,
      ssh_username: formValue.ssh_username || 'root',
      ssh_password: formValue.ssh_password || null,
      verify_ssl: formValue.verify_ssl
    };

    const request = this.isEdit && this.data.node
      ? this.clusterService.updateNode(this.data.node.id, payload)
      : this.clusterService.createNode(payload);

    request.subscribe({
      next: () => {
        const action = this.isEdit ? 'updated' : 'added';
        this.snackBar.open(`Node ${action} successfully`, 'Close', { duration: 3000 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        const errorMessage = err.error?.detail || `Failed to ${this.isEdit ? 'update' : 'add'} node`;
        this.error.set(errorMessage);
        this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        this.loading.set(false);
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
