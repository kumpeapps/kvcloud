import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, computed, signal } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../../shared/material.module';
import { VMService } from '../../../core/services/vm.service';

interface BootDevice {
  code: 'c' | 'd' | 'n' | 'a';
  label: string;
  description: string;
}

export interface BootOrderDialogData {
  nodeId: number;
  vmid: number;
  vmName: string;
}

@Component({
  selector: 'app-vm-boot-order-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, DragDropModule],
  templateUrl: './vm-boot-order-dialog.component.html',
  styleUrls: ['./vm-boot-order-dialog.component.scss']
})
export class VmBootOrderDialogComponent implements OnInit {
  loading = signal(true);
  saving = signal(false);
  order = signal<BootDevice[]>([]);
  included = signal<Set<string>>(new Set());

  readonly devices: BootDevice[] = [
    { code: 'c', label: 'Disk', description: 'Local disk or virtual disk attached to the VM' },
    { code: 'd', label: 'CD-ROM', description: 'Virtual CD/DVD drive for ISO boot' },
    { code: 'n', label: 'Network (PXE)', description: 'PXE/network boot for provisioning' },
    { code: 'a', label: 'Floppy', description: 'Legacy floppy device (rarely used)' }
  ];

  bootOrderString = computed(() => {
    const activeCodes = this.order()
      .filter(device => this.included().has(device.code))
      .map(device => device.code)
      .join('');
    return activeCodes || '—';
  });

  constructor(
    private dialogRef: MatDialogRef<VmBootOrderDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BootOrderDialogData,
    private vmService: VMService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadBootOrder();
  }

  loadBootOrder(): void {
    this.loading.set(true);
    this.vmService.getBootOrder(this.data.nodeId, this.data.vmid).subscribe({
      next: (resp: any) => {
        const raw = (resp.boot_order || resp.boot || 'cdn').replace(/[^cdna]/g, '');
        const codes = raw ? raw.split('') : ['c', 'd', 'n'];
        const enabled = new Set<string>(codes);
        const enabledDevices = codes
          .map((code: string) => this.devices.find((device: BootDevice) => device.code === code))
          .filter((device: BootDevice | undefined): device is BootDevice => Boolean(device));
        const remainingDevices = this.devices.filter(device => !enabled.has(device.code));

        this.order.set([...enabledDevices, ...remainingDevices]);
        this.included.set(enabled.size ? enabled : new Set(['c', 'd', 'n']));
        this.loading.set(false);
      },
      error: (err: any) => {
        console.error('Failed to load boot order', err);
        this.snackBar.open('Failed to load current boot order', 'Close', { duration: 5000 });
        this.order.set([...this.devices]);
        this.included.set(new Set(['c', 'd', 'n']));
        this.loading.set(false);
      }
    });
  }

  drop(event: CdkDragDrop<BootDevice[]>): void {
    const current = [...this.order()];
    moveItemInArray(current, event.previousIndex, event.currentIndex);
    this.order.set(current);
  }

  toggleInclude(code: string, checked: boolean): void {
    const updated = new Set(this.included());
    if (checked) {
      updated.add(code);
    } else {
      updated.delete(code);
    }

    if (!updated.size) {
      updated.add(code);
    }

    this.included.set(updated);
  }

  resetToDefault(): void {
    const defaultCodes: BootDevice[] = ['c', 'd', 'n']
      .map(code => this.devices.find(device => device.code === code)!)
      .filter(Boolean);
    const remaining = this.devices.filter(device => !['c', 'd', 'n'].includes(device.code));
    this.order.set([...defaultCodes, ...remaining]);
    this.included.set(new Set(['c', 'd', 'n']));
  }

  save(): void {
    const bootOrder = this.order()
      .filter(device => this.included().has(device.code))
      .map(device => device.code)
      .join('');

    if (!bootOrder) {
      this.snackBar.open('Select at least one boot device', 'Close', { duration: 4000 });
      return;
    }

    this.saving.set(true);
    this.vmService.setBootOrder(this.data.nodeId, this.data.vmid, bootOrder).subscribe({
      next: (resp: any) => {
        const savedOrder = resp.boot_order || bootOrder;
        this.snackBar.open(`Boot order saved (${savedOrder})`, 'Close', { duration: 3000 });
        this.dialogRef.close({ bootOrder: savedOrder });
      },
      error: (err: any) => {
        console.error('Failed to save boot order', err);
        this.snackBar.open(`Failed to save boot order: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
        this.saving.set(false);
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  trackByCode(_: number, device: BootDevice): string {
    return device.code;
  }
}
