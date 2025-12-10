import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material.module';
import { VMService } from '../../../core/services/vm.service';
import { ConfirmationService } from '../../../shared/services/confirmation.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-vm-snapshots',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule
  ],
  templateUrl: './vm-snapshots.component.html',
  styleUrls: ['./vm-snapshots.component.scss']
})
export class VmSnapshotsComponent implements OnInit {
  @Input() nodeId!: number;
  @Input() vmid!: number;

  snapshots = signal<any[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  showCreateForm = signal(false);
  
  createForm: FormGroup;
  displayedColumns = ['name', 'description', 'snaptime', 'actions'];

  constructor(
    private fb: FormBuilder,
    private vmService: VMService,
    private confirmationService: ConfirmationService,
    private snackBar: MatSnackBar
  ) {
    this.createForm = this.fb.group({
      snapname: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_-]+$/)]],
      description: ['']
    });
  }

  ngOnInit(): void {
    this.loadSnapshots();
  }

  async loadSnapshots(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const snapshots = await this.vmService.listSnapshots(this.nodeId, this.vmid);
      // Filter out 'current' snapshot
      this.snapshots.set(snapshots.filter(s => s.name !== 'current'));
    } catch (err: any) {
      this.error.set('Failed to load snapshots');
      this.snackBar.open('Failed to load snapshots', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  toggleCreateForm(): void {
    this.showCreateForm.update(v => !v);
    if (!this.showCreateForm()) {
      this.createForm.reset();
    }
  }

  async createSnapshot(): Promise<void> {
    if (!this.createForm.valid) {
      return;
    }

    const { snapname, description } = this.createForm.value;
    this.loading.set(true);

    try {
      await this.vmService.createSnapshot(this.nodeId, this.vmid, snapname, description);
      this.snackBar.open('Snapshot created successfully', 'Close', { duration: 3000 });
      this.createForm.reset();
      this.showCreateForm.set(false);
      await this.loadSnapshots();
    } catch (err: any) {
      this.snackBar.open(err.error?.detail || 'Failed to create snapshot', 'Close', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  async deleteSnapshot(snapname: string): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Delete Snapshot',
      message: `Are you sure you want to delete snapshot "${snapname}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'delete_forever'
    }).toPromise();

    if (!confirmed) return;

    this.loading.set(true);

    try {
      await this.vmService.deleteSnapshot(this.nodeId, this.vmid, snapname);
      this.snackBar.open('Snapshot deleted successfully', 'Close', { duration: 3000 });
      await this.loadSnapshots();
    } catch (err: any) {
      this.snackBar.open('Failed to delete snapshot', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  async rollbackSnapshot(snapname: string): Promise<void> {
    const confirmed = await this.confirmationService.confirmAction(
      'Rollback Snapshot',
      `Are you sure you want to rollback to snapshot "${snapname}"? The VM will be restored to this state.`
    ).toPromise();

    if (!confirmed) return;

    this.loading.set(true);

    try {
      await this.vmService.rollbackSnapshot(this.nodeId, this.vmid, snapname);
      this.snackBar.open('Snapshot rollback initiated', 'Close', { duration: 3000 });
    } catch (err: any) {
      this.snackBar.open('Failed to rollback snapshot', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(timestamp: number): string {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString();
  }
}
