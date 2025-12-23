import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../shared/material.module';
import { VMService, VMCreateData } from '../../../core/services/vm.service';
import { ClusterService, ClusterNode } from '../../../core/services/cluster.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CloudInitService, CloudInitProfile } from '../../../core/services/cloud-init.service';

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
  cloudInitProfiles = signal<CloudInitProfile[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  
  // Form groups for each step
  basicForm!: FormGroup;
  resourceForm!: FormGroup;
  storageForm!: FormGroup;
  networkForm!: FormGroup;
  provisioningForm!: FormGroup;
  
  constructor(
    private fb: FormBuilder,
    private vmService: VMService,
    private clusterService: ClusterService,
    private cloudInitService: CloudInitService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.initForms();
  }
  
  ngOnInit(): void {
    this.loadNodes();
    this.loadCloudInitProfiles();
  }
  
  private initForms(): void {
    // Step 1: Basic Configuration
    this.basicForm = this.fb.group({
      nodeId: [null, Validators.required],
      vmid: [null, [Validators.required, Validators.min(100), Validators.max(999999999)]],
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

    // Step 5: Provisioning & Cloud-init
    this.provisioningForm = this.fb.group({
      cloudInitProfileId: [null],
      enableGuestAgent: [false],
      provisionViaGuestAgent: [false],
      defaultUser: [''],
      defaultPassword: [''],
      sshAuthorizedKeys: [''],
      sshPwauth: [true],
      packages: [''],
      aptUpdate: [true],
      aptUpgrade: [false],
      aptRebootIfRequired: [false],
      dockerComposePath: ['/root/docker-compose.yml'],
      dockerComposeContent: [''],
      startDockerCompose: [false],
      timezone: [''],
      locale: ['']
    });
    
    // Watch for node selection changes
    this.basicForm.get('nodeId')?.valueChanges.subscribe(nodeId => {
      if (nodeId) {
        this.loadNodeResources(nodeId);
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

  private async loadCloudInitProfiles(): Promise<void> {
    try {
      const response = await this.cloudInitService.listProfiles().toPromise();
      this.cloudInitProfiles.set(response?.profiles || []);
    } catch (err: any) {
      this.snackBar.open('Failed to load cloud-init profiles', 'Close', { duration: 3000 });
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
      const vmData: VMCreateData = {
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

      // Provisioning and cloud-init configuration
      const provisioning = this.provisioningForm.value;
      if (provisioning.cloudInitProfileId) {
        vmData.cloud_init_profile_id = provisioning.cloudInitProfileId;
      }
      if (provisioning.enableGuestAgent) {
        vmData.enable_guest_agent = true;
      }
      if (provisioning.provisionViaGuestAgent) {
        vmData.provision_via_guest_agent = true;
      }
      if (provisioning.defaultUser) {
        vmData.default_user = provisioning.defaultUser;
      }
      if (provisioning.defaultPassword) {
        vmData.default_password = provisioning.defaultPassword;
      }

      const sshKeys = (provisioning.sshAuthorizedKeys || '')
        .split('\n')
        .map((k: string) => k.trim())
        .filter((k: string) => k.length);
      if (sshKeys.length) {
        vmData.ssh_authorized_keys = sshKeys;
      }

      if (provisioning.sshPwauth === false) {
        vmData.ssh_pwauth = false;
      }
      if (provisioning.aptUpdate !== null && provisioning.aptUpdate !== undefined) {
        vmData.apt_update = provisioning.aptUpdate;
      }
      if (provisioning.aptUpgrade !== null && provisioning.aptUpgrade !== undefined) {
        vmData.apt_upgrade = provisioning.aptUpgrade;
      }
      if (provisioning.aptRebootIfRequired !== null && provisioning.aptRebootIfRequired !== undefined) {
        vmData.apt_reboot_if_required = provisioning.aptRebootIfRequired;
      }

      const packages = (provisioning.packages || '')
        .split('\n')
        .map((p: string) => p.trim())
        .filter((p: string) => p.length);
      if (packages.length) {
        vmData.packages = packages;
      }

      if (provisioning.dockerComposeContent) {
        vmData.docker_compose_content = provisioning.dockerComposeContent;
      }
      if (provisioning.dockerComposePath) {
        vmData.docker_compose_path = provisioning.dockerComposePath;
      }
      if (provisioning.startDockerCompose) {
        vmData.start_docker_compose = true;
      }
      if (provisioning.timezone) {
        vmData.timezone = provisioning.timezone;
      }
      if (provisioning.locale) {
        vmData.locale = provisioning.locale;
      }
      
      await this.vmService.createVM(this.basicForm.value.nodeId, vmData);
      
      this.snackBar.open('VM created successfully', 'Close', { duration: 3000 });
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
           this.provisioningForm.valid;
  }
  
  cancel(): void {
    this.router.navigate(['/vms']);
  }
}
