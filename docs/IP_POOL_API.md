# IP Pool Management - API Documentation

## Overview
The IP Pool API provides complete CRUD operations for managing IP address pools and individual IP allocations for virtual machines.

## Database Schema

### Tables

#### `ip_pools`
Main pool configuration table.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique pool identifier |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Pool name |
| gateway | VARCHAR(45) | NOT NULL | Gateway IP address (IPv4/IPv6) |
| netmask | VARCHAR(45) | NOT NULL | Netmask (e.g., 255.255.255.0 or /24) |
| first_ip | VARCHAR(45) | NOT NULL | First IP in range |
| last_ip | VARCHAR(45) | NOT NULL | Last IP in range |
| bridge | VARCHAR(50) | NOT NULL, DEFAULT 'vmbr0' | Proxmox bridge name |
| vlan_tag | INTEGER | NULLABLE | Optional VLAN tag |
| name_servers | VARCHAR(255) | NULLABLE | Comma-separated DNS servers |
| is_active | BOOLEAN | DEFAULT TRUE | Pool active status |
| routing_prefix | VARCHAR(50) | NULLABLE | IPv6 routing prefix |
| description | TEXT | NULLABLE | Pool description |
| created_at | DATETIME | DEFAULT NOW() | Creation timestamp |
| updated_at | DATETIME | ON UPDATE NOW() | Last update timestamp |

#### `ip_addresses`
Individual IP address records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique IP record ID |
| pool_id | INTEGER | FK → ip_pools.id, CASCADE | Parent pool |
| ip_address | VARCHAR(45) | UNIQUE, NOT NULL | IP address |
| is_allocated | BOOLEAN | DEFAULT FALSE | Allocation status |
| vm_id | INTEGER | NULLABLE | Assigned VM ID |
| user_id | INTEGER | FK → users.id, SET NULL | Assigned user |
| hostname | VARCHAR(255) | NULLABLE | Hostname |
| mac_address | VARCHAR(17) | NULLABLE | MAC address |
| allocated_at | DATETIME | NULLABLE | Allocation timestamp |
| notes | TEXT | NULLABLE | Additional notes |
| created_at | DATETIME | DEFAULT NOW() | Creation timestamp |

#### `ip_logs`
Audit trail for IP operations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Log entry ID |
| ip_address | VARCHAR(45) | NOT NULL, INDEXED | IP address |
| pool_id | INTEGER | FK → ip_pools.id, CASCADE | Pool reference |
| user_id | INTEGER | FK → users.id, SET NULL | User who performed action |
| vm_id | INTEGER | NULLABLE | Related VM ID |
| action | VARCHAR(20) | NOT NULL | Action type (allocated/deallocated) |
| notes | TEXT | NULLABLE | Action notes |
| created_at | DATETIME | DEFAULT NOW() | Action timestamp |

## API Endpoints

### List IP Pools
**GET** `/api/ippools/`

**Permission Required:** `ippool:read`

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "name": "Production Pool",
    "gateway": "192.168.1.1",
    "netmask": "255.255.255.0",
    "first_ip": "192.168.1.10",
    "last_ip": "192.168.1.250",
    "bridge": "vmbr0",
    "vlan_tag": null,
    "name_servers": "8.8.8.8,8.8.4.4",
    "is_active": true,
    "routing_prefix": null,
    "description": "Main production IP pool",
    "total_ips": 241,
    "allocated_ips": 15,
    "available_ips": 226,
    "created_at": "2025-12-19T00:00:00Z"
  }
]
```

---

### Create IP Pool
**POST** `/api/ippools/`

**Permission Required:** `ippool:create`

**Request Body:**
```json
{
  "name": "Production Pool",
  "gateway": "192.168.1.1",
  "netmask": "255.255.255.0",
  "first_ip": "192.168.1.10",
  "last_ip": "192.168.1.250",
  "bridge": "vmbr0",
  "vlan_tag": null,
  "name_servers": "8.8.8.8,8.8.4.4",
  "routing_prefix": null,
  "description": "Main production IP pool"
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "Production Pool",
  "total_ips": 241,
  "allocated_ips": 0,
  "available_ips": 241,
  "created_at": "2025-12-19T00:00:00Z"
}
```

**Validation:**
- `first_ip` and `last_ip` must be valid IP addresses
- `first_ip` must be ≤ `last_ip`
- IP range limited to 10,000 addresses
- Pool name must be unique

**Errors:**
- `400` - Invalid IP format, range too large, or duplicate name
- `403` - Insufficient permissions

---

### List IPs in Pool
**GET** `/api/ippools/{pool_id}/ips`

**Permission Required:** `ippool:read`

**Query Parameters:**
- `allocated_only` (boolean, optional): Filter to only allocated IPs

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "pool_id": 1,
    "ip_address": "192.168.1.10",
    "is_allocated": true,
    "vm_id": 100,
    "user_id": 1,
    "hostname": "web-server-01",
    "mac_address": "00:16:3e:5a:2b:1c",
    "allocated_at": "2025-12-19T10:30:00Z",
    "notes": "Production web server"
  },
  {
    "id": 2,
    "pool_id": 1,
    "ip_address": "192.168.1.11",
    "is_allocated": false,
    "vm_id": null,
    "user_id": null,
    "hostname": null,
    "mac_address": null,
    "allocated_at": null,
    "notes": null
  }
]
```

