import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MaterialModule } from '../../../shared/material.module';
import { VMService, VMStatus } from '../../../core/services/vm.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ConfirmationService } from '../../../shared/services/confirmation.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { VmSnapshotsComponent } from '../vm-snapshots/vm-snapshots.component';
import { VmConfigDialogComponent } from '../vm-config-dialog/vm-config-dialog.component';
import { VmMonitoringComponent } from '../vm-monitoring/vm-monitoring.component';
import { VMDisksComponent } from '../vm-disks/vm-disks.component';
import { VMNetworkComponent } from '../vm-network/vm-network.component';
import { VMConsoleComponent } from '../vm-console/vm-console.component';
import { VMMountISODialogComponent } from '../vm-mount-iso-dialog/vm-mount-iso-dialog.component';
import { CloneVmDialogComponent } from '../../templates/clone-vm-dialog/clone-vm-dialog.component';
import { VmBootOrderDialogComponent } from '../vm-boot-order-dialog/vm-boot-order-dialog.component';
import { VmCloudInitDisplayComponent } from '../vm-cloud-init-display/vm-cloud-init-display.component';
import { VmIpManagementComponent } from '../vm-ip-management/vm-ip-management.component';

@Component({
  selector: 'app-vm-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MaterialModule,
    LoadingSpinnerComponent,
    StatusBadgeComponent,
    VmSnapshotsComponent,
    VmMonitoringComponent,
    VMDisksComponent,
    VMNetworkComponent,
    VMConsoleComponent,
    VmIpManagementComponent,
    VmCloudInitDisplayComponent
  ],
  templateUrl: './vm-detail.component.html',
  styleUrls: ['./vm-detail.component.scss']
})
export class VmDetailComponent implements OnInit {
  vm = signal<VMStatus | null>(null);
  vmConfig = signal<any | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  nodeId = signal<number>(0);
  vmid = signal<number>(0);

  cpuPercentage = computed(() => {
    const vmData = this.vm();
    return vmData?.cpu ? (vmData.cpu * 100).toFixed(1) : '0';
  });

  memoryPercentage = computed(() => {
    const vmData = this.vm();
    if (!vmData?.mem || !vmData?.maxmem) return 0;
    return (vmData.mem / vmData.maxmem) * 100;
  });

