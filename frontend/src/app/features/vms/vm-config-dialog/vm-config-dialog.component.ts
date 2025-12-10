import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../shared/material.module';
import { VMService } from '../../../core/services/vm.service';
import { MatSnackBar } from '@angular/material/snack-bar';

export interface VMConfigDialogData {
  nodeId: number;
  vmid: number;
  currentConfig: any;
}

@Component({
  selector: 'app-vm-config-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule
  ],
  templateUrl: './vm-config-dialog.component.html',
  styleUrls: ['./vm-config-dialog.component.scss']
})
export class VmConfigDialogComponent implements OnInit {
  configForm: FormGroup;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private vmService: VMService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<VmConfigDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VMConfigDialogData
  ) {
    this.configForm = this.fb.group({
      name: [data.currentConfig?.name || '', [Validators.required, Validators.maxLength(255)]],
      description: [data.currentConfig?.description || ''],
      cores: [data.currentConfig?.cores || 2, [Validators.required, Validators.min(1), Validators.max(128)]],
      memory: [this.bytesToMB(data.currentConfig?.memory) || 2048, [Validators.required, Validators.min(512)]]
    });
  }

  ngOnInit(): void {}

  bytesToMB(bytes: number): number {
    if (!bytes) return 0;
    return Math.round(bytes / (1024 * 1024));
  }

  mbToBytes(mb: number): number {
    return mb * 1024 * 1024;
  }

  async save(): Promise<void> {
    if (!this.configForm.valid) {
      return;
    }

    this.loading = true;
    const formValue = this.configForm.value;

    const config: any = {};
    
    // Only include changed values
    if (formValue.name !== this.data.currentConfig?.name) {
      config.name = formValue.name;
    }
    if (formValue.description !== this.data.currentConfig?.description) {
      config.description = formValue.description;
    }
    if (formValue.cores !== this.data.currentConfig?.cores) {
      config.cores = formValue.cores;
    }
    const currentMemoryMB = this.bytesToMB(this.data.currentConfig?.memory);
    if (formValue.memory !== currentMemoryMB) {
      config.memory = formValue.memory;
    }

    if (Object.keys(config).length === 0) {
      this.snackBar.open('No changes detected', 'Close', { duration: 3000 });
      this.dialogRef.close(false);
      return;
    }

    try {
      await this.vmService.updateVMConfig(this.data.nodeId, this.data.vmid, config);
      this.snackBar.open('VM configuration updated successfully', 'Close', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (err: any) {
      this.snackBar.open(err.error?.detail || 'Failed to update VM configuration', 'Close', { duration: 5000 });
      this.loading = false;
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
