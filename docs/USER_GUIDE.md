# KVCloud User Guide

Welcome to KVCloud! This guide will help you get started with managing your virtual machines.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Managing Virtual Machines](#managing-virtual-machines)
4. [Snapshots](#snapshots)
5. [User Profile](#user-profile)
6. [Tips & Tricks](#tips--tricks)

---

## Getting Started

### Logging In

1. Navigate to the KVCloud URL provided by your administrator
2. Enter your **username** and **password**
3. Click **Login**

**Default Credentials** (first-time setup):
- Username: `admin`
- Password: `admin123` or `changeme`
- ⚠️ Change your password immediately after first login!

### Changing Your Password

1. Click your **profile icon** in the top right
2. Select **Profile**
3. Enter your current password and new password
4. Click **Save**

### User Interface Overview

The KVCloud interface consists of:

- **Sidebar Navigation**: Access different sections (Dashboard, VMs, Clusters, Users)
- **Top Bar**: Theme toggle, notifications, user menu
- **Breadcrumbs**: Navigate back through pages
- **Main Content Area**: Your current view

---

## Dashboard

The dashboard provides an at-a-glance view of your infrastructure.

### Dashboard Widgets

**VM Status**:
- Total VMs
- Running VMs (green)
- Stopped VMs (red)

**Cluster Health**:
- Total clusters
- Active nodes
- Cluster status

**Resource Usage**:
- CPU utilization across all VMs
- Memory consumption
- Disk space usage

**Quick Actions**:
- Create new VM
- View all VMs
- Manage clusters

### Refreshing Data

The dashboard auto-refreshes every 30 seconds. To manually refresh:
- Click the **refresh icon** in the top right of any widget

---

## Managing Virtual Machines

### Viewing Your VMs

1. Click **Virtual Machines** in the sidebar
2. Select a **node** from the dropdown
3. View list of VMs with:
   - VM ID
   - Name
   - Status (running/stopped)
   - CPU cores
   - Memory
   - Disk size
   - Uptime

### Creating a New VM

1. Click **Create VM** button
2. Follow the 4-step wizard:

**Step 1: Basic Settings**
- VM ID (must be unique)
- VM Name
- Select installation source (ISO or Template)

**Step 2: Resources**
- CPU Cores (1-128)
- Memory (MB)
- OS Type (Linux, Windows, Other)

**Step 3: Storage**
- Storage location
- Disk size (GB)

**Step 4: Network**
- Network bridge
- MAC address (auto or custom)

3. Review your settings
4. Click **Create VM**

### VM Operations

#### Starting a VM

1. Find your VM in the list
2. Click the **Play icon** (▶️) or **Start** button
3. Wait for status to change to "running"

#### Stopping a VM

1. Find your running VM
2. Click the **Stop icon** (⏹️) or **Stop** button
3. Confirm the action
4. VM will gracefully shut down

#### Restarting a VM

1. Click the **Restart icon** (🔄) or **Restart** button
2. Confirm the action
3. VM will restart

#### Viewing VM Details

1. Click on a **VM name** in the list
2. View detailed information:
   - Current status
   - Resource usage (CPU, memory, disk)
   - Configuration details
   - Network information

### Editing VM Configuration

1. Open **VM Details**
2. Click **Edit Configuration**
3. Modify:
   - VM Name
   - Description
   - CPU cores
   - Memory size
4. Click **Save**
5. ⚠️ Note: Some changes require VM restart

### Cloning a VM

1. Open **VM Details** or use the action menu
2. Click **Clone**
3. Enter:
   - New VM ID (must be unique)
   - New VM name
4. Choose clone type:
   - **Full Clone**: Independent copy
   - **Linked Clone**: Faster, uses less space
5. Click **Clone**
6. Wait for cloning to complete

### Deleting a VM

⚠️ **Warning**: This action cannot be undone!

1. Open **VM Details** or use the action menu
2. Click **Delete**
3. Confirm by typing the VM name
4. Click **Delete VM**

### Converting to Template

Templates allow rapid VM deployment.

1. Ensure VM is **stopped**
2. Open **VM Details**
3. Click **Convert to Template**
4. Confirm the action
5. ⚠️ Note: Templates cannot be started, only cloned

---

## Snapshots

Snapshots capture the current state of your VM for easy rollback.

### Creating a Snapshot

1. Open **VM Details**
2. Go to **Snapshots** tab
3. Click **Create Snapshot**
4. Enter:
   - Snapshot name (e.g., "before-update")
   - Description (optional)
5. Choose whether to include RAM state
6. Click **Create**

**Best Practices**:
- Create snapshots before major updates
- Use descriptive names
- Document what changed
- Don't rely on snapshots for backups

### Rolling Back to a Snapshot

1. Open **VM Details** → **Snapshots**
2. Find the snapshot you want to restore
3. Click **Rollback**
4. Confirm the action
5. ⚠️ Current VM state will be lost

### Deleting a Snapshot

1. Open **VM Details** → **Snapshots**
2. Find the snapshot to delete
3. Click **Delete**
4. Confirm the action

**Note**: Deleting snapshots frees up disk space.

---

## Monitoring

### Real-Time Monitoring

1. Open **VM Details**
2. Go to **Monitoring** tab
3. View live charts for:
   - CPU usage (%)
   - Memory usage (MB)
   - Network I/O
   - Disk I/O

Charts auto-refresh every 5 seconds.

### Resource Usage

**Understanding the Metrics**:

- **CPU**: Percentage of allocated cores being used
- **Memory**: RAM usage out of total allocated
- **Disk**: Storage used out of total allocated
- **Network**: Data in/out in bytes per second

**Warning Indicators**:
- 🟢 Green: Normal usage (<70%)
- 🟡 Yellow: High usage (70-90%)
- 🔴 Red: Critical usage (>90%)

---

## User Profile

### Viewing Your Profile

1. Click your **profile icon** (top right)
2. Select **Profile**
3. View your information:
   - Username
   - Email
   - Full name
   - Role

### Updating Your Information

1. Go to **Profile**
2. Click **Edit**
3. Update:
   - Email address
   - Full name
   - Password (requires current password)
4. Click **Save**

---

## Tips & Tricks

### Keyboard Shortcuts

- **Ctrl+K**: Quick search (coming soon)
- **Escape**: Close dialog/modal
- **F5**: Refresh current page

### Theme Toggle

Switch between light and dark themes:
1. Click the **sun/moon icon** in the top bar
2. Theme preference is saved automatically

### Filters and Search

**VM List**:
- Use the search box to filter by name or ID
- Sort by clicking column headers
- Filter by status using the dropdown

### Performance Tips

- Close unused tabs to reduce memory usage
- Refresh pages manually instead of auto-refresh for slower connections
- Use the light theme on low-powered devices

### Common Tasks

**Quickly Start Multiple VMs**:
1. Select checkboxes next to VMs
2. Use bulk actions menu
3. Choose "Start Selected"

**Find VM by Name**:
1. Use the search box in VM list
2. Type VM name or ID
3. Results filter automatically

**Monitor Resource Trends**:
1. Open VM Monitoring tab
2. Observe graphs over time
3. Adjust resources if needed

---

## Troubleshooting

### Cannot Login

**Problem**: Login fails with "Invalid credentials"

**Solutions**:
- Verify username and password (case-sensitive)
- Check Caps Lock is off
- Contact administrator to reset password
- Clear browser cache and cookies

### VM Won't Start

**Problem**: VM fails to start

**Solutions**:
- Check VM status in details page
- Verify node has available resources
- Check Proxmox server is online
- Contact administrator if issue persists

### Snapshot Failed

**Problem**: Cannot create snapshot

**Solutions**:
- Ensure VM has enough disk space
- Check storage is not full
- Verify VM is in a stable state
- Try stopping VM and retry

### Page Not Loading

**Problem**: Interface is slow or not loading

**Solutions**:
- Refresh the page (F5)
- Check internet connection
- Clear browser cache
- Try a different browser
- Contact administrator if server is down

---

## Getting Help

### Support Channels

- **Documentation**: Check [docs folder](../docs/) for detailed guides
- **Administrator**: Contact your system administrator
- **GitHub**: [Report issues](https://github.com/kumpeapps/kvcloud/issues)
- **Email**: support@kumpeapps.com

### Providing Feedback

We value your feedback! To suggest improvements:
1. Use the feedback form (coming soon)
2. Email suggestions to support@kumpeapps.com
3. Open a feature request on GitHub

### Training Resources

- **Video Tutorials**: [Coming soon]
- **Administrator Guide**: See [ADMIN_GUIDE.md](ADMIN_GUIDE.md)
- **API Documentation**: See [API.md](API.md)

---

## Best Practices

### VM Management

- ✅ Use meaningful VM names (e.g., "web-server-prod")
- ✅ Add descriptions to VMs for team clarity
- ✅ Tag VMs by purpose (production, development, testing)
- ✅ Shut down unused VMs to save resources
- ✅ Monitor resource usage regularly

### Snapshots

- ✅ Create snapshots before updates
- ✅ Use descriptive snapshot names with dates
- ✅ Delete old snapshots to free disk space
- ✅ Document snapshot purposes
- ❌ Don't rely solely on snapshots for backups

### Security

- ✅ Use strong passwords
- ✅ Change default passwords immediately
- ✅ Log out when finished
- ✅ Don't share credentials
- ✅ Report suspicious activity

### Resource Management

- ✅ Allocate resources based on actual need
- ✅ Monitor usage and adjust as needed
- ✅ Stop VMs when not in use
- ✅ Clean up old VMs and snapshots
- ✅ Request additional resources when needed

---

## Glossary

- **VM**: Virtual Machine - A software-based computer
- **Node**: Physical server running VMs
- **Cluster**: Group of nodes working together
- **Snapshot**: Point-in-time copy of VM state
- **Template**: Pre-configured VM image for cloning
- **ISO**: Installation disk image
- **Clone**: Copy of an existing VM
- **Proxmox**: Underlying virtualization platform

---

## FAQ

**Q: How many VMs can I create?**  
A: Depends on your permissions and available resources. Contact your administrator.

**Q: Can I access VM console?**  
A: Console access is coming in a future update. For now, use SSH or RDP.

**Q: What's the difference between Stop and Shutdown?**  
A: Both gracefully stop the VM. Use Stop for immediate shutdown.

**Q: Can I undo a VM deletion?**  
A: No, deletions are permanent. Always create snapshots before major changes.

**Q: How do I request more resources?**  
A: Contact your administrator to increase VM CPU/memory allocations.

**Q: Can I move a VM between nodes?**  
A: VM migration is coming in a future update.

**Q: How long are snapshots kept?**  
A: Snapshots persist until manually deleted. Clean up old ones regularly.

---

**Thank you for using KVCloud!** 🚀

For additional help, contact your administrator or visit our documentation.
