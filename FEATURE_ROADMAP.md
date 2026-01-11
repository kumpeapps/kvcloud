# KVCloud Feature Roadmap
**Goal:** Match Virtualizor feature parity for Proxmox-based VM management

**Project Context:**
- Backend: FastAPI + SQLAlchemy (async) + Proxmoxer
- Frontend: Angular 17 (standalone) + Material Design
- Virtualization: Proxmox VE (KVM/LXC)
- Reference: Virtualizor features + installed instance at /root

---

## ✅ Completed Features

### Core Infrastructure
- [x] User authentication (JWT tokens)
- [x] Cluster management (add/edit/delete clusters)
- [x] Node management (add/edit/delete Proxmox nodes)
- [x] VM listing (filtered by user permissions)
- [x] VM assignment system (user ownership tracking)
- [x] Dashboard with cluster/node/VM stats
- [x] Settings page with password change

### VM Operations
- [x] List VMs per node
- [x] Get VM status
- [x] Start/Stop/Restart VM
- [x] Create VM (basic)
- [x] Delete VM
- [x] Update VM config (cores/memory/name)

### Backup Operations (December 20, 2025)
- [x] Create VM backups with configurable modes (snapshot/suspend/stop)
- [x] List backups with filtering (node/VM/storage)
- [x] Restore from backups to any VM ID
- [x] Delete backups
- [x] Compression options (zstd/gzip/lzo/none)
- [x] RBAC permissions (create/read/restore/delete)
- [x] Frontend backup management UI with dialogs
- [x] Backend API endpoints (/backups/*)
- [x] ProxmoxService backup methods

### VM Templates & Cloning (December 20, 2025)
- [x] List templates by node
- [x] Convert VM to template
- [x] Clone from templates (full/linked clone)
- [x] Clone from VMs
- [x] Templates page with grid view
- [x] Clone dialog with validation
- [x] Storage and description options
- [x] Navigation menu integration

### Real-time VM Monitoring (December 20, 2025)
- [x] VM statistics endpoint (CPU%, Memory%, Disk%)
- [x] Real-time charts with 5-second polling
- [x] 3 live charts: CPU, Memory, Disk usage
- [x] Stats summary cards with current values
- [x] 20 data point rolling window (100s history)
- [x] Network I/O data included in stats
- [x] Uptime and core count display
- [x] Chart.js integration with proper scaling
- [x] Refresh button for manual updates

---

## 🚧 In Progress / Recently Completed

### Audit Logs & Task Queue ✅ COMPLETED (January 11, 2026)
- [x] AuditLog model with comprehensive tracking (user, action, resource, timestamp, IP, status)
- [x] Audit middleware for automatic API request logging
- [x] `/audit-logs` GET endpoint with filtering (user, action, date, resource)
- [x] Task model for long-running operation tracking (status, progress, timing, results)
- [x] `/tasks` and `/tasks/{task_id}` GET endpoints for task status
- [x] Task history endpoint: `GET /tasks/history`
- [x] Frontend AuditLogsComponent with Material table and filtering
- [x] Frontend TasksQueueComponent with real-time status and progress
- [x] Navigation integration with task badge showing active count
- [x] Role-based access control (audit-logs admin-only, tasks visible to user)
- [x] Task completion notifications (toast alerts)
- [x] Database migration for tasks table with proper indexes
- **Status**: ✅ FEATURE COMPLETE AND TESTED
- Files:
  - Backend: `backend/app/models/task.py`, `backend/app/core/audit_middleware.py`, `backend/app/api/audit_logs.py`, `backend/app/api/tasks.py`
  - Frontend: `frontend/src/app/features/audit-logs/`, `frontend/src/app/features/tasks/`
  - Database: `backend/alembic/versions/c1d2e3f4g5h6_add_task_table.py`
  - Documentation: Updated in ADMIN_GUIDE.md

### RBAC & Permissions ✅ COMPLETED (January 11, 2026)
- [x] Casbin enforcer initialization and dependency injection
- [x] `@require_permission` decorator for API endpoints
- [x] RBAC policy expansion (67+ rules, 3 default roles)
- [x] Role management endpoints (CRUD with custom permissions)
- [x] `/auth/permissions` endpoint for frontend
- [x] Frontend permission directive (`*hasPermission`)
- [x] Frontend route guards (`permissionGuard`)
- [x] AuthService permission fetching and caching
- [x] Permission matrix (admin, user, viewer roles)
- [x] API enforcement with proper error responses (403 Forbidden)
- [x] Role create/edit/delete dialogs with permission selection
- [x] 77+ available permissions across 18 resources
- [x] Comprehensive admin documentation
- **Status**: ✅ FEATURE COMPLETE AND TESTED
- Files: 
  - Backend: `backend/app/core/dependencies.py`, `backend/app/core/rbac_policy.csv`, `backend/app/api/roles.py`, `backend/app/api/auth.py`
  - Frontend: `frontend/src/app/core/services/auth.service.ts`, `frontend/src/app/features/roles/`, `frontend/src/app/core/directives/has-permission.directive.ts`
  - Documentation: `docs/ADMIN_GUIDE.md` (RBAC section expanded)

### VNC Console ✅ COMPLETED (January 10, 2026)
- [x] noVNC library integration (CDN/ESM)
- [x] WebSocket proxy infrastructure with FastAPI
- [x] Frontend component with error handling and fullscreen support
- [x] Authentication flow (Proxmox ticket + PVEAuthCookie)
- [x] Bidirectional WebSocket proxying through backend
- [x] Mouse capture/release on fullscreen toggle
- [x] Responsive scaling and viewport sizing
- [x] Real-time VM console access via browser
- **Status**: Feature complete and working
- Files: `backend/app/api/vnc_proxy.py`, `frontend/src/app/features/vms/vm-console/`

### API Parity
- [ ] **Complete VM lifecycle endpoints**
- [ ] **ISO management endpoints**
- [ ] **Snapshot management endpoints**

### Cloud Commercial Features (New)
- [x] Cloud License Plans (overall quotas, self-approval)
- [x] VPS Plans with per-VM limits
- [x] IP Groups and ISO Groups assignable to plans
- [x] VM Requests (cart + checkout) with admin approval and fulfillment
- [x] Cloud-init profiles and apply endpoint
- [x] Recipes model and storage
- [ ] Frontend UI for plans, requests, approvals
- [ ] Quota calculation UI and enforcement summaries

---

## 📋 Feature Backlog (Organized by Category)

### 1. VM Management & Lifecycle (HIGH PRIORITY)

#### 1.1 VM Operations ✅ COMPLETED (Dec 20, 2025)
- [x] **Pause/Resume VM**
  - API: `POST /vms/node/{node_id}/vm/{vmid}/pause`
  - API: `POST /vms/node/{node_id}/vm/{vmid}/resume`
  - UI: Buttons in VM detail/list actions

- [x] **Reset VM**
  - API: `POST /vms/node/{node_id}/vm/{vmid}/reset`
  - Hard reset (force restart)

- [x] **Shutdown VM (graceful)**
  - API: `POST /vms/node/{node_id}/vm/{vmid}/shutdown`
  - Graceful shutdown vs stop (force)

- [ ] **Suspend/Unsuspend VM** (Future)
  - API: `POST /vms/node/{node_id}/vm/{vmid}/suspend`
  - For billing/quota enforcement

- [x] **Power off VM**
  - API: `POST /vms/node/{node_id}/vm/{vmid}/stop` (hard power off)
  - UI: Power Off (Hard) action in VM detail operations

#### 1.2 VM Console Access ✅ COMPLETED (January 10, 2026)
- [x] **VNC Console Integration** - DONE
  - [x] API: VNC ticket generation with Proxmox authentication
  - [x] Frontend: noVNC library integration (CDN)
  - [x] WebSocket proxy with bidirectional data forwarding
  - [x] URL-encoded ticket handling for special characters
  - [x] Frontend component with fullscreen, scaling, mouse capture/release
  - [x] Angular dev proxy configuration for WebSocket upgrade
  - [x] Complete authentication flow (ticket + cookie headers)
  - **Status**: Fully functional console access via browser
  - Files: `backend/app/api/vnc_proxy.py`, `frontend/src/app/features/vms/vm-console/`

- [ ] **SSH Terminal (optional)**
  - Web-based SSH terminal
  - Files: `frontend/src/app/features/vms/terminal/`
  - Reference: `/root/enduser/terminal.php`

#### 1.3 VM Configuration
- [x] **Disk Management** ✅ COMPLETED (Dec 20, 2025)
  - List attached disks with full config
  - Add disk with storage, size, interface, cache options
  - Resize disk (add space)
  - Delete disk from VM
  - API: GET/POST/PUT/DELETE `/vms/node/{node_id}/vm/{vmid}/disks`
  - UI: Complete disk management component in VM detail

- [x] **Network Interface Management** ✅ COMPLETED (Dec 20, 2025)
  - List NICs with full config
  - Add NIC with bridge/VLAN/firewall/rate limit
  - Edit NIC settings
  - Delete NIC
  - Auto MAC generation
  - API: GET/POST/PUT/DELETE `/vms/node/{node_id}/vm/{vmid}/network-interfaces`
  - UI: Complete network management component in VM detail

- [x] **Boot Order Configuration**
  - Set boot device priority (disk/cdrom/network/floppy)
  - API: `PUT /vms/node/{node_id}/vm/{vmid}/boot`
  - UI: Boot Order dialog with drag-and-drop ordering and enable/disable toggles from VM detail

- [ ] **CPU/Memory Hot-plug**
  - Change resources without reboot (if supported)

#### 1.4 VM Templates & Cloning ✅ COMPLETED (Dec 20, 2025)
- [x] **Template Management** - DONE
  - [x] List templates: `GET /vms/node/{node_id}/templates`
  - [x] Create template from VM: `POST /vms/node/{node_id}/vm/{vmid}/template`
  - [x] UI: Templates page with grid view showing CPU/Memory/Disk
  - [x] Node selector for filtering templates
  - Files: `frontend/src/app/features/templates/`

- [x] **Cloning Workflow** - DONE
  - [x] Clone VM dialog with full form validation
  - [x] Full clone vs linked clone selection
  - [x] Storage and description options
  - [x] Suggested VMID (source + 1000)
  - [x] Works for both VMs and templates
  - [x] Enhanced API endpoint with JSON body
  - Files: `frontend/src/app/features/templates/clone-vm-dialog/`

- [ ] **Future Enhancements**
  - [ ] Delete template functionality
  - [ ] Edit template metadata
  - [ ] Clone status tracking/progress bar

### 2. Snapshots & Backups (HIGH PRIORITY)

#### 2.1 Snapshots ✅ COMPLETED (Dec 20, 2025)
- [x] **Snapshot CRUD**
  - List snapshots: `GET /snapshots/nodes/{node_id}/vms/{vmid}`
  - Create snapshot: `POST /snapshots/nodes/{node_id}/vms/{vmid}`
  - Delete snapshot: `DELETE /snapshots/nodes/{node_id}/vms/{vmid}/{snapname}`
  - Rollback to snapshot: `POST /snapshots/nodes/{node_id}/vms/{vmid}/{snapname}/rollback`
  - UI: Complete snapshots component in VM detail page
  - Files: `frontend/src/app/features/vms/vm-snapshots/`, `frontend/src/app/features/snapshots/`

- [ ] **Snapshot Scheduling**
  - Schedule automatic snapshots (cron-based)
  - Model: `snapshot_schedules` table
  - API: `/vms/node/{node_id}/vm/{vmid}/snapshot-schedules`
  - Retention policies (keep last N snapshots)

#### 2.2 Backups
- [x] **Backup System - Basic Operations** ✅ COMPLETED (Dec 20, 2025)
  - [x] API: `POST /backups/node/{node_id}/vm/{vmid}` (create)
  - [x] API: `GET /backups/node/{node_id}/vm/{vmid}` (list)
  - [x] API: `POST /backups/node/{node_id}/restore` (restore)
  - [x] API: `DELETE /backups/node/{node_id}` (delete)
  - [x] Backup modes: snapshot, suspend, stop
  - [x] Compression: zstd, gzip, lzo, none
  - [x] RBAC permissions integrated
  - [x] Frontend UI components (list, create dialog, restore dialog)
  - Files: `backend/app/api/backups.py`, `frontend/src/app/features/backups/`

- [ ] **Backup Plans (Advanced)**
  - Model: `backup_plans` table
  - Schedule backups (daily/weekly/monthly)
  - Rotation policies
  - Email notifications on completion/failure
  - UI: Backup plans page
  - Reference: `/root/admin/backup_plans.php`

- [ ] **Backup Servers**
  - Model: `backup_servers` table
  - Remote backup destinations (FTP/S3/local)
  - API: `/backup-servers` (CRUD)
  - Reference: `/root/virtualizor.sql` - `backup_servers` table

- [ ] **Backup Dashboard**
  - View all backups across VMs
  - Filter by status/date/VM
  - Restore workflow
  - Reference: `/root/admin/backup_dashboard.php`

### 3. Storage Management (MEDIUM PRIORITY)

#### 3.1 Storage Operations
- [ ] **Storage List**
  - API: `GET /vms/node/{node_id}/storages` (already exists)
  - UI: Storage page showing all storages per node
  - Display: name, type, content types, usage, status

- [ ] **Add Storage**
  - API: `POST /nodes/{node_id}/storages`
  - Types: LVM, ZFS, Directory, NFS, Ceph, iSCSI
  - UI: Add storage wizard
  - Reference: `/root/admin/addstorage.php`

- [ ] **Storage Usage Stats**
  - Per-storage usage graphs
  - Alert on low space
  - Reference: `/root/admin/storageusage.php`

### 4. Network Management (MEDIUM PRIORITY)

#### 4.1 Network Configuration
- [ ] **Bridge Management**
  - List bridges per node
  - Add/edit bridge configuration
  - VLAN support
  - API: `/nodes/{node_id}/network/bridges`

- [ ] **Firewall Management**
  - VM-level firewall rules
  - Model: `firewall_rules` table
  - API: `/vms/node/{node_id}/vm/{vmid}/firewall`
  - UI: Firewall tab in VM detail
  - Reference: `/root/virtualizor.sql` - `firewall_plans`, `/root/scripts/update_vpsfirewall.php`

- [ ] **Firewall Plans/Templates**
  - Predefined rule sets
  - Apply to multiple VMs
  - Reference: `/root/admin/addfirewall_plan.php`

### 5. IP Address Management ✅ COMPLETED (Dec 20, 2025)

#### 5.1 IP Pools
- [x] **IP Pool Management**
  - Models: `ippool`, `ip_addresses`, `ip_logs` tables
  - API: `/ippools` (full CRUD)
  - API: `/ippools/{pool_id}/ips` (list IPs in pool)
  - Assign/release IP to/from VM
  - IP status: free, allocated
  - UI: Complete IP pools management page
  - Files: `frontend/src/app/features/ippools/`

- [ ] **IPv6 Support**
  - IPv6 pools
  - IPv6 assignment
  - Dual-stack VMs

- [ ] **IP Routing**
  - NAT vs routed IPs
  - Configure per VM

### 6. ISO Management ✅ COMPLETED (Dec 20, 2025)

#### 6.1 ISO Operations
- [x] **ISO List by Storage**
  - API: `GET /isos/nodes/{node_id}`
  - UI: Complete ISO library page with table view
  - Display: name, size, storage, format
  - Files: `frontend/src/app/features/isos/`

- [x] **Upload ISO from URL**
  - API: `POST /isos/upload`
  - UI: Upload dialog with URL input and storage selection
  - Task ID tracking for progress
  - Background job monitoring

- [x] **Delete ISO**
  - API: Implemented in ISO endpoints
  - Confirmation dialog in UI

- [ ] **ISO Groups/Media Groups**
  - Model: `media_groups` table
  - Organize ISOs by category
  - Reference: `/root/virtualizor.sql` - `media_groups` table
  - Reference: `/root/admin/addmg.php`

- [ ] **Mount/Unmount ISO to VM**
  - API: `POST /vms/node/{node_id}/vm/{vmid}/cdrom`
  - Change boot CD-ROM
  - Eject CD-ROM

### 7. Monitoring & Statistics (HIGH PRIORITY)

#### 7.1 Real-time Monitoring ✅ COMPLETE
- [x] **VM Statistics** (December 20, 2025)
  - CPU usage (live with charts)
  - Memory usage (live with charts)
  - Disk usage (live with charts)
  - Network I/O (data available)
  - API: `GET /vms/node/{node_id}/vm/{vmid}/stats`
  - Poll interval: 5 seconds
  - UI: VM monitoring tab with 3 live charts + stats cards
  - Library: Chart.js / ng2-charts
  - Uptime and core count display

- [x] **Node Statistics** ✅ COMPLETED (Dec 20, 2025)
  - Comprehensive node health metrics
  - CPU usage/count, memory used/total/percent
  - Storage usage, VM counts (total/running/stopped)
  - Proxmox version, kernel, uptime, load average
  - API: `GET /clusters/nodes/{node_id}/stats`
  - Ready for dashboard integration

- [ ] **Historical Data (RRD)**
  - Longer timeframes (hourly/daily/weekly)
  - Store historical metrics in database
  - API: `GET /vms/node/{node_id}/vm/{vmid}/stats/history?range=24h`

- [ ] **Bandwidth Monitoring**
  - Track network usage per VM
  - Monthly bandwidth quotas
  - Alert on quota exceeded
  - Model: `bandwidth` table
  - Reference: `/root/virtualizor.sql` - `bandwidth` table
  - Reference: `/root/scripts/calculate_bandwidth.php`

#### 7.2 Logs & Audit Trail
- [ ] **Audit Logs**
  - Model: `audit_logs` table (user_id, action, resource_type, resource_id, timestamp, ip_address, details)
  - Log all user actions (create/delete/start/stop VMs, etc.)
  - API: `GET /logs/audit` (filterable by user/action/date)
  - UI: Logs page with filters
  - Reference: `/root/virtualizor.sql` - `logs_admin`, `logs_login`, `logs_vps` tables

- [ ] **VM Event Logs**
  - Per-VM action history
  - API: `GET /vms/node/{node_id}/vm/{vmid}/logs`
  - Show: start/stop times, config changes, errors

- [ ] **Task Queue & Status**
  - Model: `tasks` table
  - Track long-running operations (clones, backups, migrations)
  - API: `GET /tasks` (list), `GET /tasks/{task_id}` (status)
  - UI: Tasks page showing progress
  - WebSocket updates for live progress
  - Reference: `/root/admin/tasks.php`

### 8. User & Role Management (HIGH PRIORITY)

#### 8.1 User Management
- [ ] **User CRUD (Admin)**
  - Create/edit/delete users
  - Set user quotas
  - Suspend/unsuspend users
  - API: Already exists in `/backend/app/api/users.py`
  - UI: Users management page (already exists)
  - Assign VMs to users
  - Reference: `/root/admin/adduser.php`

#### 8.2 Roles & Permissions
- [ ] **Role Management UI**
  - Model: `role` table (already exists)
  - API: Already exists in `/backend/app/api/roles.py`
  - UI: Roles page (create/edit/delete roles)
  - Permission matrix: resource (vm/node/cluster) × action (create/read/update/delete/start/stop)
  - Files: `frontend/src/app/features/roles/role-editor/`

- [ ] **Admin ACL**
  - Fine-grained admin permissions
  - Model: `admin_acl` table
  - Restrict admin access to specific nodes/clusters
  - Reference: `/root/virtualizor.sql` - `admin_acl` table

#### 8.3 Reseller/Tenant Isolation
- [ ] **Reseller Role**
  - Model: Add `is_reseller` flag to User
  - Resellers manage sub-users
  - Tenant-scoped resource view
  - Cannot see other resellers' resources
  - API filtering: check user.parent_id hierarchy

- [ ] **Resource Quotas**
  - Model: `user_quotas` table (user_id, max_vms, max_cpu, max_ram, max_disk, max_bandwidth)
  - Enforce at VM creation
  - Display quota usage in dashboard
  - API: `GET /users/{user_id}/quotas`
  - Reference: `/root/virtualizor.sql` - `plans` table (resource limits)

### 9. Plans & Pricing (MEDIUM PRIORITY)

#### 9.1 VM Plans
- [ ] **Plan Management**
  - Model: `plans` table (name, cpu, ram, disk, bandwidth, price, etc.)
  - API: `/plans` (CRUD)
  - Assign plan to user
  - VM creation from plan template
  - Reference: `/root/virtualizor.sql` - `plans`, `user_plans` tables
  - Reference: `/root/admin/addplan.php`

- [ ] **Resource Pricing**
  - Model: `pricing` table
  - Per-resource costs (CPU/RAM/disk/bandwidth)
  - Hourly billing calculation
  - Reference: `/root/virtualizor.sql` - `pricing`, `resource_pricing` tables
  - Reference: `/root/admin/billing.php`

#### 9.2 Billing Integration (OPTIONAL)
- [ ] **Billing System**
  - Model: `invoices`, `transactions` tables
  - Generate invoices
  - Payment tracking
  - Integration with payment gateways (Stripe/PayPal)
  - Reference: `/root/virtualizor.sql` - `invoices`, `transactions` tables
  - Reference: `/root/scripts/billing.php`

### 10. High Availability & Migration (MEDIUM PRIORITY)

#### 10.1 VM Migration
- [ ] **Live Migration**
  - API: `POST /vms/node/{node_id}/vm/{vmid}/migrate`
  - Target node selection
  - Online vs offline migration
  - Status tracking
  - Reference: `/root/scripts/migrate.php`, `/root/scripts/migrate2_master.php`

- [ ] **HA Configuration**
  - Model: `ha_config` table
  - Enable HA for VM
  - Failover policies
  - API: `/vms/node/{node_id}/vm/{vmid}/ha`
  - Reference: `/root/scripts/proxmox_ha.php`, `/root/scripts/hascript.php`

- [ ] **HA Monitoring**
  - Detect node failures
  - Automatic VM restart on healthy node
  - Reference: `/root/scripts/installha_master.php`

### 11. OS Templates & Provisioning (MEDIUM PRIORITY)

#### 11.1 OS Templates
- [ ] **Template Library**
  - Model: `os` table (name, filename, distro, type, size, description)
  - Model: `os_distros` table (distro categories)
  - API: `GET /os-templates` (list available)
  - API: `POST /os-templates` (upload/add)
  - UI: OS template library page
  - Reference: `/root/virtualizor.sql` - `os`, `os_distros` tables
  - Reference: Virtualizor OS Templates: https://www.virtualizor.com/ostemplates/

- [ ] **OS Reinstall**
  - API: `POST /vms/node/{node_id}/vm/{vmid}/reinstall`
  - Select new OS from templates
  - Preserve data disk option
  - Reference: `/root/virtualizor.sql` - `osreinstall` table

#### 11.2 Recipes (Post-Install Scripts)
- [ ] **Recipe Management**
  - Model: `recipes` table (name, code, description, shell type)
  - Execute scripts after VM creation/reinstall
  - API: `/recipes` (CRUD)
  - UI: Recipe editor with code highlighting
  - Reference: `/root/virtualizor.sql` - `recipes` table
  - Reference: `/root/admin/addrecipe.php`

### 12. DNS Management (LOW PRIORITY)

#### 12.1 PowerDNS Integration
- [ ] **DNS Zone Management**
  - Model: `pdns` table
  - Create/edit DNS zones
  - Add/edit DNS records
  - API: `/dns` (CRUD)
  - Reference: `/root/virtualizor.sql` - `pdns` table
  - Reference: `/root/admin/addpdns.php`

- [ ] **DNS Plans**
  - Model: `dnsplans` table
  - Predefined DNS record sets
  - Reference: `/root/admin/adddnsplan.php`

- [ ] **Reverse DNS**
  - Set PTR records for IPs
  - API: `POST /ips/{ip_id}/rdns`
  - UI: RDNS field in IP management
  - Reference: `/root/admin/rdns.php`

### 13. Security & Authentication (HIGH PRIORITY)

#### 13.1 Two-Factor Authentication
- [ ] **2FA Implementation**
  - Model: Add `two_factor_secret`, `two_factor_enabled` to User
  - TOTP support (Google Authenticator, Authy)
  - API: `POST /auth/2fa/enable`, `POST /auth/2fa/verify`
  - UI: Settings page 2FA section
  - QR code generation
  - Backup codes
  - Reference: `/root/admin/twofactauth.php`

#### 13.2 SSH Key Management
- [ ] **SSH Keys**
  - Model: `ssh_keys` table (user_id, name, public_key)
  - API: `/ssh-keys` (CRUD)
  - Inject into VMs on creation
  - UI: Settings page SSH keys section
  - Reference: `/root/virtualizor.sql` - `server_sshkeys` table

#### 13.3 API Credentials
- [ ] **API Key Management**
  - Model: `api_credentials` table (user_id, api_key, api_secret, permissions, expires_at)
  - Generate API keys for users
  - API: `/api-credentials` (CRUD)
  - UI: Settings page API section
  - Reference: `/root/virtualizor.sql` - `api` table
  - Reference: `/root/admin/api_credential.php`

- [ ] **API Logging**
  - Model: `api_log` table
  - Log all API requests
  - Rate limiting
  - Reference: `/root/virtualizor.sql` - `api_log` table

### 14. Notifications & Alerts (MEDIUM PRIORITY)

#### 14.1 Notification System
- [ ] **Notification Model**
  - Model: `notifications` table (user_id, type, title, message, read, created_at)
  - API: `/notifications` (list/mark read)
  - UI: Notification bell in header
  - WebSocket for real-time notifications
  - Reference: `/root/virtualizor.sql` - `notifications` table

- [ ] **Email Templates**
  - Model: `email_templates` table
  - Customizable email templates
  - Send on: VM created, backup complete, quota exceeded, etc.
  - API: `/email-templates` (CRUD)
  - Reference: `/root/virtualizor.sql` - `email_templates` table

- [ ] **User Notices**
  - Model: `admin_notes`, `user_notice` tables
  - Admin announcements
  - Display on user dashboard
  - Reference: `/root/admin/adminnotes.php`, `/root/admin/add_user_notice.php`

### 15. Advanced Features (LOW PRIORITY)

#### 15.1 Load Balancer
- [ ] **HAProxy Integration**
  - Model: `load_balancer`, `haproxy` tables
  - Configure load balancers
  - SSL certificate management
  - Reference: `/root/virtualizor.sql` - `load_balancer`, `haproxy`, `lb_ssl_certs` tables

#### 15.2 Cloud Init Support
- [ ] **Cloud Init Configuration**
  - Set hostname, SSH keys, network config
  - Custom user-data scripts
  - API: `POST /vms/node/{node_id}/vm/{vmid}/cloudinit`

#### 15.3 Container Support (LXC)
- [ ] **LXC Container Management**
  - Create/manage LXC containers (Proxmox supports both KVM and LXC)
  - Lighter weight alternative to VMs

#### 15.4 Volume Management
- [ ] **Volume/Disk Operations**
  - Model: `volumes` table
  - Create standalone volumes
  - Attach to VMs
  - Reference: `/root/virtualizor.sql` - `volumes` table
  - Reference: `/root/admin/volumes.php`

#### 15.5 Passthrough Devices
- [ ] **PCI Passthrough**
  - Model: `passthrough` table
  - GPU/USB passthrough to VMs
  - Reference: `/root/virtualizor.sql` - `passthrough` table
  - Reference: `/root/admin/addpassthrough.php`

#### 15.6 SMART Device Monitoring
- [ ] **Disk Health Monitoring**
  - Track SMART data for physical disks
  - Alert on disk failures
  - Reference: `/root/scripts/smart_device_cron.php`

#### 15.7 Service Management
- [ ] **Service Control**
  - Start/stop/restart Proxmox services
  - Reference: `/root/admin/restartservices.php`, `/root/admin/services.php`

### 16. Multi-Language Support (LOW PRIORITY)

- [ ] **Internationalization (i18n)**
  - Use Angular i18n
  - Support multiple languages
  - Language files: `frontend/src/locale/`
  - Reference: `/root/scripts/create_languages.php`

### 17. Misc Features

#### 17.1 Server Management
- [ ] **Server Information**
  - CPU info, model, cores
  - RAM details
  - Disk RAID status
  - API: `GET /nodes/{node_id}/info`
  - Reference: `/root/admin/serverinfo.php`, `/root/admin/cpu.php`, `/root/admin/ram.php`, `/root/admin/raid.php`

- [ ] **Server Groups**
  - Model: `servergroups` table
  - Group nodes for organization
  - Reference: `/root/admin/servergroups.php`

#### 17.2 Updates & Maintenance
- [ ] **System Updates**
  - Check for KVCloud updates
  - One-click update mechanism
  - Reference: `/root/admin/updates.php`

- [ ] **Database Backup/Restore**
  - Export/import KVCloud database
  - Reference: `/root/scripts/db_restore.php`

#### 17.3 Support Access
- [ ] **Support Login**
  - Temporary access for support team
  - Time-limited, audited
  - Reference: `/root/admin/support_access.php`

#### 17.4 CSF Integration
- [ ] **ConfigServer Firewall**
  - Manage CSF settings
  - Reference: `/root/admin/csf.php`

---

## 🎯 Implementation Priority Order

### Phase 1: Foundation (Weeks 1-2)
1. ✅ RBAC enforcement (Casbin)
2. ✅ Frontend RBAC guards
3. IP Pool Management
4. ISO Management UI
5. Monitoring dashboards

### Phase 2: Core Operations (Weeks 3-4)
6. Snapshots UI
7. Backups system
8. VM console (VNC)
9. Disk management
10. Network interface management

### Phase 3: Advanced Features (Weeks 5-6)
11. Templates & cloning UI
12. Audit logs
13. Role management UI
14. Quotas enforcement
15. Task queue & status

### Phase 4: User Experience (Weeks 7-8)
16. Notifications system
17. Two-factor authentication
18. SSH key management
19. API credentials
20. User notices

### Phase 5: Enterprise Features (Weeks 9-10)
21. HA & migration
22. Plans & pricing
23. Reseller isolation
24. Firewall management
25. Load balancer

### Phase 6: Polish & Extras (Weeks 11-12)
26. DNS management
27. OS templates
28. Recipes
29. Volume management
30. Remaining misc features

---

## 📊 Progress Tracking

**Overall Completion:** 8/150+ features (~5%)

**By Category:**
- Core Infrastructure: 7/10 (70%)
- VM Management: 8/35 (23%)
- Storage: 1/5 (20%)
- Network: 0/8 (0%)
- IP Management: 0/6 (0%)
- ISO: 2/6 (33%)
- Monitoring: 1/10 (10%)
- Users/Roles: 4/12 (33%)
- Snapshots/Backups: 4/15 (27%)
- Security: 1/8 (13%)
- Notifications: 0/5 (0%)
- HA/Migration: 0/6 (0%)
- Misc: 0/24 (0%)

---

## 🔄 Session Notes

### Session 1 (Complete)
- Implemented VM assignment system
- Added user-scoped VM listings
- Created feature roadmap document
- Analyzed Virtualizor database schema and feature set

### Session 2 (Current)
- Focus: RBAC enforcement (Casbin middleware + frontend guards)
- IP Pool Management: finalize DB schema and CRUD API contract
- ISO Management UI: hook upload/list/delete flows and progress states

#### Session 2 Checklist
- [x] Backend: apply `@require_permission` on VM/ISO/IP endpoints
- [x] Policy storage: migrate Casbin policies to DB adapter and seed default roles
- [x] Frontend: role guard integration on routes + action buttons
- [x] IP Pools: ERD review (`ippool`, `ips`, `ip_logs`) and migration draft
- [x] IP Pools API: design request/response shapes for CRUD + assign/release
- [x] ISO UI: wire existing endpoints with optimistic UI + error toasts
- [x] QA: smoke-test RBAC denial paths and IP/ISO flows

#### Session 2 Deliverables
- RBAC: Casbin DB adapter configured; default admin/user/viewer/reseller roles seeded; VM/ISO/IP endpoints protected; negative-path tests passing. ✅
- Frontend: route guard + button-level checks shipped; menus/actions gated by permissions; smoke coverage for denial paths. ✅
- IP Pools: ERD + initial Alembic draft ready for review; CRUD/assign/release contracts documented; handler skeletons stubbed. ✅
- ISO UI: list/upload/delete wired with progress + error toasts; basic e2e smoke script executed. ✅

#### Session 2 Work Plan
- Day 1: Backend RBAC — hook Casbin DB adapter, seed default policies, wrap VM/ISO/IP endpoints with `@require_permission`; add denial-path tests.
- Day 2: Frontend — route guards + action-level permission checks; hide/disable UI controls based on permissions; add smoke tests.
- Day 3: IP Pools — finalize ERD + Alembic draft; design API contracts; start handlers; wire ISO UI list/upload/delete with progress + error toasts; run end-to-end smoke.

#### Session 2 Deliverables
- RBAC: Casbin DB adapter configured; default admin/user/viewer/reseller roles seeded; VM/ISO/IP endpoints protected; negative-path tests passing.
- Frontend: route guard + button-level checks shipped; menus/actions gated by permissions; smoke coverage for denial paths.
- IP Pools: ERD + initial Alembic draft ready for review; CRUD/assign/release contracts documented; handler skeletons stubbed.
- ISO UI: list/upload/delete wired with progress + error toasts; basic e2e smoke script executed.

### Session 3 (Planned)
- Finish IP Pools backend (migrations + CRUD/assign/release handlers + tests)
- IP Pools frontend table/forms; assign/release flows
- Monitoring dashboards: start VM stats tab with polling + charts
- Prep for Snapshot UI: align API responses and UI contracts

#### Session 3 Checklist
- [ ] IP Pools: finalize migrations (`ippool`, `ips`, `ip_logs`) and apply
- [ ] IP Pools API: implement CRUD + assign/release + validation + tests
- [ ] Frontend IP Pools: tables/forms with validation; assign/release UX
- [ ] VM Stats: backend endpoint contract locked; frontend tab with polling + charts stubbed
- [ ] Snapshots UI: confirm API payloads, draft component structure

### Session 4 (Planned)
- Ship Snapshots UI end-to-end (list/create/delete/rollback)
- Backups: model + CRUD + restore flow (backend focus)
- VM Console: VNC endpoint + frontend noVNC shell
- Monitoring: wire real data into VM stats charts with polling/backoff

#### Session 4 Checklist
- [ ] Snapshots UI: component + routing + service; connect existing snapshot endpoints; add optimistic updates + error toasts
- [ ] Backups DB: create `backups`, `backup_plans`, `backup_servers` migrations
- [ ] Backups API: create/list/delete/restore endpoints; start restore status polling contract
- [ ] Backups Tests: unit + API smoke for happy/denial paths
- [ ] VNC: expose `/vms/node/{node_id}/vm/{vmid}/vnc` endpoint; add noVNC component scaffold and basic connect/disconnect UI
- [ ] VM Stats: enable real polling with retry/backoff; chart rendering and loading/empty/error states

### Session 5 (Planned)
- Backups UI polish: restore flows, history table, status badges
- Task Queue: model + API + minimal UI for long-running ops
- Role Management UI: permission matrix editor + seed defaults
- Quotas: model + enforcement on VM create/resize; basic UI display

#### Session 5 Checklist
- [ ] Backups UI: list/detail/restore with progress + toasts; link to tasks for long ops
- [ ] Task Queue: create `tasks` table + API (`list`, `status`); wire backups/snapshots to tasks; polling contract
- [ ] Role Editor: matrix UI for resources/actions; integrate with Casbin policies; validation + save flows
- [ ] Quotas: add `user_quotas` migration; enforce in VM create/update; surface quota usage in dashboard/settings
- [ ] Tests: quota denial paths; role save/validation; task lifecycle

### Session 6 (Planned)
- Firewall: models + APIs + UI editor; apply to VM/network flows
- Notifications: model + API + websocket push; UI bell + list/read
- Security: 2FA + SSH keys + API credentials (models/APIs/UI wiring)
- Monitoring: node stats view; bandwidth tracking start

#### Session 6 Checklist
- [ ] Firewall: `firewall_rules`/`firewall_plans` migrations; CRUD APIs; VM tab UI; apply rules on VM actions
- [ ] Notifications: `notifications` + `email_templates` migrations; list/mark-read API; websocket broadcast; header bell UI
- [ ] 2FA: add user columns, enable/verify endpoints, QR/backup codes; frontend settings flow
- [ ] SSH Keys: `ssh_keys` migration; CRUD API; inject on VM create; frontend settings UI
- [ ] API Credentials: `api_credentials` migration; CRUD + regenerate endpoints; settings UI
- [ ] Bandwidth: `bandwidth` migration; basic tracking endpoint; surface in monitoring tab
- [ ] Tests: firewall rule application, notification delivery, 2FA happy/denial paths, SSH key/API key CRUD

### Session 7 (Planned)
- Migration: models + APIs for HA enablement and VM migrate flows
- Plans & Pricing: plans/pricing models, CRUD, and basic UI; tie to VM create
- Reseller Isolation: user hierarchy + scoped filtering; reseller dashboards
- ISO/Template polish: media groups + template metadata management

#### Session 7 Checklist
- [ ] Migration: migrate endpoint with status tracking; UI wizard with target node selection; task integration
- [ ] Plans/Pricing: `plans`, `user_plans`, `pricing` migrations; CRUD APIs; assign plan on VM creation; UI forms
- [ ] Reseller: add `is_reseller` + `parent_id`; enforce tenant scoping in queries; reseller dashboard view
- [ ] ISO/Template Polish: `media_groups` migration; API for grouping; UI grouping/filtering; template metadata edit/delete
- [ ] Tests: migration success/failure paths; plan enforcement on create; reseller scoping denial paths; template/media group CRUD

---

## 📝 Development Notes

### Database Tables Needed (from Virtualizor analysis)
- `vm_assignments` ✅ (created)
- `ippool`, `ips`, `ip_logs`
- `backups`, `backup_plans`, `backup_servers`
- `snapshot_schedules`
- `firewall_rules`, `firewall_plans`
- `bandwidth`
- `audit_logs`
- `tasks`
- `user_quotas`
- `plans`, `user_plans`, `pricing`
- `ha_config`
- `os`, `os_distros`, `recipes`
- `pdns`, `dnsplans`
- `notifications`, `email_templates`, `admin_notes`, `user_notice`
- `ssh_keys`, `api_credentials`, `api_log`
- `media_groups`
- `load_balancer`, `haproxy`, `lb_ssl_certs`
- `volumes`, `passthrough`, `servergroups`

### Key Proxmox API Endpoints to Leverage
- `/nodes/{node}/qemu/{vmid}/status/*` - VM control
- `/nodes/{node}/qemu/{vmid}/snapshot/*` - Snapshots
- `/nodes/{node}/qemu/{vmid}/firewall/*` - Firewall
- `/nodes/{node}/storage/*` - Storage management
- `/nodes/{node}/network/*` - Network config
- `/pools/*` - Resource pools
- `/cluster/ha/*` - HA management

### Frontend Components to Build
- VNC Console Component
- Real-time Stats Charts
- Snapshot Manager
- Backup Manager
- Firewall Rule Editor
- IP Pool Manager
- Role Permission Matrix
- Task Queue Monitor
- Notification Center

---

## 🎨 UI/UX Considerations

1. **Dashboard Redesign**
   - Add more widgets (top VMs, alerts, quick actions)
   - Real-time resource usage graphs
   - Recent activity feed

2. **VM Detail Tabs**
   - Overview (status, resources)
   - Console (VNC)
   - Statistics (charts)
   - Snapshots
   - Backups
   - Network (NICs, IPs, firewall)
   - Disks
   - Settings (config)
   - Logs (events)

3. **Wizard Improvements**
   - VM Creation Wizard (multi-step)
   - Clone Wizard
   - Backup Wizard
   - Migration Wizard

4. **Mobile Responsiveness**
   - Optimize for tablets/phones
   - Touch-friendly controls

---

## 🐛 Known Issues & Technical Debt

1. Node deletion bug: Fixed (was passing wrong node due to mat-table signal binding)
2. Frontend caching issues: Need cache-busting or better dev server config
3. Auth token expiration: Need automatic logout on 401 (partially fixed)
4. RBAC not enforced: Need Casbin integration across all endpoints
5. No VM ownership filtering yet: Partially fixed (list filtered, but actions not checked)

---

## 🔗 External References

- Virtualizor Features: https://www.virtualizor.com/features/
- Virtualizor Docs: https://www.virtualizor.com/docs/
- Virtualizor OS Templates: https://www.virtualizor.com/ostemplates/
- Proxmox API: https://pve.proxmox.com/pve-docs/api-viewer/
- Proxmoxer Python Library: https://github.com/proxmoxer/proxmoxer
- Casbin: https://casbin.org/docs/overview
- noVNC: https://github.com/novnc/noVNC

---

*Last Updated: December 19, 2025*
*Document maintained across development sessions*
