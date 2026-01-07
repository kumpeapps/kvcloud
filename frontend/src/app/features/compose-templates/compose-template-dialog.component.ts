import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface ComposeTemplate {
  id?: number;
  name: string;
  description?: string;
  content: string;
  // Stored as JSON (array of variable descriptors); edited as string in the form
  variables?: any;
  auto_update?: boolean;
}

@Component({
  selector: 'app-compose-template-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule],
  template: `
    <h2 mat-dialog-title>{{ data.template ? 'Edit' : 'Create' }} Docker Compose Template</h2>
    <mat-dialog-content>
      <form [formGroup]="templateForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Template Name *</mat-label>
          <input matInput formControlName="name" placeholder="e.g., Nginx Proxy">
          <mat-error>Name is required</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <textarea matInput formControlName="description" rows="2" placeholder="What does this template do?"></textarea>
        </mat-form-field>

        <!-- Variable Usage Instructions -->
        <mat-expansion-panel class="info-panel">
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon>help_outline</mat-icon>
              <span>How to Use Variables</span>
            </mat-panel-title>
          </mat-expansion-panel-header>
          <div class="instructions">
            <h4>System & VM Variables</h4>
            <p>These are automatically available from the VM context:</p>
            <ul>
              <li><code>{{ '{' }}{{ '{' }}hostname{{ '}' }}{{ '}' }}</code> - VM hostname</li>
              <li><code>{{ '{' }}{{ '{' }}vm_name{{ '}' }}{{ '}' }}</code> - VM name in Proxmox</li>
              <li><code>{{ '{' }}{{ '{' }}vm_id{{ '}' }}{{ '}' }}</code> - VM ID</li>
              <li><code>{{ '{' }}{{ '{' }}ip_address{{ '}' }}{{ '}' }}</code> - VM IP address</li>
              <li><code>{{ '{' }}{{ '{' }}username{{ '}' }}{{ '}' }}</code> - Provisioning username</li>
            </ul>

            <h4>Custom Template Variables</h4>
            <p>Define in the Variables field below as JSON array:</p>
            <pre>[
  {{ '{' }}
    "name": "APP_PORT",
    "default": "8080",
    "description": "Application port"
  {{ '}' }},
  {{ '{' }}
    "name": "APP_VERSION",
    "default": "latest",
    "description": "Docker image version"
  {{ '}' }}
]</pre>
            <p>Then use in compose content: <code>{{ '{' }}{{ '{' }}APP_PORT{{ '}' }}{{ '}' }}</code>, <code>{{ '{' }}{{ '{' }}APP_VERSION{{ '}' }}{{ '}' }}</code></p>

            <h4>Example Usage</h4>
            <pre>version: '3.8'
services:
  app:
    container_name: {{ '{' }}{{ '{' }}hostname{{ '}' }}{{ '}' }}-app
    image: myapp:{{ '{' }}{{ '{' }}APP_VERSION{{ '}' }}{{ '}' }}
    ports:
      - "{{ '{' }}{{ '{' }}APP_PORT{{ '}' }}{{ '}' }}:8080"
    environment:
      - VM_ID={{ '{' }}{{ '{' }}vm_id{{ '}' }}{{ '}' }}
      - HOSTNAME={{ '{' }}{{ '{' }}hostname{{ '}' }}{{ '}' }}</pre>
          </div>
        </mat-expansion-panel>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Docker Compose Content *</mat-label>
          <textarea matInput formControlName="content" rows="20" placeholder="version: '3.8'&#10;services:&#10;  app:&#10;    image: nginx:latest&#10;    ports:&#10;      - 80:80" class="monospace"></textarea>
          <mat-hint>Use {{ '{' }}{{ '{' }}variable_name{{ '}' }}{{ '}' }} syntax for variable substitution</mat-hint>
          <mat-error>Content is required</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Variables (JSON array, optional)</mat-label>
          <textarea matInput formControlName="variables" rows="4" placeholder='[{"name": "APP_PORT", "default": "8080", "description": "Application port"}]' class="monospace"></textarea>
          <mat-hint>Define custom variables that can be substituted in the compose content</mat-hint>
        </mat-form-field>

        <mat-checkbox formControlName="auto_update">
          Auto-update running containers when template is modified
        </mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" (click)="onSave()" [disabled]="!templateForm.valid">
        <mat-icon>save</mat-icon> {{ data.template ? 'Update' : 'Create' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; margin-bottom: 16px; }
    .monospace textarea { font-family: 'Courier New', monospace; font-size: 13px; }
    mat-dialog-content { min-height: 400px; max-height: 70vh; }
    mat-checkbox { display: block; margin-bottom: 16px; }
    .info-panel {
      margin-bottom: 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .info-panel ::ng-deep .mat-expansion-panel-header {
      color: white;
    }
    .info-panel ::ng-deep .mat-expansion-panel-body {
      background: white;
      color: #333;
    }
    .instructions {
      padding: 16px;
      line-height: 1.6;
    }
    .instructions h4 {
      margin: 16px 0 8px 0;
      color: #667eea;
      font-weight: 600;
    }
    .instructions h4:first-child {
      margin-top: 0;
    }
    .instructions ul {
      margin: 8px 0;
      padding-left: 24px;
    }
    .instructions li {
      margin-bottom: 6px;
    }
    .instructions code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: #d63384;
    }
    .instructions pre {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      border-left: 3px solid #667eea;
      margin: 8px 0;
    }
    .instructions p {
      margin: 8px 0;
    }
    mat-expansion-panel-header mat-icon {
      margin-right: 8px;
    }
  `]
})
export class ComposeTemplateDialogComponent implements OnInit {
  templateForm!: FormGroup;

