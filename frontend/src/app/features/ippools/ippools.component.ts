import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../shared/material.module';
import { IPPoolService, IPPool, IPAddress } from '../../core/services/ippool.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ConfirmationService } from '../../shared/services/confirmation.service';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { PermissionService } from '../../core/services/permission.service';
import { HasPermissionDirective } from '../../core/directives/has-permission.directive';
import { DisableIfNoPermissionDirective } from '../../core/directives/disable-if-no-permission.directive';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ClusterService, ClusterNode } from '../../core/services/cluster.service';
import { VMService, VM } from '../../core/services/vm.service';

@Component({
  selector: 'app-ippools',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ReactiveFormsModule,
    HasPermissionDirective,
    DisableIfNoPermissionDirective
  ],
  templateUrl: './ippools.component.html',
  styleUrls: ['./ippools.component.scss']
})
export class IPPoolsComponent implements OnInit {
  pools = signal<IPPool[]>([]);
  selectedPool = signal<IPPool | null>(null);
  poolIPs = signal<IPAddress[]>([]);
  loading = signal(true);
  ipsLoading = signal(false);
  displayedColumns = ['ip_address', 'status', 'vm_id', 'hostname', 'mac_address', 'allocated_at', 'actions'];
  showAllocatedOnly = signal(false);

  poolForm: FormGroup;
  showPoolForm = signal(false);

  // Allocate IP form/dialog state
  allocateForm: FormGroup;
  showAllocateForm = signal(false);
  ipToAllocate = signal<IPAddress | null>(null);
  nodes = signal<ClusterNode[]>([]);
  vms = signal<VM[]>([]);
  selectedNodeId = signal<number | null>(null);

  constructor(
    private ipPoolService: IPPoolService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private confirmationService: ConfirmationService,
    private fb: FormBuilder,
    private permissionService: PermissionService,
    private http: HttpClient,
    private clusterService: ClusterService,
    private vmService: VMService
  ) {
    this.poolForm = this.fb.group({
      name: ['', [Validators.required]],
      gateway: ['', [Validators.required, Validators.pattern(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)]],
      netmask: ['', [Validators.required]],
      first_ip: ['', [Validators.required, Validators.pattern(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)]],
      last_ip: ['', [Validators.required, Validators.pattern(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)]],
      bridge: ['vmbr0', [Validators.required]],
      vlan_tag: [null],
      name_servers: [''],
      description: ['']
    });

    this.allocateForm = this.fb.group({
      node_id: [null, [Validators.required]],
      vm_id: [null, [Validators.required]],
      hostname: [''],
      mac_address: [''],
      notes: [''],
      alsoSetVmNetworkConfig: [true]
    });
  }

  ngOnInit(): void {
    this.loadPools();
  }

  loadPools(): void {
    this.loading.set(true);
    this.ipPoolService.listPools().subscribe({
      next: (pools) => {
        this.pools.set(pools);
        this.loading.set(false);
        if (pools.length > 0 && !this.selectedPool()) {
          this.selectPool(pools[0]);
        }
      },
      error: (err) => {
        console.error('Error loading IP pools:', err);
        this.snackBar.open('Failed to load IP pools', 'Close', { duration: 5000 });
        this.loading.set(false);
      }
    });
  }

  selectPool(pool: IPPool): void {
    this.selectedPool.set(pool);
    this.loadPoolIPs(pool.id);
  }

  loadPoolIPs(poolId: number): void {
    this.ipsLoading.set(true);
    this.ipPoolService.listPoolIPs(poolId, this.showAllocatedOnly()).subscribe({
      next: (ips) => {
        this.poolIPs.set(ips);
        this.ipsLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading pool IPs:', err);
        this.snackBar.open('Failed to load IP addresses', 'Close', { duration: 5000 });
        this.ipsLoading.set(false);
      }
    });
  }

  toggleAllocatedFilter(): void {
    this.showAllocatedOnly.update(v => !v);
    if (this.selectedPool()) {
      this.loadPoolIPs(this.selectedPool()!.id);
    }
  }

  openCreatePoolDialog(): void {
    this.showPoolForm.set(true);
    this.poolForm.reset({ bridge: 'vmbr0' });
  }

  closePoolForm(): void {
    this.showPoolForm.set(false);
  }

  createPool(): void {
    if (this.poolForm.invalid) {
      this.snackBar.open('Please fill all required fields correctly', 'Close', { duration: 3000 });
      return;
    }

    this.ipPoolService.createPool(this.poolForm.value).subscribe({
      next: (pool) => {
        this.snackBar.open(`IP pool "${pool.name}" created successfully`, 'Close', { duration: 3000 });
        this.closePoolForm();
        this.loadPools();
      },
      error: (err) => {
        this.snackBar.open(
          `Failed to create IP pool: ${err.error?.detail || 'Unknown error'}`,
          'Close',
          { duration: 5000 }
        );
      }
    });
  }

  deallocateIP(ip: IPAddress): void {
    this.confirmationService.confirm({
      title: 'Deallocate IP Address',
      message: `Are you sure you want to deallocate ${ip.ip_address}?`,
      confirmText: 'Deallocate',
      cancelText: 'Cancel'
    }).subscribe(confirmed => {
      if (confirmed) {
        this.ipPoolService.deallocateIP(ip.pool_id, ip.id).subscribe({
          next: () => {
            this.snackBar.open(`IP ${ip.ip_address} deallocated successfully`, 'Close', { duration: 3000 });
            this.loadPoolIPs(ip.pool_id);
            this.loadPools(); // Refresh stats
          },
          error: (err) => {
            this.snackBar.open(
              `Failed to deallocate IP: ${err.error?.detail || 'Unknown error'}`,
              'Close',
              { duration: 5000 }
            );
          }
        });
      }
    });
  }