  isTemplate = computed(() => {
    const config = this.vmConfig();
    return config?.template === 1;
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private vmService: VMService,
    private confirmationService: ConfirmationService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const nodeId = +params['nodeId'];
      const vmid = +params['vmid'];
      
      if (nodeId && vmid) {
        this.nodeId.set(nodeId);
        this.vmid.set(vmid);
        this.loadVMDetails();
      } else {
        this.error.set('Invalid VM parameters');
        this.loading.set(false);
      }
    });
  }

  loadVMDetails(): void {
    this.loading.set(true);
    this.error.set(null);

    const nodeId = this.nodeId();
    const vmid = this.vmid();

    // Load both VM status and config
    this.vmService.getVMStatus(nodeId, vmid).subscribe({
      next: (vm) => {
        this.vm.set(vm);
        // Load VM config to check if it's a template
        this.vmService.getVMConfig(nodeId, vmid).then(config => {
          this.vmConfig.set(config);
        });
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading VM details:', err);
        this.error.set('Failed to load VM details');
        this.loading.set(false);
      }
    });
  }

  startVM(): void {
    const nodeId = this.nodeId();
    const vmid = this.vmid();
    const vmData = this.vm();

    this.vmService.startVM(nodeId, vmid).subscribe({
      next: () => {
        this.snackBar.open(`VM ${vmData?.name || vmid} start command sent`, 'Close', { duration: 3000 });
        setTimeout(() => this.loadVMDetails(), 2000);
      },
      error: (err) => {
        this.snackBar.open(`Failed to start VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
      }
    });
  }

  stopVM(): void {
    const nodeId = this.nodeId();
    const vmid = this.vmid();
    const vmData = this.vm();

    this.confirmationService.confirmAction(
      'Stop Virtual Machine',
      `Are you sure you want to stop ${vmData?.name || vmid}?`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.stopVM(nodeId, vmid).subscribe({
          next: () => {
            this.snackBar.open(`VM ${vmData?.name || vmid} stop command sent`, 'Close', { duration: 3000 });
            setTimeout(() => this.loadVMDetails(), 2000);
          },
          error: (err) => {
            this.snackBar.open(`Failed to stop VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  restartVM(): void {
    const nodeId = this.nodeId();
    const vmid = this.vmid();
    const vmData = this.vm();

    this.confirmationService.confirmAction(
      'Restart Virtual Machine',
      `Are you sure you want to restart ${vmData?.name || vmid}?`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.restartVM(nodeId, vmid).subscribe({
          next: () => {
            this.snackBar.open(`VM ${vmData?.name || vmid} restart command sent`, 'Close', { duration: 3000 });
            setTimeout(() => this.loadVMDetails(), 2000);
          },
          error: (err: any) => {
            this.snackBar.open(`Failed to restart VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  pauseVM(): void {
    const nodeId = this.nodeId();
    const vmid = this.vmid();
    const vmData = this.vm();

    this.confirmationService.confirmAction(
      'Pause Virtual Machine',
      `Are you sure you want to pause ${vmData?.name || vmid}? The VM will be suspended to RAM.`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.pauseVM(nodeId, vmid).subscribe({
          next: () => {
            this.snackBar.open(`VM ${vmData?.name || vmid} pause command sent`, 'Close', { duration: 3000 });
            setTimeout(() => this.loadVMDetails(), 2000);
          },
          error: (err: any) => {
            this.snackBar.open(`Failed to pause VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  resumeVM(): void {
    const nodeId = this.nodeId();
    const vmid = this.vmid();
    const vmData = this.vm();

    this.vmService.resumeVM(nodeId, vmid).subscribe({
      next: () => {
        this.snackBar.open(`VM ${vmData?.name || vmid} resume command sent`, 'Close', { duration: 3000 });
        setTimeout(() => this.loadVMDetails(), 2000);
      },
      error: (err) => {
        this.snackBar.open(`Failed to resume VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
      }
    });
  }

  shutdownVM(): void {
    const nodeId = this.nodeId();
    const vmid = this.vmid();
    const vmData = this.vm();

    this.confirmationService.confirmAction(
      'Shutdown Virtual Machine',
      `Gracefully shutdown ${vmData?.name || vmid}? The VM will attempt a clean shutdown.`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.shutdownVM(nodeId, vmid).subscribe({
          next: () => {
            this.snackBar.open(`VM ${vmData?.name || vmid} shutdown command sent`, 'Close', { duration: 3000 });
            setTimeout(() => this.loadVMDetails(), 2000);
          },
          error: (err: any) => {
            this.snackBar.open(`Failed to shutdown VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  resetVM(): void {
    const nodeId = this.nodeId();
    const vmid = this.vmid();
    const vmData = this.vm();

    this.confirmationService.confirmAction(
      'Reset Virtual Machine',
      `Hard reset ${vmData?.name || vmid}? This is like pressing the reset button on a physical machine.`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.resetVM(nodeId, vmid).subscribe({
          next: () => {
            this.snackBar.open(`VM ${vmData?.name || vmid} reset command sent`, 'Close', { duration: 3000 });
            setTimeout(() => this.loadVMDetails(), 2000);
          },
          error: (err: any) => {
            this.snackBar.open(`Failed to reset VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  }

  formatUptime(seconds: number): string {
    if (!seconds) return 'Not running';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days} days, ${hours} hours`;
    if (hours > 0) return `${hours} hours, ${minutes} minutes`;
    return `${minutes} minutes`;
  }

  getStatusType(status: string): 'success' | 'error' | 'warning' | 'default' {
    switch (status?.toLowerCase()) {
      case 'running': return 'success';
      case 'stopped': return 'default';
      case 'paused': return 'warning';
      default: return 'default';
    }
  }

  goBack(): void {
    this.router.navigate(['/vms']);
  }

  parseFloat(value: string): number {
    return parseFloat(value);
  }

  async cloneVM(): Promise<void> {
    const vmData = this.vm();
    if (!vmData) return;

    const dialogRef = this.dialog.open(CloneVmDialogComponent, {
      width: '600px',
      data: { 
        nodeId: this.nodeId(), 
        sourceVmid: this.vmid(),
        sourceName: vmData.name,
        isTemplate: false
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('VM clone initiated successfully', 'Close', { duration: 3000 });
      }
    });
  }

  async deleteVM(): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Delete VM',
      message: `Are you sure you want to delete VM ${this.vmid()}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'delete_forever'
    }).toPromise();

    if (!confirmed) return;

    this.loading.set(true);

    try {
      await this.vmService.deleteVM(this.nodeId(), this.vmid());
      this.snackBar.open('VM deleted successfully', 'Close', { duration: 3000 });
      this.router.navigate(['/vms']);
    } catch (err: any) {
      this.snackBar.open('Failed to delete VM', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  async convertToTemplate(): Promise<void> {
    const vmData = this.vm();
    const confirmed = await this.confirmationService.confirm({
      title: 'Convert to Template',
      message: `Convert VM ${vmData?.name || this.vmid()} to a template? This VM will no longer be startable but can be used to clone new VMs.`,
      confirmText: 'Convert',
      cancelText: 'Cancel',
      confirmColor: 'primary',
      icon: 'inventory_2'
    }).toPromise();

    if (!confirmed) return;

    this.loading.set(true);

    try {
      await this.vmService.convertToTemplate(this.nodeId(), this.vmid()).toPromise();
      this.snackBar.open('VM converted to template successfully', 'Close', { duration: 3000 });
      this.router.navigate(['/templates']);
    } catch (err: any) {
      this.snackBar.open('Failed to convert VM to template', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  async editConfig(): Promise<void> {
    try {
      const config = await this.vmService.getVMConfig(this.nodeId(), this.vmid());
      
      const dialogRef = this.dialog.open(VmConfigDialogComponent, {
        width: '600px',
        data: {
          nodeId: this.nodeId(),
          vmid: this.vmid(),
          currentConfig: config
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.loadVMDetails();
        }
      });
    } catch (err: any) {
      this.snackBar.open('Failed to load VM configuration', 'Close', { duration: 3000 });
    }
  }

  configureBootOrder(): void {
    const dialogRef = this.dialog.open(VmBootOrderDialogComponent, {
      width: '520px',
      data: {
        nodeId: this.nodeId(),
        vmid: this.vmid(),
        vmName: this.vm()?.name || `VM-${this.vmid()}`
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.bootOrder) {
        this.snackBar.open(`Boot order saved: ${result.bootOrder}`, 'Close', { duration: 3000 });
        this.loadVMDetails();
      }
    });
  }

  mountISO(): void {
    const dialogRef = this.dialog.open(VMMountISODialogComponent, {
      width: '500px',
      data: {
        nodeId: this.nodeId(),
        vmid: this.vmid(),
        vmName: this.vm()?.name || `VM-${this.vmid()}`
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadVMDetails();
      }
    });
  }

  unmountISO(): void {
    this.confirmationService.confirm({
      title: 'Unmount ISO',
      message: 'Are you sure you want to unmount the ISO from this VM?',
      confirmText: 'Unmount',
      cancelText: 'Cancel'
    }).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.unmountISO(this.nodeId(), this.vmid()).subscribe({
          next: () => {
            this.snackBar.open('ISO unmounted successfully', 'Close', { duration: 3000 });
            this.loadVMDetails();
          },
          error: (err) => {
            this.snackBar.open(
              `Failed to unmount ISO: ${err.error?.detail || 'Unknown error'}`,
              'Close',
              { duration: 5000 }
            );
          }
        });
      }
    });
  }

  isLockedVM(): boolean {
    return (this.vm() as any)?.is_locked === true;
  }

  reinstallOS(): void {
    const nodeId = this.nodeId();
    const vmid = this.vmid();
    const vmName = this.vm()?.name || `VM-${vmid}`;

    this.confirmationService.confirm({
      title: `Reinstall OS on ${vmName}?`,
      message: `This will delete the current VM and re-clone it from the template. All data will be lost.`,
      confirmText: 'Reinstall',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'restore'
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.loading.set(true);
      this.vmService.reinstallOS(nodeId, vmid).subscribe({
        next: () => {
          this.snackBar.open(`OS reinstall started for ${vmName}`, 'Close', { duration: 3000 });
          this.loading.set(false);
          setTimeout(() => this.loadVMDetails(), 3000);
        },
        error: (err) => {
          this.snackBar.open(`Failed to reinstall OS: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          this.loading.set(false);
        }
      });
    });
  }
  lockVM(): void {
    const reason = prompt('Enter reason for locking this VM:');
    if (!reason) return;

    const nodeId = this.nodeId();
    const vmid = this.vmid();

    this.confirmationService.confirmAction(
      'Lock VM',
      `Lock VM ${vmid}? This will prevent any changes until unlocked.`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.lockVM(nodeId, vmid, reason).subscribe({
          next: () => {
            this.snackBar.open('VM locked successfully', 'Close', { duration: 3000 });
            this.loadVMDetails();
          },
          error: (err: any) => {
            this.snackBar.open(`Failed to lock VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  unlockVM(): void {
    const nodeId = this.nodeId();
    const vmid = this.vmid();

    this.confirmationService.confirmAction(
      'Unlock VM',
      `Unlock VM ${vmid}? This will allow changes to be made.`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.unlockVM(nodeId, vmid).subscribe({
          next: () => {
            this.snackBar.open('VM unlocked successfully', 'Close', { duration: 3000 });
            this.loadVMDetails();
          },
          error: (err: any) => {
            this.snackBar.open(`Failed to unlock VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }
}
