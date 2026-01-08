import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { VMService, VM } from '../../core/services/vm.service';
import { IPPoolService, IPPool, IPAddress } from '../../core/services/ippool.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClusterService, ClusterNode } from '../../core/services/cluster.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ConfirmationService } from '../../shared/services/confirmation.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PermissionService } from '../../core/services/permission.service';
import { HasPermissionDirective } from '../../core/directives/has-permission.directive';
import { DisableIfNoPermissionDirective } from '../../core/directives/disable-if-no-permission.directive';

@Component({
  selector: 'app-vms',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MaterialModule,
    LoadingSpinnerComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    DisableIfNoPermissionDirective,
    ReactiveFormsModule
  ],
  templateUrl: './vms.component.html',
  styleUrls: ['./vms.component.scss']
})
export class VmsComponent implements OnInit {
  vms = signal<VM[]>([]);
  nodes = signal<ClusterNode[]>([]);
  selectedNodeId = signal<number | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  displayedColumns = ['vmid', 'name', 'status', 'cpu', 'memory', 'disk', 'uptime', 'actions'];

  // Assign IP dialog state
  showAssignIpDialog = signal(false);
  assignForm: FormGroup;
  pools = signal<IPPool[]>([]);
  poolIPs = signal<IPAddress[]>([]);
  selectedPoolId = signal<number | null>(null);
  vmForAssign = signal<VM | null>(null);

  constructor(
    private vmService: VMService,
    private clusterService: ClusterService,
    private confirmationService: ConfirmationService,
    private snackBar: MatSnackBar,
    private permissionService: PermissionService,
    private ipPoolService: IPPoolService,
    private fb: FormBuilder
  ) {
    this.assignForm = this.fb.group({
      pool_id: [null, [Validators.required]],
      ip_address: [null, [Validators.required]],
      hostname: [''],
      mac_address: [''],
      notes: [''],
      alsoSetVmNetworkConfig: [true]
    });
  }

  ngOnInit(): void {
    this.loadNodes();
  }

  selectedNodeName(): string {
    const nodeId = this.selectedNodeId();
    const node = this.nodes().find(n => n.id === nodeId);
    return node ? node.name : '';
  }

  loadNodes(): void {
    this.loading.set(true);
    this.error.set(null);

    // First, get all clusters
    this.clusterService.getClusters().subscribe({
      next: (clusters) => {
        if (clusters.length === 0) {
          this.error.set('No clusters configured. Please add a cluster first.');
          this.loading.set(false);
          return;
        }

        // Get nodes from first cluster
        this.clusterService.getClusterNodes(clusters[0].id).subscribe({
          next: (nodes) => {
            this.nodes.set(nodes);
            if (nodes.length > 0) {
              this.selectedNodeId.set(nodes[0].id);
              this.loadVMs(nodes[0].id);
            } else {
              this.error.set('No nodes found in cluster. Please add a node first.');
              this.loading.set(false);
            }
          },
          error: (err) => {
            console.error('Error loading nodes:', err);
            this.error.set('Failed to load cluster nodes');
            this.loading.set(false);
          }
        });
      },
      error: (err) => {
        console.error('Error loading clusters:', err);
        this.error.set('Failed to load clusters');
        this.loading.set(false);
      }
    });
  }

  loadVMs(nodeId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.selectedNodeId.set(nodeId);

    this.vmService.listVMs(nodeId).subscribe({
      next: (response) => {
        const visible = (response.vms || []).filter(vm => ![1, true, '1', 'true'].includes((vm as any).template));
        this.vms.set(visible);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading VMs:', err);
        this.error.set('Failed to load virtual machines');
        this.vms.set([]);
        this.loading.set(false);
      }
    });
  }

  // Permission checks for UI
  canStartVM(vm: VM): boolean {
    return vm.status !== 'running' && this.permissionService.hasPermission('vm', 'start');
  }

  canStopVM(vm: VM): boolean {
    return vm.status === 'running' && this.permissionService.hasPermission('vm', 'stop');
  }

  canRestartVM(vm: VM): boolean {
    return vm.status === 'running' && this.permissionService.hasPermission('vm', 'restart');
  }

  canDeleteVM(): boolean {
    return this.permissionService.hasPermission('vm', 'delete');
  }