  constructor(
    public dialogRef: MatDialogRef<ComposeTemplateDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { template: ComposeTemplate | null },
    private fb: FormBuilder,
    private http: HttpClient,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.templateForm = this.fb.group({
      name: [this.data.template?.name || '', Validators.required],
      description: [this.data.template?.description || ''],
      content: [this.data.template?.content || '', Validators.required],
      // If existing template has JSON variables, show them stringified for editing
      variables: [
        this.data.template?.variables
          ? (typeof this.data.template.variables === 'string'
              ? this.data.template.variables
              : JSON.stringify(this.data.template.variables, null, 2))
          : ''
      ],
      auto_update: [this.data.template?.auto_update || false]
    });
  }

  onSave(): void {
    if (!this.templateForm.valid) return;

    const formValue = this.templateForm.value as {
      name: string;
      description: string;
      content: string;
      variables: string;
      auto_update: boolean;
    };

    // Parse variables JSON if provided
    let parsedVariables: any = [];
    if (formValue.variables && formValue.variables.trim().length > 0) {
      try {
        parsedVariables = JSON.parse(formValue.variables);
      } catch (e: any) {
        this.snackBar.open('Invalid JSON in Variables: ' + (e.message || 'Parse error'), 'Close', { duration: 5000 });
        return;
      }
    }

    const payload: ComposeTemplate = {
      name: formValue.name,
      description: formValue.description,
      content: formValue.content,
      variables: parsedVariables,
      auto_update: formValue.auto_update
    };

    if (this.data.template?.id) {
      // Update existing
      this.http.put(`${environment.apiUrl}/vms/compose-templates/${this.data.template.id}`, payload).subscribe({
        next: () => {
          this.snackBar.open('Template updated successfully', 'Close', { duration: 3000 });
          this.dialogRef.close(true);
        },
        error: (err: any) => {
          this.snackBar.open('Failed to update template: ' + this.formatError(err), 'Close', { duration: 5000 });
        }
      });
    } else {
      // Create new
      this.http.post(`${environment.apiUrl}/vms/compose-templates`, payload).subscribe({
        next: () => {
          this.snackBar.open('Template created successfully', 'Close', { duration: 3000 });
          this.dialogRef.close(true);
        },
        error: (err: any) => {
          this.snackBar.open('Failed to create template: ' + this.formatError(err), 'Close', { duration: 5000 });
        }
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  private formatError(err: any): string {
    // Prefer API-provided detail if present
    const detail = err?.error?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      try { return JSON.stringify(detail); } catch {}
    }

    // Some backends send error as string directly
    if (typeof err?.error === 'string') return err.error;

    // Fallback to message
    if (typeof err?.message === 'string') return err.message;

    // Last resort: stringify the error payload
    try { return JSON.stringify(err?.error ?? err); } catch { return 'Unknown error'; }
  }
}
