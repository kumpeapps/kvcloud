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
  `]
})
export class VmComposeEditDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<VmComposeEditDialogComponent, VmComposeEditData | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: VmComposeEditData
  ) {}

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    this.dialogRef.close(this.data);
  }
}
