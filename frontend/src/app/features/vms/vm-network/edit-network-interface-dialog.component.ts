import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { VMService } from '../../../core/services/vm.service';

@Component({
  selector: 'app-edit-network-interface-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule
  ],
  template: `
    <h2 mat-dialog-title>Edit Network Interface: {{ data.interface.interface }}</h2>
    <mat-dialog-content>
      <form [formGroup]="interfaceForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Network Model</mat-label>
          <mat-select formControlName="model">
            <mat-option value="virtio">VirtIO (Best Performance)</mat-option>
            <mat-option value="e1000">Intel E1000</mat-option>
            <mat-option value="rtl8139">Realtek RTL8139</mat-option>
            <mat-option value="vmxnet3">VMware vmxnet3</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Network Bridge</mat-label>
          <mat-select formControlName="bridge">
            @for (bridge of bridges; track bridge.iface) {
              <mat-option [value]="bridge.iface">
                {{ bridge.iface }}
                @if (bridge.cidr) {
                  <span class="bridge-info"> ({{ bridge.cidr }})</span>
                }
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="info-box">
          <p><strong>Current MAC Address:</strong> {{ data.interface.macaddr || 'Auto-generated' }}</p>
          <p class="warning-text">Note: Changing MAC address may cause network disruption</p>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>VLAN Tag (Optional)</mat-label>
          <input matInput type="number" formControlName="tag" placeholder="1-4094">
          @if (interfaceForm.get('tag')?.hasError('min')) {
            <mat-error>VLAN tag must be between 1 and 4094</mat-error>
          }
          @if (interfaceForm.get('tag')?.hasError('max')) {
            <mat-error>VLAN tag must be between 1 and 4094</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Rate Limit (MB/s, Optional)</mat-label>
          <input matInput type="number" formControlName="rate" placeholder="Unlimited">
          @if (interfaceForm.get('rate')?.hasError('min')) {
            <mat-error>Rate limit must be positive</mat-error>
          }
        </mat-form-field>

        <div class="checkbox-container">
          <mat-checkbox formControlName="firewall">
            Enable Firewall
          </mat-checkbox>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" 
              (click)="onSubmit()" 
              [disabled]="!interfaceForm.valid">
        Update Interface
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 500px;
      padding: 20px 24px;
    }

    .full-width {
      width: 100%;
      margin-bottom: 15px;
    }

    .checkbox-container {
      margin: 15px 0;
    }

    .info-box {
      background-color: #f5f5f5;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .info-box p {
      margin: 5px 0;
    }

    .warning-text {
      color: #ff6b6b;
      font-size: 0.9em;
      font-style: italic;
    }

    .bridge-info {
      color: #666;
      font-size: 0.9em;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }
  `]
})
export class EditNetworkInterfaceDialogComponent implements OnInit {
  interfaceForm: FormGroup;
  bridges: any[] = [];

  constructor(
    private fb: FormBuilder,
    private vmService: VMService,
    private dialogRef: MatDialogRef<EditNetworkInterfaceDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    const iface = data.interface;
    this.interfaceForm = this.fb.group({
      model: [iface.model || 'virtio', Validators.required],
      bridge: [iface.bridge || 'vmbr0', Validators.required],
      tag: [iface.tag ? parseInt(iface.tag) : null, [Validators.min(1), Validators.max(4094)]],
      rate: [iface.rate ? parseInt(iface.rate) : null, [Validators.min(1)]],
      firewall: [iface.firewall === '1' || iface.firewall === 1]
    });
  }

  ngOnInit() {
    // Load available bridges
    this.vmService.listNetworkBridges(this.data.nodeId).subscribe({
      next: (response: any) => {
        this.bridges = response.bridges || [];
      },
      error: (error: any) => {
        console.error('Error loading bridges:', error);
        this.bridges = [{ iface: 'vmbr0', type: 'bridge' }];
      }
    });
  }

  onCancel() {
    this.dialogRef.close();
  }

  onSubmit() {
    if (this.interfaceForm.valid) {
      const formValue = this.interfaceForm.value;
      // Convert firewall boolean to 1/0 and include MAC address
      const config = {
        model: formValue.model,
        bridge: formValue.bridge,
        macaddr: this.data.interface.macaddr, // Preserve existing MAC
        firewall: formValue.firewall ? 1 : 0,
        tag: formValue.tag || undefined,
        rate: formValue.rate || undefined
      };
      this.dialogRef.close(config);
    }
  }
}
