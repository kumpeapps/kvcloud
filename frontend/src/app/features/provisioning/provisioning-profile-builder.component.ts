import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { ProvisioningService, ProvisioningProfile, ProvisioningVariables, ProvisioningVariable } from '../../core/services/provisioning.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-provisioning-profile-builder',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatChipsModule,
    MatIconModule,
    MatExpansionModule,
    MatTabsModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  templateUrl: './provisioning-profile-builder.component.html',
  styleUrl: './provisioning-profile-builder.component.scss'
})
export class ProvisioningProfileBuilderComponent implements OnInit {
  profileForm!: FormGroup;
  variables: ProvisioningVariables | null = null;
  previewYaml: string = '';
  showPreview = false;
  editingProfileId: number | null = null;
  isEditMode = false;

  timezones = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai'
  ];

  locales = [
    'en_US.UTF-8', 'en_GB.UTF-8', 'de_DE.UTF-8', 'fr_FR.UTF-8', 'es_ES.UTF-8',
    'ja_JP.UTF-8', 'zh_CN.UTF-8'
  ];

  constructor(
    private fb: FormBuilder,
    private provisioningService: ProvisioningService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.initForm();
    this.loadVariables();
    
    // Check if we're editing an existing profile
    this.route.queryParams.subscribe(params => {
      if (params['id']) {
        this.editingProfileId = +params['id'];
        this.isEditMode = true;
        this.loadProfile(this.editingProfileId);
      }
    });
  }

  formatVariable(name: string): string {
    return `\${${name}}`;
  }

  loadProfile(id: number) {
    this.provisioningService.getProfile(id).subscribe({
      next: (profile: any) => {
        // Convert arrays to newline-separated strings for the form
        this.profileForm.patchValue({
          ...profile,
          packages: Array.isArray(profile.packages) ? profile.packages.join('\n') : '',
          bootcmd: Array.isArray(profile.bootcmd) ? profile.bootcmd.join('\n') : '',
          runcmd: Array.isArray(profile.runcmd) ? profile.runcmd.join('\n') : '',
          ssh_authorized_keys: Array.isArray(profile.ssh_authorized_keys) ? profile.ssh_authorized_keys.join('\n') : '',
        });
      },
      error: (err: any) => {
        this.snackBar.open('Failed to load profile: ' + (err.error?.detail || 'Unknown error'), 'Close', { duration: 5000 });
        this.router.navigate(['/provisioning/profiles']);
      }
    });
  }

  initForm() {
    this.profileForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      
      // Basic user
      default_user: [''],
      default_password: [''],
      disable_root: [false],
      
      // Packages
      apt_update: [true],
      apt_upgrade: [false],
      apt_reboot_if_required: [false],
      packages: [''],
      package_update_frequency: [''],
      
      // Scripts
      bootcmd: [''],
      runcmd: [''],
      
      // Docker
      install_docker: [false],
      docker_compose_content: [''],
      docker_compose_path: ['/root/docker-compose.yml'],
      start_docker_compose: [false],
      
      // Network
      network_config_template: [''],
      hostname_template: [''],
      
      // SSH
      ssh_authorized_keys: [''],
      ssh_pwauth: [true],
      
      // System
      timezone: [''],
      locale: [''],
      
      // Advanced
      custom_cloud_config: ['']
    });
  }

  loadVariables() {
    this.provisioningService.getVariables().subscribe({
      next: (vars: ProvisioningVariables) => {
        this.variables = vars;
      },
      error: (err: any) => {
        console.error('Failed to load variables:', err);
      }
    });
  }

  get allVariables(): string[] {
    if (!this.variables) return [];
    const userVars = this.variables.user_variables.map((v: ProvisioningVariable) => `\${${v.name}}`);
    const vmVars = this.variables.vm_variables.map((v: ProvisioningVariable) => `\${${v.name}}`);
    return [...userVars, ...vmVars];
  }

  insertVariable(fieldName: string, variable: string) {
    const control = this.profileForm.get(fieldName);
    if (control) {
      const currentValue = control.value || '';
      control.setValue(currentValue + variable);
    }
  }

  onPreview() {
    const formValue = this.profileForm.value;
    
    // Parse array fields
    const profile: any = {
      ...formValue,
      packages: formValue.packages ? formValue.packages.split('\n').filter((p: string) => p.trim()) : [],
      bootcmd: formValue.bootcmd ? formValue.bootcmd.split('\n').filter((c: string) => c.trim()) : [],
      runcmd: formValue.runcmd ? formValue.runcmd.split('\n').filter((c: string) => c.trim()) : [],
      ssh_authorized_keys: formValue.ssh_authorized_keys ? formValue.ssh_authorized_keys.split('\n').filter((k: string) => k.trim()) : [],
    };

    this.provisioningService.previewProfile(profile).subscribe({
      next: (result: any) => {
        this.previewYaml = result.yaml;
        this.showPreview = true;
      },
      error: (err: any) => {
        this.snackBar.open('Preview failed: ' + (err.error?.detail || 'Unknown error'), 'Close', { duration: 5000 });
      }
    });
  }

  onSave() {
    if (this.profileForm.invalid) {
      this.snackBar.open('Please fill in all required fields', 'Close', { duration: 3000 });
      return;
    }

    const formValue = this.profileForm.value;
    const profile: any = {
      ...formValue,
      packages: formValue.packages ? formValue.packages.split('\n').filter((p: string) => p.trim()) : [],
      bootcmd: formValue.bootcmd ? formValue.bootcmd.split('\n').filter((c: string) => c.trim()) : [],
      runcmd: formValue.runcmd ? formValue.runcmd.split('\n').filter((c: string) => c.trim()) : [],
      ssh_authorized_keys: formValue.ssh_authorized_keys ? formValue.ssh_authorized_keys.split('\n').filter((k: string) => k.trim()) : [],
    };

    if (this.isEditMode && this.editingProfileId) {
      // Update existing profile
      this.provisioningService.updateProfile(this.editingProfileId, profile).subscribe({
        next: (): void => {
          this.snackBar.open('Profile updated successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/provisioning/profiles']);
        },
        error: (err: any) => {
          this.snackBar.open('Update failed: ' + (err.error?.detail || 'Unknown error'), 'Close', { duration: 5000 });
        }
      });
    } else {
      // Create new profile
      this.provisioningService.createProfile(profile).subscribe({
        next: (): void => {
          this.snackBar.open('Profile created successfully', 'Close', { duration: 3000 });
          this.profileForm.reset();
          this.initForm();
        },
        error: (err: any) => {
          this.snackBar.open('Save failed: ' + (err.error?.detail || 'Unknown error'), 'Close', { duration: 5000 });
        }
      });
    }
  }
}
