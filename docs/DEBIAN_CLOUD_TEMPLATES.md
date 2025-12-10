# Debian Cloud-init Templates Setup Guide

## Overview
This guide explains how to download and set up Debian cloud images with cloud-init pre-installed as templates in Proxmox.

## Method 1: Manual Download and Import

### Step 1: Download Debian Cloud Image
SSH into your Proxmox node and download the latest Debian cloud image:

```bash
# Navigate to a temporary directory
cd /tmp

# Download Debian 12 (Bookworm) cloud image
wget https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2

# Or for Debian 11 (Bullseye)
wget https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-generic-amd64.qcow2
```

### Step 2: Create VM Template

```bash
# Create a new VM (change 9000 to your preferred template ID)
qm create 9000 --name debian-12-template --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0

# Import the disk to the VM
qm importdisk 9000 debian-12-generic-amd64.qcow2 local-lvm

# Attach the disk to the VM
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0

# Add cloud-init drive
qm set 9000 --ide2 local:cloudinit

# Set boot disk
qm set 9000 --boot c --bootdisk scsi0

# Add serial console
qm set 9000 --serial0 socket --vga serial0

# Convert to template
qm template 9000
```

### Step 3: Use Template in kvcloud
The template is now available in kvcloud's Templates page and can be cloned to create new VMs.

## Method 2: Using Proxmox GUI

1. SSH to Proxmox and download the image:
```bash
cd /var/lib/vz/template/qcow
wget https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2
```

2. In Proxmox GUI:
   - Create a new VM (VM ID: 9000, Name: debian-12-template)
   - Do NOT add any disks during creation
   - After creation, SSH to Proxmox and run:
     ```bash
     qm importdisk 9000 /var/lib/vz/template/qcow/debian-12-generic-amd64.qcow2 local-lvm
     ```
   - In GUI, go to Hardware → Add → Existing Disk → Select imported disk
   - Add Cloud-Init drive: Hardware → Add → CloudInit Drive
   - Convert to template: Right-click VM → Convert to template

## Debian Cloud Image URLs

### Latest Images
- **Debian 12 (Bookworm)**: https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2
- **Debian 11 (Bullseye)**: https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-generic-amd64.qcow2
- **Debian 10 (Buster)**: https://cloud.debian.org/images/cloud/buster/latest/debian-10-generic-amd64.qcow2

### Daily Builds
For the absolute latest:
- https://cloud.debian.org/images/cloud/bookworm/daily/latest/debian-12-generic-amd64.qcow2

## Other Popular Cloud Images

### Ubuntu
```bash
# Ubuntu 24.04 LTS (Noble)
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img

# Ubuntu 22.04 LTS (Jammy)
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

# Ubuntu 20.04 LTS (Focal)
wget https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64.img
```

### Rocky Linux
```bash
# Rocky Linux 9
wget https://download.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud-Base.latest.x86_64.qcow2

# Rocky Linux 8
wget https://download.rockylinux.org/pub/rocky/8/images/x86_64/Rocky-8-GenericCloud-Base.latest.x86_64.qcow2
```

### AlmaLinux
```bash
# AlmaLinux 9
wget https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2

# AlmaLinux 8
wget https://repo.almalinux.org/almalinux/8/cloud/x86_64/images/AlmaLinux-8-GenericCloud-latest.x86_64.qcow2
```

## Cloud-init Configuration in kvcloud

Once you have cloud-init enabled templates:

1. **Create Cloud-init Profile** in kvcloud:
   - Go to Cloud-init → Profiles
   - Click "Create Profile" or use the comprehensive builder
   - Configure user, SSH keys, packages, etc.

2. **Create VM with Cloud-init**:
   - Go to VMs → Create VM
   - Select your cloud-init template
   - In the "Cloud-init & Network" step:
     - Enable Cloud-init
     - Select your profile
     - Optionally enable auto IP assignment

3. **VM First Boot**:
   - Cloud-init will automatically configure the VM based on your profile
   - User account, SSH keys, network, packages will be set up
   - View configuration in Proxmox: VM → Cloud-Init tab

## Verifying Cloud-init in Proxmox

After applying cloud-init configuration, you should see it in Proxmox GUI:
1. Select the VM in Proxmox
2. Go to "Cloud-Init" tab
3. You'll see fields like:
   - User
   - Password
   - DNS domain
   - DNS servers
   - SSH public key
   - IP Config

## Troubleshooting

### Cloud-init tab is blank in Proxmox
This means the VM doesn't have a cloud-init drive. Add one:
```bash
qm set <VMID> --ide2 local:cloudinit
```

### Cloud-init not running on first boot
1. Verify the image is a cloud image (has cloud-init installed)
2. Check that ide2 drive is attached
3. View cloud-init logs in the VM:
```bash
sudo cloud-init status
sudo cat /var/log/cloud-init.log
```

### SSH keys not working
Make sure the SSH keys in your cloud-init profile are properly formatted:
- One key per line
- Full key including type (ssh-rsa, ssh-ed25519, etc.)
- No extra whitespace

## Template Best Practices

1. **Minimal Configuration**: Keep templates minimal, use cloud-init for customization
2. **Cloud-init Drive**: Always add cloud-init drive to templates
3. **Serial Console**: Add serial console for better debugging
4. **Template ID Range**: Use high VM IDs (9000-9999) for templates
5. **Naming Convention**: Use descriptive names like `debian-12-template`, `ubuntu-22-template`
6. **Regular Updates**: Periodically recreate templates with latest images

## Future Enhancements

Future versions of kvcloud will include:
- Built-in template downloader
- One-click Debian/Ubuntu template creation
- Template management interface
- Automatic template updates
