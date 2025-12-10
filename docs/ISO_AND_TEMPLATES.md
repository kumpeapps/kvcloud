# ISO and Template Management in KVCloud

## Overview
KVCloud now supports automatic VM ID generation, ISO management, and Proxmox template cloning to provide a Virtualizor-like experience.

## Features

### 1. Auto-Generated VM IDs
- **No manual input required**: VM IDs are automatically fetched from Proxmox
- **Smart allocation**: Uses Proxmox's `cluster.nextid.get()` API for proper ID management
- **Fallback logic**: If API fails, finds the highest existing VMID and increments
- **Range**: Starts from 100 by default, respects Proxmox constraints

### 2. ISO Management

#### Uploading ISOs
You can upload ISO images to Proxmox storage in two ways:

**Option 1: Direct Upload to Proxmox**
1. SSH into your Proxmox node
2. Navigate to ISO storage: `cd /var/lib/vz/template/iso/`
3. Download ISO: `wget https://example.com/os.iso`
4. ISO will appear in KVCloud automatically

**Option 2: Using KVCloud API**
```bash
POST /api/vms/node/{node_id}/upload-iso
{
  "storage": "local",
  "filename": "ubuntu-22.04.iso",
  "url": "https://releases.ubuntu.com/22.04/ubuntu-22.04-server-amd64.iso"
}
```

The API will trigger Proxmox to download the ISO directly to the specified storage.

#### Using ISOs in VM Creation
1. Select your Proxmox node
2. Choose "Use ISO" option
3. Select from available ISOs in the dropdown
4. ISO will be attached to the VM's virtual CD drive

### 3. Template Support

#### Creating Templates in Proxmox
1. Create and configure a VM with your desired OS and settings
2. Install and configure all necessary software
3. Clean the VM (remove logs, SSH keys, etc.)
4. Right-click the VM in Proxmox → "Convert to Template"
5. Template will appear in KVCloud's template list

#### Using Templates in KVCloud
1. In VM creation form, select your node
2. Enable "Use Template" option
3. Select a template from the dropdown
4. KVCloud will clone the template with your specified settings
5. New VM will be created with:
   - Auto-generated VM ID
   - Your custom name
   - Template's disk and configuration
   - Your specified resources (CPU, RAM adjustments)

#### Built-in Proxmox Templates
Proxmox supports container templates (LXC) and VM templates:

**VM Templates (KVM/QEMU)**:
- Cloud-init enabled images
- Custom templates you create
- Imported from various sources

**Container Templates (LXC)** - Not yet supported in KVCloud:
- Alpine Linux
- Ubuntu
- Debian
- CentOS
- Fedora
- And many more...

> **Note**: KVCloud currently focuses on VM (QEMU) templates. LXC container support may be added in the future.

### 4. VM Creation Workflow

#### Quick Create (Auto-Everything)
```bash
POST /api/vms/node/{node_id}/create
{
  "name": "my-server",
  "template_id": 100,
  // VM ID auto-generated
  // Uses template's disk and config
}
```

#### Custom Create from ISO
```bash
POST /api/vms/node/{node_id}/create
{
  "name": "custom-vm",
  "cores": 4,
  "memory": 8192,
  "disk_size": 100,
  "storage": "local-lvm",
  "iso": "ubuntu-22.04.iso",
  // VM ID auto-generated
}
```

#### Clone Existing VM
```bash
POST /api/vms/node/{node_id}/create
{
  "name": "cloned-vm",
  "clone_from": 105,
  // VM ID auto-generated
  // Inherits config from source VM
}
```

## API Endpoints

### Get Next Available VM ID
```http
GET /api/vms/node/{node_id}/nextid
Response: { "nextid": 103 }
```

### List Available ISOs
```http
GET /api/vms/node/{node_id}/isos
Response: { "isos": ["ubuntu-22.04.iso", "debian-12.iso"] }
```

### List Templates
```http
GET /api/vms/node/{node_id}/templates
Response: { "templates": [{ "vmid": 100, "name": "ubuntu-template", ... }] }
```

### Upload ISO
```http
POST /api/vms/node/{node_id}/upload-iso
Body: {
  "storage": "local",
  "filename": "os.iso",
  "url": "https://example.com/os.iso"
}
```

## Best Practices

### Template Creation
1. **Start with minimal install**: Less bloat, faster clones
2. **Install cloud-init**: Enables automatic configuration
3. **Clean before templating**:
   ```bash
   # In VM before converting to template
   apt-get clean
   rm -rf /tmp/*
   rm -rf /var/tmp/*
   history -c
   > /var/log/wtmp
   > /var/log/btmp
   ```
4. **Document template contents**: Keep notes on installed software

### ISO Management
1. **Use ISO storage**: Store ISOs in dedicated ISO storage (not the same as VM disks)
2. **Clean up old ISOs**: Remove unused ISOs to save space
3. **Verify checksums**: Always verify ISO integrity before use
4. **Standard names**: Use descriptive names like `ubuntu-22.04-server.iso`

### VM Creation
1. **Let auto-ID work**: Don't specify VMID unless you have a specific reason
2. **Use templates when possible**: Faster deployment and consistency
3. **Clone for quick tests**: Clone existing VMs for testing instead of creating from scratch
4. **Resource planning**: Plan your CPU/RAM allocation before creation

## Comparison with Virtualizor

| Feature | KVCloud | Virtualizor |
|---------|---------|-------------|
| Auto VM ID | ✅ Yes | ✅ Yes |
| ISO Upload | ✅ Yes | ✅ Yes |
| Template Cloning | ✅ Yes | ✅ Yes |
| Built-in Templates | ⚠️ Uses Proxmox | ✅ Own library |
| LXC Containers | ❌ Not yet | ✅ Yes |
| Cloud-init | ✅ Via Proxmox | ✅ Yes |
| API-driven | ✅ Yes | ✅ Yes |

## Troubleshooting

### "Failed to get next VMID"
- **Cause**: Cannot connect to Proxmox API
- **Solution**: Check node connectivity, verify credentials

### "Template not found"
- **Cause**: Template was deleted or moved
- **Solution**: Refresh template list, verify template exists in Proxmox

### "ISO not available"
- **Cause**: ISO not in expected storage location
- **Solution**: Check storage configuration, verify ISO uploaded correctly

### "VM ID already exists"
- **Cause**: Race condition or manual ID conflict
- **Solution**: Auto-generation should handle this, but you can manually specify a different ID

## Future Enhancements

Planned features:
- [ ] LXC container support
- [ ] Template library/marketplace
- [ ] ISO verification (checksum validation)
- [ ] Direct file upload (not just URL)
- [ ] Template versioning
- [ ] Automated template updates

## See Also
- [Proxmox Template Documentation](https://pve.proxmox.com/wiki/VM_Templates_and_Clones)
- [Cloud-init Guide](https://cloudinit.readthedocs.io/)
- [KVCloud User Guide](USER_GUIDE.md)
- [KVCloud API Documentation](API.md)
