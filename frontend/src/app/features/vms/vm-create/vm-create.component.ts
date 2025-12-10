import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material.module';
import { VMService, VMCreateData } from '../../../core/services/vm.service';
import { ClusterService, ClusterNode } from '../../../core/services/cluster.service';
import { CloudInitService, CloudInitProfile } from '../../../core/services/cloud-init.service';
import { IPPoolService, IPPool } from '../../../core/services/ippool.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-vm-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule
  ],
  templateUrl: './vm-create.component.html',
  styleUrls: ['./vm-create.component.scss']
})
export class VmCreateComponent implements OnInit {
  nodes = signal<ClusterNode[]>([]);
  templates = signal<any[]>([]);
  isos = signal<string[]>([]);
  storages = signal<any[]>([]);
  cloudInitProfiles = signal<any[]>([]);
  ipPools = signal<any[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  
  // Form groups for each step
  basicForm!: FormGroup;
  resourceForm!: FormGroup;
  storageForm!: FormGroup;
  networkForm!: FormGroup;
  cloudInitForm!: FormGroup;
  
  constructor(
    private fb: FormBuilder,
    private vmService: VMService,
    private clusterService: ClusterService,
    private cloudInitService: CloudInitService,
    private ippoolService: IPPoolService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.initForms();
  }
  
  ngOnInit(): void {
    this.loadNodes();
    this.loadCloudInitProfiles();
    this.loadIPPools();
  }
  
  private initForms(): void {
    // Step 1: Basic Configuration
    this.basicForm = this.fb.group({
      nodeId: [null, Validators.required],
      vmid: [null],  // Optional - will be auto-generated if not provided
      name: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(255)]],
      osType: ['l26', Validators.required],
      useTemplate: [false],
      templateId: [null],
      useIso: [false],
      iso: [null]
    });
    
    // Step 2: Resource Allocation
    this.resourceForm = this.fb.group({
      cores: [2, [Validators.required, Validators.min(1), Validators.max(128)]],
      sockets: [1, [Validators.required, Validators.min(1), Validators.max(4)]],
      memory: [2048, [Validators.required, Validators.min(512)]],
      memoryUnit: ['MB']
    });
    
    // Step 3: Storage Configuration
    this.storageForm = this.fb.group({
      storage: ['local-lvm', Validators.required],
      diskSize: [32, [Validators.required, Validators.min(1)]],
      diskUnit: ['GB'],
      diskType: ['scsi']
    });
    
    // Step 4: Network Configuration
    this.networkForm = this.fb.group({
      networkBridge: ['vmbr0', Validators.required],
      networkModel: ['virtio', Validators.required],
      enableFirewall: [false]
    });
    
    // Step 5: Provisioning & IP Assignment
    this.cloudInitForm = this.fb.group({
      autoAssignIP: [false],
      ipPoolId: [null],
      enableGuestAgent: [true],
      provisionViaGuestAgent: [false],
      // Cloud-init overrides
      default_user: [''],
      default_password: [''],
      ssh_authorized_keys: [''], // newline or comma separated
      ssh_pwauth: [true],
      packages: [''], // newline or comma separated
      docker_compose_content: [''],
      docker_compose_path: ['/root/docker-compose.yml'],
      start_docker_compose: [false],
      timezone: [''],
      locale: ['']
    });
    
    // Watch for node selection changes
    this.basicForm.get('nodeId')?.valueChanges.subscribe(nodeId => {
      if (nodeId) {
        this.loadNodeResources(nodeId);
        this.fetchNextVMID(nodeId);
      }
    });
    
    // Watch for template/ISO toggle
    this.basicForm.get('useTemplate')?.valueChanges.subscribe(useTemplate => {
      const templateControl = this.basicForm.get('templateId');
      if (useTemplate) {
        templateControl?.setValidators(Validators.required);
        this.basicForm.get('useIso')?.setValue(false);
      } else {
        templateControl?.clearValidators();
      }
      templateControl?.updateValueAndValidity();
    });
    
    this.basicForm.get('useIso')?.valueChanges.subscribe(useIso => {
      const isoControl = this.basicForm.get('iso');
      if (useIso) {
        isoControl?.setValidators(Validators.required);
        this.basicForm.get('useTemplate')?.setValue(false);
      } else {
        isoControl?.clearValidators();
      }
      isoControl?.updateValueAndValidity();
    });
    
    // If provisioning via guest agent, ensure guest agent device enabled
    this.cloudInitForm.get('provisionViaGuestAgent')?.valueChanges.subscribe(enabled => {
      if (enabled) {
        // Ensure guest agent device enabled
        this.cloudInitForm.get('enableGuestAgent')?.setValue(true);
      }
    });
    
