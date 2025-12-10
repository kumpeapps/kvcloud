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
  { resource: 'user', action: 'create', description: 'Create new users' },
  { resource: 'user', action: 'read', description: 'View user information' },
  { resource: 'user', action: 'update', description: 'Edit user details' },
  { resource: 'user', action: 'delete', description: 'Delete users' },
  { resource: 'vm', action: 'create', description: 'Create virtual machines' },
  { resource: 'vm', action: 'read', description: 'View virtual machines' },
  { resource: 'vm', action: 'update', description: 'Edit VM settings' },
  { resource: 'vm', action: 'delete', description: 'Delete virtual machines' },
  { resource: 'vm', action: 'start', description: 'Start VMs' },
  { resource: 'vm', action: 'stop', description: 'Stop VMs' },
  { resource: 'vm', action: 'restart', description: 'Restart VMs' },
  { resource: 'cluster', action: 'create', description: 'Add clusters' },
  { resource: 'cluster', action: 'read', description: 'View clusters' },
  { resource: 'cluster', action: 'update', description: 'Edit cluster settings' },
  { resource: 'cluster', action: 'delete', description: 'Remove clusters' },
  { resource: 'role', action: 'create', description: 'Create roles' },
  { resource: 'role', action: 'read', description: 'View roles' },
  { resource: 'role', action: 'update', description: 'Edit roles' },
  { resource: 'role', action: 'delete', description: 'Delete roles' },
];
