import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material.module';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface VmComposeEditData {
  id: string;
  path: string;
  service_name: string;
  content: string;
  start_on_deploy: boolean;
  start_on_boot: boolean;
  update_on_template_update?: boolean;
  template_id?: number;
  template_name?: string;
  template_content?: string;
  template_variables?: Array<{ name: string; description?: string; default?: any }>;
  variables: Record<string, any>;
}

@Component({
  selector: 'app-vm-compose-edit-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  template: `
    <h2 mat-dialog-title>Edit Compose File</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Service name</mat-label>
          <input matInput [(ngModel)]="data.service_name" required placeholder="e.g. web, api, nginx">
          <mat-hint>Used as the systemd service id</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Path</mat-label>
          <input matInput [(ngModel)]="data.path" required placeholder="/root/docker-compose.yml">
        </mat-form-field>

        <div *ngIf="data.template_id && data.template_variables?.length" class="vars-section">
          <h3>Template Variables<span *ngIf="data.template_name"> — {{ data.template_name }}</span></h3>
          <div class="var-grid">
            <mat-form-field appearance="outline" class="full-width" *ngFor="let v of data.template_variables">
              <mat-label>{{ v.name }}</mat-label>
              <input matInput [(ngModel)]="data.variables[v.name]" [placeholder]="v.default || ''">
              <mat-hint>{{ v.description || 'Optional' }}<ng-container *ngIf="v.default"> (default: {{ v.default }})</ng-container></mat-hint>
            </mat-form-field>
          </div>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Compose content (YAML)</mat-label>
          <textarea matInput [(ngModel)]="data.content" rows="16" style="font-family: monospace;"></textarea>
        </mat-form-field>

        <div class="switches">
          <mat-checkbox [(ngModel)]="data.start_on_deploy">Start on deploy</mat-checkbox>
          <mat-checkbox [(ngModel)]="data.start_on_boot">Start on boot</mat-checkbox>
          <mat-checkbox [(ngModel)]="data.update_on_template_update">Auto-update from template</mat-checkbox>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" [disabled]="!data.path || !data.service_name || !data.content" (click)="onSave()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-grid { display: flex; flex-direction: column; gap: 16px; min-width: 700px; }
    .full-width { width: 100%; }
    .switches { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .vars-section { display: flex; flex-direction: column; gap: 8px; }
    .vars-section h3 { margin: 0; font-size: 15px; font-weight: 600; }
    .var-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  `]
})
export class VmComposeEditDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<VmComposeEditDialogComponent, VmComposeEditData | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: VmComposeEditData
  ) {
    this.data.variables = this.initializeVariables(this.data.template_variables, this.data.variables || {});
  }

  private initializeVariables(vars?: Array<{ name: string; default?: any }>, existing?: Record<string, any>): Record<string, any> {
    if (!vars?.length) return existing || {};
    const values: Record<string, any> = { ...(existing || {}) };
    vars.forEach(v => {
      if (values[v.name] === undefined) {
        values[v.name] = v.default ?? '';
      }
    });
    return values;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.data.template_id && this.data.template_content) {
      this.data.content = this.renderTemplateContent(this.data.template_content, this.data.variables || {});
    }
    this.dialogRef.close(this.data);
  }

  private renderTemplateContent(content: string, variables: Record<string, any>): string {
    if (!content) return content;
    try {
      return content.replace(/\{(\w+)\}/g, (_match, key) => (variables[key] !== undefined ? variables[key] : `{${key}}`));
    } catch {
      return content;
    }
  }
}
