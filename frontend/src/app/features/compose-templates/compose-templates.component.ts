import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface ComposeTemplate {
  id?: number;
  name: string;
  description?: string;
  content: string;
  variables?: string;
  auto_update?: boolean;
}

@Component({
  selector: 'app-compose-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MaterialModule, MatDialogModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Docker Compose Templates</h1>
        <p class="subtitle">Manage reusable Docker Compose templates for VM provisioning</p>
      </div>

      <!-- Info Banner -->
      <mat-card class="info-banner">
        <mat-card-content>
          <div class="banner-content">
            <mat-icon class="info-icon">info</mat-icon>
            <div>
              <strong>Compose Templates</strong>
              <p>Create reusable Docker Compose templates that can be applied to VMs during provisioning. Templates support variable substitution and can be configured to auto-update running containers when the template changes.</p>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-header>
          <mat-card-title>Templates</mat-card-title>
          <button mat-raised-button color="primary" (click)="openCreateDialog()">
            <mat-icon>add</mat-icon> New Template
          </button>
        </mat-card-header>
        <mat-card-content>
          <table mat-table [dataSource]="templates()" class="templates-table" *ngIf="templates().length; else empty">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let t">
                <strong>{{ t.name }}</strong>
                <br>
                <small *ngIf="t.description">{{ t.description }}</small>
              </td>
            </ng-container>

            <ng-container matColumnDef="preview">
              <th mat-header-cell *matHeaderCellDef>Content Preview</th>
              <td mat-cell *matCellDef="let t">
                <code class="preview">{{ t.content.substring(0, 100) }}{{ t.content.length > 100 ? '...' : '' }}</code>
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let t">
                <button mat-icon-button color="primary" (click)="openEditDialog(t)" matTooltip="Edit">
                  <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button color="warn" (click)="deleteTemplate(t.id)" matTooltip="Delete">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
          <ng-template #empty>
            <p class="empty-message">No templates created yet. Click "New Template" to get started.</p>
          </ng-template>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page-container { padding: 16px; max-width: 1400px; margin: 0 auto; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0 0 8px 0; }
    .page-header .subtitle { color: #666; margin: 0; }
    
    .info-banner { margin-bottom: 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .info-banner mat-card-content { padding: 16px; }
    .banner-content { display: flex; align-items: flex-start; gap: 16px; }
    .banner-content .info-icon { font-size: 32px; width: 32px; height: 32px; flex-shrink: 0; }
    .banner-content strong { display: block; margin-bottom: 4px; font-size: 16px; }
    .banner-content p { margin: 0; opacity: 0.95; line-height: 1.5; }

    mat-card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; }
    .templates-table { width: 100%; margin-top: 16px; }
    .empty-message { padding: 48px 16px; text-align: center; color: #999; }
    .preview { background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 12px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 400px; }
  `]
})
export class ComposeTemplatesComponent implements OnInit {
  templates = signal<ComposeTemplate[]>([]);
  displayedColumns = ['name', 'preview', 'actions'];

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.loadTemplates();
  }

  loadTemplates(): void {
    this.http.get<ComposeTemplate[]>(`${environment.apiUrl}/vms/compose-templates`).subscribe({
      next: (templates: ComposeTemplate[]) => {
        this.templates.set(templates || []);
      },
      error: (err: any) => {
        this.snackBar.open('Failed to load templates', 'Close', { duration: 3000 });
      }
    });
  }

  openCreateDialog(): void {
    import('./compose-template-dialog.component').then(m => {
      const dialogRef = this.dialog.open(m.ComposeTemplateDialogComponent, {
        width: '800px',
        data: { template: null }
      });

      dialogRef.afterClosed().subscribe((result: boolean) => {
        if (result) {
          this.loadTemplates();
        }
      });
    });
  }

  openEditDialog(template: ComposeTemplate): void {
    import('./compose-template-dialog.component').then(m => {
      const dialogRef = this.dialog.open(m.ComposeTemplateDialogComponent, {
        width: '800px',
        data: { template }
      });

      dialogRef.afterClosed().subscribe((result: boolean) => {
        if (result) {
          this.loadTemplates();
        }
      });
    });
  }

  deleteTemplate(id: number | undefined): void {
    if (!id) return;
    if (confirm('Are you sure you want to delete this template?')) {
      this.http.delete(`${environment.apiUrl}/vms/compose-templates/${id}`).subscribe({
        next: () => {
          this.snackBar.open('Template deleted', 'Close', { duration: 3000 });
          this.loadTemplates();
        },
        error: (err: any) => {
          this.snackBar.open('Failed to delete template', 'Close', { duration: 4000 });
        }
      });
    }
  }
}