  startVM(vm: VM): void {
    const nodeId = this.selectedNodeId();
    if (!nodeId) return;

    this.vmService.startVM(nodeId, vm.vmid).subscribe({
      next: () => {
        this.snackBar.open(`VM ${vm.name} start command sent`, 'Close', { duration: 3000 });
        setTimeout(() => this.loadVMs(nodeId), 2000);
      },
      error: (err) => {
        this.snackBar.open(`Failed to start VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
      }
    });
  }

  stopVM(vm: VM): void {
    const nodeId = this.selectedNodeId();
    if (!nodeId) return;

    this.confirmationService.confirmAction(
      'Stop Virtual Machine',
      `Are you sure you want to stop ${vm.name}?`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.stopVM(nodeId, vm.vmid).subscribe({
          next: () => {
            this.snackBar.open(`VM ${vm.name} stop command sent`, 'Close', { duration: 3000 });
            setTimeout(() => this.loadVMs(nodeId), 2000);
          },
          error: (err) => {
            this.snackBar.open(`Failed to stop VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  restartVM(vm: VM): void {
    const nodeId = this.selectedNodeId();
    if (!nodeId) return;

    this.confirmationService.confirmAction(
      'Restart Virtual Machine',
      `Are you sure you want to restart ${vm.name}?`
    ).subscribe(confirmed => {
      if (confirmed) {
        this.vmService.restartVM(nodeId, vm.vmid).subscribe({
          next: () => {
            this.snackBar.open(`VM ${vm.name} restart command sent`, 'Close', { duration: 3000 });
            setTimeout(() => this.loadVMs(nodeId), 2000);
          },
          error: (err) => {
            this.snackBar.open(`Failed to restart VM: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
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
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  getStatusType(status: string): 'success' | 'error' | 'warning' | 'default' {
    switch (status?.toLowerCase()) {
      case 'running': return 'success';
      case 'stopped': return 'default';
      case 'paused': return 'warning';
      default: return 'default';
    }
  }

  async cloneVM(vm: VM): Promise<void> {
    const newid = prompt('Enter new VM ID:');
    if (!newid) return;

    const newIdNum = parseInt(newid);
    if (isNaN(newIdNum) || newIdNum < 100) {
      this.snackBar.open('Please enter a valid VM ID (>= 100)', 'Close', { duration: 3000 });
      return;
    }

    const name = prompt('Enter new VM name (optional):');
    
    const confirmed = await this.confirmationService.confirmAction(
      'Clone VM',
      `Clone VM ${vm.name} to new VM ${newIdNum}?`
    ).toPromise();

    if (!confirmed) return;

    this.loading.set(true);

    try {
      await this.vmService.cloneVM(this.selectedNodeId()!, vm.vmid, newIdNum, name || undefined);
      this.snackBar.open('VM cloned successfully', 'Close', { duration: 3000 });
      await this.loadVMs(this.selectedNodeId()!);
    } catch (err: any) {
      this.snackBar.open('Failed to clone VM', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  async deleteVM(vm: VM): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Delete VM',
      message: `Are you sure you want to delete VM ${vm.name}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'delete_forever'
    }).toPromise();

    if (!confirmed) return;

    this.loading.set(true);

    try {
      await this.vmService.deleteVM(this.selectedNodeId()!, vm.vmid);
      this.snackBar.open('VM deleted successfully', 'Close', { duration: 3000 });
      await this.loadVMs(this.selectedNodeId()!);
    } catch (err: any) {
      this.snackBar.open('Failed to delete VM', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  // Assign IP actions
  openAssignIpDialog(vm: VM): void {
    this.vmForAssign.set(vm);
    this.assignForm.reset({ hostname: vm.name || '', alsoSetVmNetworkConfig: true });
    this.ipPoolService.listPools().subscribe({
      next: (pools) => {
        this.pools.set(pools);
        if (pools.length > 0) {
          const pid = pools[0].id;
          this.selectedPoolId.set(pid);
          this.assignForm.get('pool_id')?.setValue(pid);
          this.loadPoolIPs(pid);
        }
        this.showAssignIpDialog.set(true);
      },
      error: () => {
        this.pools.set([]);
        this.poolIPs.set([]);
        this.showAssignIpDialog.set(true);
      }
    });
  }

  onPoolChange(poolId: number): void {
    this.selectedPoolId.set(poolId);
    this.assignForm.get('pool_id')?.setValue(poolId);
    this.loadPoolIPs(poolId);
  }

  private loadPoolIPs(poolId: number): void {
    this.ipPoolService.listPoolIPs(poolId, false).subscribe({
      next: (ips) => {
        // Only show available IPs
        this.poolIPs.set(ips.filter(i => !i.is_allocated));
      },
      error: () => {
        this.poolIPs.set([]);
      }
    });
  }

  closeAssignIpDialog(): void {
    this.showAssignIpDialog.set(false);
    this.vmForAssign.set(null);
  }

  allocateIpToVm(): void {
    const vm = this.vmForAssign();
    const nodeId = this.selectedNodeId();
    const poolId = this.assignForm.value.pool_id;
    const ipAddress = this.assignForm.value.ip_address;
    const hostname = this.assignForm.value.hostname || undefined;
    const mac = this.assignForm.value.mac_address || undefined;
    const notes = this.assignForm.value.notes || undefined;
    const alsoSetVmNetworkConfig = !!this.assignForm.value.alsoSetVmNetworkConfig;

    if (!vm || !nodeId || !poolId || !ipAddress) {
      this.snackBar.open('Please select pool and IP address', 'Close', { duration: 3000 });
      return;
    }

    this.ipPoolService.allocateIP(poolId, {
      ip_address: ipAddress,
      vm_id: vm.vmid,
      hostname,
      mac_address: mac,
      notes
    }).subscribe({
      next: () => {
        if (alsoSetVmNetworkConfig) {
          const selectedPool = this.pools().find(p => p.id === poolId);
          const gateway = selectedPool?.gateway;
          const dns_servers = selectedPool?.name_servers || null;
          // Update VM network config
          // reuse VMService? endpoint is under vm-users; we'll use fetch
          fetch(`${location.origin.replace(/:\d+$/, ':8000')}/vm-users/network`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' },
            body: JSON.stringify({
              vm_id: vm.vmid,
              node_id: nodeId,
              ip_address: ipAddress,
              ip_pool_id: poolId,
              gateway,
              dns_servers,
              hostname: hostname || null,
              mac_address: mac || null,
              enable_dhcp: false
            })
          }).finally(() => {
            this.snackBar.open(`IP ${ipAddress} allocated to VM ${vm.vmid}`, 'Close', { duration: 3000 });
            this.closeAssignIpDialog();
          });
        } else {
          this.snackBar.open(`IP ${ipAddress} allocated to VM ${vm.vmid}`, 'Close', { duration: 3000 });
          this.closeAssignIpDialog();
        }
      },
      error: (err) => {
        this.snackBar.open(`Failed to allocate IP: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
      }
    });
  }
}