  deletePool(pool: IPPool): void {
    this.confirmationService.confirm({
      title: 'Delete IP Pool',
      message: `Are you sure you want to delete pool "${pool.name}"? This will delete all ${pool.total_ips} IP addresses.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    }).subscribe(confirmed => {
      if (confirmed) {
        this.ipPoolService.deletePool(pool.id).subscribe({
          next: () => {
            this.snackBar.open(`Pool "${pool.name}" deleted successfully`, 'Close', { duration: 3000 });
            if (this.selectedPool()?.id === pool.id) {
              this.selectedPool.set(null);
              this.poolIPs.set([]);
            }
            this.loadPools();
          },
          error: (err) => {
            this.snackBar.open(
              `Failed to delete pool: ${err.error?.detail || 'Unknown error'}`,
              'Close',
              { duration: 5000 }
            );
          }
        });
      }
    });
  }

  canCreatePool(): boolean {
    return this.permissionService.hasPermission('ippool', 'create');
  }

  canDeletePool(): boolean {
    return this.permissionService.hasPermission('ippool', 'delete');
  }

  canDeallocateIP(): boolean {
    return this.permissionService.hasPermission('ippool', 'deallocate');
  }

  getUtilizationPercentage(pool: IPPool): number {
    return pool.total_ips > 0 ? (pool.allocated_ips / pool.total_ips) * 100 : 0;
  }

  getUtilizationColor(pool: IPPool): string {
    const pct = this.getUtilizationPercentage(pool);
    if (pct >= 90) return 'warn';
    if (pct >= 70) return 'accent';
    return 'primary';
  }

  // Allocate IP workflow
  openAllocateDialog(ip: IPAddress): void {
    if (ip.is_allocated) return;
    this.ipToAllocate.set(ip);
    this.allocateForm.reset({ alsoSetVmNetworkConfig: true });
    // Load nodes for selection
    this.clusterService.listNodes().then(nodes => {
      this.nodes.set(nodes);
      if (nodes.length > 0) {
        const defaultNodeId = nodes[0].id;
        this.selectedNodeId.set(defaultNodeId);
        this.allocateForm.get('node_id')?.setValue(defaultNodeId);
        this.loadNodeVMs(defaultNodeId);
      }
    }).catch(() => {
      this.nodes.set([]);
      this.vms.set([]);
    });
    this.showAllocateForm.set(true);
  }
  onNodeChange(nodeId: number): void {
    this.selectedNodeId.set(nodeId);
    this.allocateForm.get('node_id')?.setValue(nodeId);
    this.loadNodeVMs(nodeId);
  }

  private loadNodeVMs(nodeId: number): void {
    this.vmService.listVMs(nodeId).subscribe({
      next: (resp) => {
        this.vms.set(resp.vms || []);
      },
      error: () => {
        this.vms.set([]);
      }
    });
  }

  closeAllocateDialog(): void {
    this.showAllocateForm.set(false);
    this.ipToAllocate.set(null);
  }

  allocateSelectedIP(): void {
    const ip = this.ipToAllocate();
    const pool = this.selectedPool();
    if (!ip || !pool) return;

    if (this.allocateForm.invalid) {
      this.snackBar.open('Please provide a valid VM ID', 'Close', { duration: 3000 });
      return;
    }

    const { node_id, vm_id, hostname, mac_address, notes, alsoSetVmNetworkConfig } = this.allocateForm.value;

    this.ipPoolService.allocateIP(pool.id, {
      ip_address: ip.ip_address,
      vm_id,
      hostname: hostname || undefined,
      mac_address: mac_address || undefined,
      notes: notes || undefined
    }).subscribe({
      next: () => {
        // Optionally set VM network config to reflect assignment
        if (alsoSetVmNetworkConfig) {
          this.http.post(`${environment.apiUrl}/vm-users/network`, {
            vm_id,
            node_id,
            ip_address: ip.ip_address,
            ip_pool_id: pool.id,
            gateway: pool.gateway,
            dns_servers: pool.name_servers || null,
            hostname: hostname || null,
            mac_address: mac_address || null,
            enable_dhcp: false
          }).subscribe({
            next: () => {
              this.snackBar.open(`IP ${ip.ip_address} allocated to VM ${vm_id}`, 'Close', { duration: 3000 });
              this.closeAllocateDialog();
              this.loadPoolIPs(pool.id);
              this.loadPools();
            },
            error: () => {
              // Allocation succeeded even if network config failed
              this.snackBar.open(`IP allocated. Network config update failed.`, 'Close', { duration: 4000 });
              this.closeAllocateDialog();
              this.loadPoolIPs(pool.id);
              this.loadPools();
            }
          });
        } else {
          this.snackBar.open(`IP ${ip.ip_address} allocated to VM ${vm_id}`, 'Close', { duration: 3000 });
          this.closeAllocateDialog();
          this.loadPoolIPs(pool.id);
          this.loadPools();
        }
      },
      error: (err) => {
        this.snackBar.open(
          `Failed to allocate IP: ${err.error?.detail || 'Unknown error'}`,
          'Close',
          { duration: 5000 }
        );
      }
    });
  }
}
