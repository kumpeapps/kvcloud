export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions: string[];
  created_at: string;
  updated_at?: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions?: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: string[];
}

export interface Permission {
  resource: string;
  action: string;
  description?: string;
}

export const AVAILABLE_PERMISSIONS: Permission[] = [
  // User permissions
  { resource: 'user', action: 'create', description: 'Create new users' },
  { resource: 'user', action: 'read', description: 'View user information' },
  { resource: 'user', action: 'update', description: 'Edit user details' },
  { resource: 'user', action: 'delete', description: 'Delete users' },
  
  // VM permissions
  { resource: 'vm', action: 'create', description: 'Create virtual machines' },
  { resource: 'vm', action: 'read', description: 'View virtual machines' },
  { resource: 'vm', action: 'update', description: 'Edit VM settings' },
  { resource: 'vm', action: 'delete', description: 'Delete virtual machines' },
  { resource: 'vm', action: 'start', description: 'Start VMs' },
  { resource: 'vm', action: 'stop', description: 'Stop VMs' },
  { resource: 'vm', action: 'restart', description: 'Restart VMs' },
  { resource: 'vm', action: 'pause', description: 'Pause VMs' },
  { resource: 'vm', action: 'resume', description: 'Resume VMs' },
  { resource: 'vm', action: 'shutdown', description: 'Shutdown VMs' },
  { resource: 'vm', action: 'reset', description: 'Reset VMs' },
  { resource: 'vm', action: 'clone', description: 'Clone VMs' },
  { resource: 'vm', action: 'lock', description: 'Lock VMs' },
  { resource: 'vm', action: 'unlock', description: 'Unlock VMs' },
  { resource: 'vm', action: 'console', description: 'Access VM console' },
  
  // Cluster & Node permissions
  { resource: 'cluster', action: 'create', description: 'Add clusters' },
  { resource: 'cluster', action: 'read', description: 'View clusters' },
  { resource: 'cluster', action: 'update', description: 'Edit cluster settings' },
  { resource: 'cluster', action: 'delete', description: 'Remove clusters' },
  { resource: 'node', action: 'read', description: 'View nodes' },
  
  // Storage & Disk permissions
  { resource: 'disk', action: 'read', description: 'View disks' },
  { resource: 'disk', action: 'create', description: 'Create disks' },
  { resource: 'disk', action: 'resize', description: 'Resize disks' },
  { resource: 'disk', action: 'delete', description: 'Delete disks' },
  
  // Network permissions
  { resource: 'network', action: 'read', description: 'View network interfaces' },
  { resource: 'network', action: 'create', description: 'Create network interfaces' },
  { resource: 'network', action: 'update', description: 'Edit network interfaces' },
  { resource: 'network', action: 'delete', description: 'Delete network interfaces' },
  
  // Snapshot permissions
  { resource: 'snapshot', action: 'read', description: 'View snapshots' },
  { resource: 'snapshot', action: 'create', description: 'Create snapshots' },
  { resource: 'snapshot', action: 'delete', description: 'Delete snapshots' },
  { resource: 'snapshot', action: 'rollback', description: 'Rollback snapshots' },
  
  // Backup permissions
  { resource: 'backup', action: 'read', description: 'View backups' },
  { resource: 'backup', action: 'create', description: 'Create backups' },
  { resource: 'backup', action: 'restore', description: 'Restore backups' },
  { resource: 'backup', action: 'delete', description: 'Delete backups' },
  
  // IP Pool permissions
  { resource: 'ippool', action: 'read', description: 'View IP pools' },
  { resource: 'ippool', action: 'allocate', description: 'Allocate IPs' },
  { resource: 'ippool', action: 'deallocate', description: 'Deallocate IPs' },
  
  // ISO permissions
  { resource: 'iso', action: 'read', description: 'View ISOs' },
  
  // Template permissions
  { resource: 'template', action: 'read', description: 'View templates' },
  { resource: 'template', action: 'create', description: 'Create templates' },
  
  // Firewall permissions
  { resource: 'firewall', action: 'read', description: 'View firewall rules' },
  { resource: 'firewall', action: 'create', description: 'Create firewall rules' },
  { resource: 'firewall', action: 'update', description: 'Edit firewall rules' },
  { resource: 'firewall', action: 'delete', description: 'Delete firewall rules' },
  
  // Cloud-init permissions
  { resource: 'cloud-init', action: 'read', description: 'View cloud-init profiles' },
  { resource: 'cloud-init', action: 'create', description: 'Create cloud-init profiles' },
  { resource: 'cloud-init', action: 'update', description: 'Edit cloud-init profiles' },
  { resource: 'cloud-init', action: 'delete', description: 'Delete cloud-init profiles' },
  
  // SSH key permissions
  { resource: 'ssh-key', action: 'read', description: 'View SSH keys' },
  { resource: 'ssh-key', action: 'create', description: 'Create SSH keys' },
  { resource: 'ssh-key', action: 'delete', description: 'Delete SSH keys' },
  
  // Metrics & Task permissions
  { resource: 'metrics', action: 'read', description: 'View metrics' },
  { resource: 'task', action: 'read', description: 'View background tasks' },
  
  // Agent permissions
  { resource: 'agent', action: 'read', description: 'View agent status' },
  { resource: 'agent', action: 'execute', description: 'Execute agent commands' },
  
  // Role permissions
  { resource: 'role', action: 'create', description: 'Create roles' },
  { resource: 'role', action: 'read', description: 'View roles' },
  { resource: 'role', action: 'update', description: 'Edit roles' },
  { resource: 'role', action: 'delete', description: 'Delete roles' },
];