    // Watch for IP assignment toggle
    this.cloudInitForm.get('autoAssignIP')?.valueChanges.subscribe(enabled => {
      const poolControl = this.cloudInitForm.get('ipPoolId');
      if (enabled) {
        poolControl?.setValidators(Validators.required);
      } else {
        poolControl?.clearValidators();
      }
      poolControl?.updateValueAndValidity();
    });
  }
  
  private async loadCloudInitProfiles(): Promise<void> {
    try {
      this.cloudInitService.listProfiles().subscribe({
        next: (response: { profiles: CloudInitProfile[] }) => {
          this.cloudInitProfiles.set(response.profiles);
        },
        error: (err: any) => {
          console.error('Failed to load cloud-init profiles:', err);
        }
      });
    } catch (err) {
      console.error('Failed to load cloud-init profiles:', err);
    }
  }
  
  private async loadIPPools(): Promise<void> {
    try {
      this.ippoolService.listPools().subscribe({
        next: (pools: IPPool[]) => {
          this.ipPools.set(pools);
        },
        error: (err: any) => {
          console.error('Failed to load IP pools:', err);
        }
      });
    } catch (err) {
      console.error('Failed to load IP pools:', err);
    }
  }
  
  private async loadNodes(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      const nodes = await this.clusterService.listNodes();
      this.nodes.set(nodes);
    } catch (err: any) {
      this.error.set('Failed to load nodes');
      this.snackBar.open('Failed to load nodes', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }
  
  private async loadNodeResources(nodeId: number): Promise<void> {
    this.loading.set(true);
    
    try {
      // Load templates, ISOs, and storages in parallel
      const [templates, isos, storages] = await Promise.all([
        this.vmService.listTemplates(nodeId),
        this.vmService.listIsos(nodeId),
        this.vmService.listStorages(nodeId)
      ]);
      
      this.templates.set(templates);
      this.isos.set(isos);
      this.storages.set(storages);
      
      // Set default storage if available
      if (storages.length > 0) {
        this.storageForm.patchValue({ storage: storages[0].storage });
      }
    } catch (err: any) {
      this.snackBar.open('Failed to load node resources', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }
  
  private async fetchNextVMID(nodeId: number): Promise<void> {
    try {
      const response = await this.vmService.getNextVMID(nodeId);
      this.basicForm.patchValue({ vmid: response.nextid });
    } catch (err: any) {
      console.error('Failed to fetch next VMID:', err);
    }
  }
  
  async createVM(): Promise<void> {
    if (!this.isValid()) {
      this.snackBar.open('Please fill in all required fields', 'Close', { duration: 3000 });
      return;
    }
    
    this.loading.set(true);
    this.error.set(null);
    
    try {
      const vmData: any = {
        vmid: this.basicForm.value.vmid,
        name: this.basicForm.value.name,
        cores: this.resourceForm.value.cores * this.resourceForm.value.sockets,
        memory: this.resourceForm.value.memoryUnit === 'GB' 
          ? this.resourceForm.value.memory * 1024 
          : this.resourceForm.value.memory,
        disk_size: this.storageForm.value.diskUnit === 'TB'
          ? this.storageForm.value.diskSize * 1024
          : this.storageForm.value.diskSize,
        storage: this.storageForm.value.storage,
        network_bridge: this.networkForm.value.networkBridge,
        os_type: this.basicForm.value.osType
      };
      
      if (this.basicForm.value.useTemplate) {
        vmData.template_id = this.basicForm.value.templateId;
      }
      
      if (this.basicForm.value.useIso) {
        vmData.iso = this.basicForm.value.iso;
      }
      
      // Collect provisioning overrides (guest-agent approach)
      const overrides = this.cloudInitForm.value;

      // Helper to parse list fields
      const parseList = (val: string | string[] | null | undefined): string[] => {
        if (!val) return [];
        if (Array.isArray(val)) return val.filter(v => !!v && v.toString().trim()).map(v => v.toString().trim());
        return val
          .split(/\n|,/) // split by newline or comma
          .map(v => v.trim())
          .filter(v => !!v);
      };

      const sshKeysList = parseList(overrides.ssh_authorized_keys);
      const packagesList = parseList(overrides.packages);

      // Only include overrides that are set
      if (overrides.default_user) vmData.default_user = overrides.default_user;
      if (overrides.default_password) vmData.default_password = overrides.default_password;
      if (sshKeysList.length) vmData.ssh_authorized_keys = sshKeysList;
      if (overrides.ssh_pwauth !== null && overrides.ssh_pwauth !== undefined) vmData.ssh_pwauth = overrides.ssh_pwauth;
      if (packagesList.length) vmData.packages = packagesList;
      if (overrides.docker_compose_content) vmData.docker_compose_content = overrides.docker_compose_content;
      if (overrides.docker_compose_path) vmData.docker_compose_path = overrides.docker_compose_path;
      if (overrides.start_docker_compose !== null && overrides.start_docker_compose !== undefined) vmData.start_docker_compose = overrides.start_docker_compose;
      if (overrides.timezone) vmData.timezone = overrides.timezone;
      if (overrides.locale) vmData.locale = overrides.locale;

      // Guest agent flags
      if (this.cloudInitForm.value.enableGuestAgent) {
        vmData.enable_guest_agent = true;
      }
      if (this.cloudInitForm.value.provisionViaGuestAgent) {
        vmData.provision_via_guest_agent = true;
      }
      
      // Add IP pool assignment if enabled
      if (this.cloudInitForm.value.autoAssignIP && this.cloudInitForm.value.ipPoolId) {
        vmData.auto_assign_ip = true;
        vmData.ip_pool_id = this.cloudInitForm.value.ipPoolId;
      }
      
      const result: any = await this.vmService.createVM(this.basicForm.value.nodeId, vmData);
      
      let successMsg = 'VM created successfully';
      if (result.assigned_ip) {
        successMsg += ` with IP ${result.assigned_ip}`;
      }
      if (this.cloudInitForm.value.provisionViaGuestAgent) {
        successMsg += ' and guest-agent provisioning started';
      }
      
      this.snackBar.open(successMsg, 'Close', { duration: 5000 });
      this.router.navigate(['/vms']);
    } catch (err: any) {
      this.error.set(err.error?.detail || 'Failed to create VM');
      this.snackBar.open(this.error() ?? 'Failed to create VM', 'Close', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }
  
  isValid(): boolean {
    return this.basicForm.valid && 
           this.resourceForm.valid && 
           this.storageForm.valid && 
           this.networkForm.valid &&
           this.cloudInitForm.valid;
  }
  
  cancel(): void {
    this.router.navigate(['/vms']);
  }
}