---

### Allocate IP Address
**POST** `/api/ippools/{pool_id}/allocate`

**Permission Required:** `ippool:allocate`

**Request Body:**
```json
{
  "ip_address": "192.168.1.10",
  "vm_id": 100,
  "hostname": "web-server-01",
  "mac_address": "00:16:3e:5a:2b:1c",
  "notes": "Production web server"
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "pool_id": 1,
  "ip_address": "192.168.1.10",
  "is_allocated": true,
  "vm_id": 100,
  "user_id": 1,
  "hostname": "web-server-01",
  "mac_address": "00:16:3e:5a:2b:1c",
  "allocated_at": "2025-12-19T10:30:00Z",
  "notes": "Production web server"
}
```

**Side Effects:**
- Creates audit log entry in `ip_logs` table
- Sets `allocated_at` to current timestamp
- Sets `user_id` to current authenticated user

**Errors:**
- `404` - IP address not found or already allocated
- `403` - Insufficient permissions

---

### Deallocate IP Address
**POST** `/api/ippools/{pool_id}/deallocate/{ip_id}`

**Permission Required:** `ippool:deallocate`

**Response:** `200 OK`
```json
{
  "message": "IP address deallocated successfully"
}
```

**Side Effects:**
- Creates audit log entry in `ip_logs` table
- Resets `is_allocated` to false
- Clears `vm_id`, `hostname`, `mac_address`, `allocated_at`, `notes`

**Errors:**
- `404` - IP not found in pool
- `400` - IP not currently allocated
- `403` - Insufficient permissions

---

### Delete IP Pool
**DELETE** `/api/ippools/{pool_id}`

**Permission Required:** `ippool:delete`

**Response:** `200 OK`
```json
{
  "message": "IP pool deleted successfully"
}
```

**Validation:**
- Pool must have no allocated IPs
- All IP addresses in pool are cascade deleted

**Errors:**
- `404` - Pool not found
- `400` - Pool has allocated IPs
- `403` - Insufficient permissions

---

## Usage Examples

### Workflow: Create and Use IP Pool

1. **Create Pool**
```bash
POST /api/ippools/
{
  "name": "DMZ Network",
  "gateway": "10.0.10.1",
  "netmask": "255.255.255.0",
  "first_ip": "10.0.10.10",
  "last_ip": "10.0.10.100",
  "bridge": "vmbr1",
  "vlan_tag": 10,
  "name_servers": "1.1.1.1,1.0.0.1"
}
```

2. **List Available IPs**
```bash
GET /api/ippools/1/ips?allocated_only=false
```

3. **Allocate IP to VM**
```bash
POST /api/ippools/1/allocate
{
  "ip_address": "10.0.10.10",
  "vm_id": 200,
  "hostname": "firewall-01"
}
```

4. **Later: Deallocate IP**
```bash
POST /api/ippools/1/deallocate/1
```

5. **Clean Up: Delete Pool (when all IPs deallocated)**
```bash
DELETE /api/ippools/1
```

---

## Integration with VM Creation

When creating a VM, the system can automatically allocate an IP:

1. Client requests available IPs: `GET /api/ippools/{pool_id}/ips?allocated_only=false`
2. Client selects IP and creates VM
3. On successful VM creation, allocate IP: `POST /api/ippools/{pool_id}/allocate`
4. On VM deletion, deallocate IP: `POST /api/ippools/{pool_id}/deallocate/{ip_id}`

---

## Security & Permissions

| Role | Permissions |
|------|-------------|
| **admin** | Full access (create, read, update, delete pools & IPs) |
| **user** | Read pools, allocate/deallocate IPs |
| **viewer** | Read-only access to pools and IPs |
| **reseller** | Read pools, allocate/deallocate IPs |

All endpoints require authentication via JWT token in `Authorization: Bearer <token>` header.
