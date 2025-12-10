# Cloud-Init Intelligence Feature - User Guide

## Overview
The advanced cloud-init feature allows you to configure VMs with a simple, graphical interface instead of complex configuration files. All settings are stored and automatically applied when you initialize a VM.

---

## Step 1: Manage Your SSH Keys

### Access SSH Keys
Navigate to **SSH Keys** from the sidebar menu.

### Add an SSH Key
1. Click the **"Add SSH Key"** tab
2. Give your key a friendly name (e.g., "home-laptop", "work-desktop")
3. Paste your public SSH key (starts with `ssh-rsa`, `ssh-ed25519`, etc.)
4. Optionally add the fingerprint
5. Click **"Add SSH Key"**

### Generate SSH Keys (if needed)
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
# Copy the content of ~/.ssh/id_rsa.pub to the form above
```

### View All Keys
Click the **"My SSH Keys"** tab to see all your keys:
- **Status**: Active/Inactive toggle (disable keys you don't use)
- **Delete**: Remove keys you no longer need
- **Fingerprint**: See the key fingerprint for identification

---

## Step 2: Configure a VM's Cloud-Init

### Access Cloud-Init Configuration
1. Go to **Virtual Machines** → Select a VM → Click **"Configure Cloud-init"**
2. This opens a 4-step configuration wizard

### Step 1: Network Configuration
- **DHCP**: Toggle to automatically get IP from network
- **Static IP**: Manual IP, gateway, DNS settings
  - **IP Address**: VM's IP (e.g., 192.168.1.100)
  - **Gateway**: Network gateway (e.g., 192.168.1.1)
  - **DNS Servers**: Comma-separated (e.g., 8.8.8.8, 8.8.4.4)
  - **Hostname**: Optional (e.g., myvm)
  - **Domain Search**: Optional (e.g., example.com)

### Step 2: Root/Default User Setup
- **Username**: Default system user (ubuntu, admin, root, etc.)
- **Password**: Optional (leave empty for SSH-only access)
- **SSH Keys**: Select one or more of your SSH keys
- **Sudo Access**: Allow this user to run commands as root

### Step 3: Additional Users (Optional)
Create more user accounts on the VM:
- **Developers**: Create separate accounts for each team member
- **Services**: Create specific users for applications
- Each user gets their own SSH keys and access level

Example:
- User: `ubuntu` (default, with sudo)
- User: `deploy` (for deployments, with SSH key)
- User: `appuser` (for the application, limited permissions)

### Step 4: Review & Apply
- Review all settings
- Click **"Apply Configuration"**
- Configuration is saved to the system

---

## Step 3: Applying Configuration to VM

### When to Apply
After configuring cloud-init, you need to apply it to the VM:

1. Go to **Virtual Machines** → Select VM → Click **"Apply Cloud-init"**
2. This activates all the stored configuration
3. VM will be configured with:
   - Network settings (IP, DNS, gateway)
   - All user accounts (root + additional users)
   - SSH keys for each user
   - Sudo access levels

---

## Data Flow Diagram

```
┌─────────────────┐
│  SSH Key Store  │
│  (User Account) │
│  - home-laptop  │
│  - work-desktop │
└────────┬────────┘
         │
         │ (Selected in cloud-init config)
         │
┌────────▼─────────────┐
│ VM Cloud-Init Config │
│ - Root User          │
│ - Additional Users   │
│ - Network Settings   │
└────────┬─────────────┘
         │
         │ (Applied to VM)
         │
┌────────▼────────────┐
│   Running VM        │
│ - ubuntu @ SSH      │
│ - deploy @ SSH      │
│ - appuser @ SSH     │
│ - IP 192.168.1.100  │
└─────────────────────┘
```

---

## Features

✅ **No Technical Knowledge Required**
- Graphical wizard (not raw YAML)
- Simple form fields
- Clear step-by-step guidance

✅ **Flexible User Management**
- Unlimited SSH keys per account
- Multiple users per VM
- Per-user SSH key assignments

✅ **Smart Networking**
- IP pool integration
- Gateway/DNS from pool (customizable)
- Support for DHCP or static IP

✅ **Secure by Default**
- SSH key authentication (no passwords)
- Per-user sudo control
- Full audit trail

---

## Common Scenarios

### Scenario 1: Single User (Default)
1. Create SSH key: "my-key"
2. Configure VM:
   - Username: ubuntu
   - SSH Keys: my-key
   - Sudo: Yes
3. Result: SSH in as ubuntu without password

### Scenario 2: Team Access
1. Create SSH keys: "john-laptop", "jane-laptop"
2. Configure VM:
   - Root User: ubuntu (both SSH keys)
   - Additional User: admin (john-laptop only)
   - Additional User: viewer (jane-laptop only)
3. Result: john @ SSH admin, jane @ SSH viewer

### Scenario 3: Application Deployment
1. Create SSH keys: "deploy-key", "admin-key"
2. Configure VM:
   - Root User: ubuntu (admin-key, sudo)
   - Additional User: deploy (deploy-key, no sudo)
   - Additional User: appuser (no SSH, app runs as this user)
3. Result: Secure separation of concerns

---

## Troubleshooting

**"SSH key not showing up"**
- Make sure key is marked as Active
- Check key format (must be OpenSSH)

**"Network not working after apply"**
- Verify IP is not already in use
- Check gateway matches your network
- Ensure VM is running

**"Can't SSH to VM"**
- Verify SSH keys were configured
- Check VM is running (`Start` button)
- Verify network connectivity
- SSH keys must have correct permissions (600)

---

## What's Happening Behind the Scenes

When you click **"Apply Cloud-init"**, the system:

1. **Reads stored configuration** from the database
2. **Builds cloud-init script** with all users and settings
3. **Injects it into VM** via Proxmox cloud-init drive
4. **VM boots** and executes the script
5. **Users and networking** are automatically configured

No manual configuration needed!
