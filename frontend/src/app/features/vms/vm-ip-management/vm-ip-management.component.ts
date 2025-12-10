import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../../shared/material.module';
import { IPPoolService, IPPool, IPAddress } from '../../../core/services/ippool.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ConfirmationService } from '../../../shared/services/confirmation.service';

interface VmNetworkConfig {
  id?: number;
  vm_id: number;
  ip_address?: string;
  ip_pool_id?: number;
  gateway?: string;
  dns_servers?: string;
  hostname?: string;
  domain_search?: string;
  mac_address?: string;
  enable_dhcp: boolean;
}

@Component({
  selector: 'app-vm-ip-management',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    ReactiveFormsModule
  ],
  templateUrl: './vm-ip-management.component.html',
  styleUrls: ['./vm-ip-management.component.scss']
})
export class VmIpManagementComponent implements OnInit {
  @Input() nodeId!: number;
  @Input() vmid!: number;
  @Input() vmName?: string;

  loading = signal(false);
  allocatedIPs = signal<IPAddress[]>([]);
  vmNetworkConfig = signal<VmNetworkConfig | null>(null);
  showAssignDialog = signal(false);
  
  assignForm: FormGroup;
  pools = signal<IPPool[]>([]);
  poolIPs = signal<IPAddress[]>([]);
  selectedPoolId = signal<number | null>(null);

  constructor(
    private ipPoolService: IPPoolService,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private http: HttpClient,
    private confirmationService: ConfirmationService
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
    this.loadVmIPs();
    this.loadVmNetworkConfig();
  }

  loadVmIPs(): void {
    this.loading.set(true);
    // Load all pools and filter IPs allocated to this VM
    this.ipPoolService.listPools().subscribe({
      next: (pools) => {
        const ipPromises = pools.map(pool => 
          this.ipPoolService.listPoolIPs(pool.id, true).toPromise()
        );
        
        Promise.all(ipPromises).then(results => {
          const allIPs = results.flat().filter((ip): ip is IPAddress => ip !== undefined && ip.vm_id === this.vmid);
          this.allocatedIPs.set(allIPs);
          this.loading.set(false);
        }).catch(() => {
          this.loading.set(false);
        });
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  loadVmNetworkConfig(): void {
    this.http.get<{ config: VmNetworkConfig | null }>(`${environment.apiUrl}/vm-users/network/${this.vmid}`).subscribe({
      next: (resp) => {
        this.vmNetworkConfig.set(resp.config);
      },
      error: () => {
        this.vmNetworkConfig.set(null);
      }
    });
  }

  openAssignDialog(): void {
    this.assignForm.reset({ hostname: this.vmName || '', alsoSetVmNetworkConfig: true });
    this.ipPoolService.listPools().subscribe({
      next: (pools) => {
        this.pools.set(pools);
        if (pools.length > 0) {
          const pid = pools[0].id;
          this.selectedPoolId.set(pid);
          this.assignForm.get('pool_id')?.setValue(pid);
          this.loadPoolIPs(pid);
        }
        this.showAssignDialog.set(true);
      },
      error: () => {
        this.pools.set([]);
        this.poolIPs.set([]);
        this.showAssignDialog.set(true);
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
        this.poolIPs.set(ips.filter(i => !i.is_allocated));
      },
      error: () => {
        this.poolIPs.set([]);
      }
    });
  }

  closeAssignDialog(): void {
    this.showAssignDialog.set(false);
  }

  assignIP(): void {
    const poolId = this.assignForm.value.pool_id;
    const ipAddress = this.assignForm.value.ip_address;
    const hostname = this.assignForm.value.hostname || undefined;
    const mac = this.assignForm.value.mac_address || undefined;
    const notes = this.assignForm.value.notes || undefined;
    const alsoSetVmNetworkConfig = !!this.assignForm.value.alsoSetVmNetworkConfig;

    if (!poolId || !ipAddress) {
      this.snackBar.open('Please select pool and IP address', 'Close', { duration: 3000 });
      return;
    }

    this.ipPoolService.allocateIP(poolId, {
      ip_address: ipAddress,
      vm_id: this.vmid,
      hostname,
      mac_address: mac,
      notes
    }).subscribe({
      next: () => {
        if (alsoSetVmNetworkConfig) {
          const selectedPool = this.pools().find(p => p.id === poolId);
          const gateway = selectedPool?.gateway;
          const dns_servers = selectedPool?.name_servers || null;
          
          this.http.post(`${environment.apiUrl}/vm-users/network`, {
            vm_id: this.vmid,
            node_id: this.nodeId,
            ip_address: ipAddress,
            ip_pool_id: poolId,
            gateway,
            dns_servers,
            hostname: hostname || null,
            mac_address: mac || null,
            enable_dhcp: false
          }).subscribe({
            next: () => {
              this.snackBar.open(`IP ${ipAddress} assigned successfully`, 'Close', { duration: 3000 });
              this.closeAssignDialog();
              this.loadVmIPs();
              this.loadVmNetworkConfig();
            },
            error: () => {
              this.snackBar.open(`IP assigned. Network config update failed.`, 'Close', { duration: 4000 });
              this.closeAssignDialog();
              this.loadVmIPs();
            }
          });
        } else {
          this.snackBar.open(`IP ${ipAddress} assigned successfully`, 'Close', { duration: 3000 });
          this.closeAssignDialog();
          this.loadVmIPs();
        }
      },
      error: (err) => {
        this.snackBar.open(`Failed to assign IP: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
      }
    });
  }

  deallocateIP(ip: IPAddress): void {
    this.confirmationService.confirm({
      title: 'Deallocate IP',
      message: `Are you sure you want to deallocate ${ip.ip_address}?`,
      confirmText: 'Deallocate',
      cancelText: 'Cancel'
    }).subscribe(confirmed => {
      if (confirmed) {
        this.ipPoolService.deallocateIP(ip.pool_id, ip.id).subscribe({
          next: () => {
            this.snackBar.open(`IP ${ip.ip_address} deallocated successfully`, 'Close', { duration: 3000 });
            this.loadVmIPs();
            this.loadVmNetworkConfig();
          },
          error: (err) => {
            this.snackBar.open(`Failed to deallocate IP: ${err.error?.detail || 'Unknown error'}`, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }

  getPoolName(poolId: number): string {
    const pool = this.pools().find(p => p.id === poolId);
    return pool?.name || `Pool ${poolId}`;
  }
}
