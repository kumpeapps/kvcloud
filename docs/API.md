# KVCloud API Reference

Complete API documentation for KVCloud RESTful API.

**Base URL**: `http://localhost:8000` (development) or `https://yourdomain.com/api` (production)

**API Version**: v1

---

## Table of Contents

1. [Authentication](#authentication)
2. [Users](#users)
3. [Roles](#roles)
4. [Clusters](#clusters)
5. [Virtual Machines](#virtual-machines)
6. [Snapshots](#snapshots)
7. [Dashboard](#dashboard)
8. [Error Handling](#error-handling)

---

## Authentication

All endpoints except `/auth/token` and `/auth/register` require JWT authentication.

### Login

**Endpoint**: `POST /auth/token`

**Request Body** (form data):
```
username=admin&password=admin123
```

**Response**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Example**:
```bash
curl -X POST http://localhost:8000/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123"
```

### Register

**Endpoint**: `POST /auth/register`

**Request Body**:
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securepassword",
  "full_name": "John Doe"
}
```

**Response**: `201 Created`
```json
{
  "id": 2,
  "username": "newuser",
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "is_superuser": false
}
```

### Get Current User

**Endpoint**: `GET /auth/me`

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.com",
  "full_name": "Administrator",
  "is_active": true,
  "is_superuser": true
}
```

---

## Users

### List Users

**Endpoint**: `GET /users/`

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:
- `skip` (int, optional): Number of records to skip (default: 0)
- `limit` (int, optional): Maximum records to return (default: 100)

**Response**: `200 OK`
```json
[
  {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "Administrator",
    "is_active": true,
    "is_superuser": true
  },
  {
    "id": 2,
    "username": "user1",
    "email": "user1@example.com",
    "full_name": "User One",
    "is_active": true,
    "is_superuser": false
  }
]
```

### Get User

**Endpoint**: `GET /users/{user_id}`

**Headers**: `Authorization: Bearer <token>`

**Response**: `200 OK`
```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.com",
  "full_name": "Administrator",
  "is_active": true,
  "is_superuser": true
}
```

### Create User

**Endpoint**: `POST /users/`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `user:create`

**Request Body**:
```json
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "securepassword",
  "full_name": "New User",
  "is_active": true,
  "is_superuser": false
}
```

**Response**: `201 Created`
```json
{
  "id": 3,
  "username": "newuser",
  "email": "newuser@example.com",
  "full_name": "New User",
  "is_active": true,
  "is_superuser": false
}
```

### Update User

**Endpoint**: `PUT /users/{user_id}`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `user:update`

**Request Body**:
```json
{
  "email": "updated@example.com",
  "full_name": "Updated Name",
  "is_active": true
}
```

**Response**: `200 OK`

### Delete User

**Endpoint**: `DELETE /users/{user_id}`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `user:delete`

**Response**: `204 No Content`

---

## Roles

### List Roles

**Endpoint**: `GET /roles/`

**Headers**: `Authorization: Bearer <token>`

**Response**: `200 OK`
```json
[
  {
    "id": 1,
    "name": "admin",
    "description": "Administrator with full access",
    "permissions": ["*:*"]
  },
  {
    "id": 2,
    "name": "user",
    "description": "Standard user",
    "permissions": ["vm:read", "vm:create", "vm:start", "vm:stop"]
  }
]
```

### Create Role

**Endpoint**: `POST /roles/`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `role:create`

**Request Body**:
```json
{
  "name": "operator",
  "description": "VM operator",
  "permissions": ["vm:*", "cluster:read"]
}
```

**Response**: `201 Created`

### Update Role

**Endpoint**: `PUT /roles/{role_id}`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `role:update`

**Request Body**:
```json
{
  "name": "operator",
  "description": "Updated description",
  "permissions": ["vm:*", "cluster:read", "user:read"]
}
```

**Response**: `200 OK`

### Delete Role

**Endpoint**: `DELETE /roles/{role_id}`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `role:delete`

**Response**: `204 No Content`

---

## Clusters

### List Clusters

**Endpoint**: `GET /clusters/`

**Headers**: `Authorization: Bearer <token>`

**Response**: `200 OK`
```json
[
  {
    "id": 1,
    "name": "Production Cluster",
    "host": "proxmox.example.com",
    "port": 8006,
    "verify_ssl": false,
    "is_active": true
  }
]
```

### Create Cluster

**Endpoint**: `POST /clusters/`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `cluster:create`

**Request Body**:
```json
{
  "name": "Production Cluster",
  "host": "proxmox.example.com",
  "port": 8006,
  "username": "root@pam",
  "password": "secure_password",
  "verify_ssl": false
}
```

**Response**: `201 Created`
```json
{
  "id": 1,
  "name": "Production Cluster",
  "host": "proxmox.example.com",
  "port": 8006,
  "verify_ssl": false,
  "is_active": true
}
```

### Get Cluster Nodes

**Endpoint**: `GET /clusters/{cluster_id}/nodes`

**Headers**: `Authorization: Bearer <token>`

**Response**: `200 OK`
```json
[
  {
    "id": 1,
    "cluster_id": 1,
    "name": "pve-node-1",
    "host": "192.168.1.100",
    "status": "online",
    "cpu_usage": 25.5,
    "memory_usage": 45.2
  }
]
```

### Add Node to Cluster

**Endpoint**: `POST /clusters/nodes`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `cluster:create`

**Request Body**:
```json
{
  "cluster_id": 1,
  "name": "pve-node-2",
  "host": "192.168.1.101"
}
```

**Response**: `201 Created`

---

## Virtual Machines

### List VMs on Node

**Endpoint**: `GET /vms/node/{node_id}`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:read`

**Response**: `200 OK`
```json
[
  {
    "vmid": 100,
    "name": "web-server",
    "status": "running",
    "cpu": 2,
    "maxcpu": 4,
    "mem": 2147483648,
    "maxmem": 4294967296,
    "disk": 32212254720,
    "maxdisk": 107374182400,
    "uptime": 86400
  }
]
```

### Get VM Status

**Endpoint**: `GET /vms/node/{node_id}/vm/{vmid}/status`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:read`

**Response**: `200 OK`
```json
{
  "vmid": 100,
  "name": "web-server",
  "status": "running",
  "cpu": 0.25,
  "mem": 2147483648,
  "maxmem": 4294967296,
  "disk": 32212254720,
  "maxdisk": 107374182400,
  "uptime": 86400,
  "netin": 1048576000,
  "netout": 524288000
}
```

### Create VM

**Endpoint**: `POST /vms/node/{node_id}`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:create`

**Request Body**:
```json
{
  "vmid": 101,
  "name": "new-vm",
  "cores": 2,
  "memory": 2048,
  "disk_size": 32,
  "storage": "local-lvm",
  "network_bridge": "vmbr0",
  "os_type": "l26",
  "iso": "local:iso/ubuntu-22.04.iso",
  "start_on_boot": false
}
```

**Response**: `201 Created`
```json
{
  "vmid": 101,
  "status": "created",
  "message": "VM created successfully"
}
```

### Start VM

**Endpoint**: `POST /vms/node/{node_id}/vm/{vmid}/start`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:start`

**Response**: `200 OK`
```json
{
  "vmid": 100,
  "status": "starting",
  "message": "VM start initiated"
}
```

### Stop VM

**Endpoint**: `POST /vms/node/{node_id}/vm/{vmid}/stop`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:stop`

**Response**: `200 OK`
```json
{
  "vmid": 100,
  "status": "stopping",
  "message": "VM stop initiated"
}
```

### Restart VM

**Endpoint**: `POST /vms/node/{node_id}/vm/{vmid}/restart`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:restart`

**Response**: `200 OK`

### Update VM Configuration

**Endpoint**: `PUT /vms/node/{node_id}/vm/{vmid}/config`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:update`

**Request Body**:
```json
{
  "name": "updated-vm-name",
  "description": "Updated description",
  "cores": 4,
  "memory": 4096
}
```

**Response**: `200 OK`

### Clone VM

**Endpoint**: `POST /vms/node/{node_id}/vm/{vmid}/clone`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:create`

**Request Body**:
```json
{
  "newid": 102,
  "name": "cloned-vm",
  "full": true
}
```

**Response**: `200 OK`

### Convert VM to Template

**Endpoint**: `POST /vms/node/{node_id}/vm/{vmid}/template`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:update`

**Response**: `200 OK`

### Delete VM

**Endpoint**: `DELETE /vms/node/{node_id}/vm/{vmid}`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:delete`

**Response**: `204 No Content`

---

## Snapshots

### List Snapshots

**Endpoint**: `GET /vms/node/{node_id}/vm/{vmid}/snapshots`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:read`

**Response**: `200 OK`
```json
[
  {
    "name": "snapshot-2025-12-16",
    "description": "Before system update",
    "snaptime": 1702742400,
    "vmstate": 0
  }
]
```

### Create Snapshot

**Endpoint**: `POST /vms/node/{node_id}/vm/{vmid}/snapshots`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:create`

**Request Body**:
```json
{
  "snapname": "snapshot-2025-12-16",
  "description": "Before system update",
  "vmstate": false
}
```

**Response**: `201 Created`

### Delete Snapshot

**Endpoint**: `DELETE /vms/node/{node_id}/vm/{vmid}/snapshots/{snapname}`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:delete`

**Response**: `204 No Content`

### Rollback Snapshot

**Endpoint**: `POST /vms/node/{node_id}/vm/{vmid}/snapshots/{snapname}/rollback`

**Headers**: `Authorization: Bearer <token>`

**Required Permission**: `vm:update`

**Response**: `200 OK`

---

## Dashboard

### Get Dashboard Statistics

**Endpoint**: `GET /dashboard/stats`

**Headers**: `Authorization: Bearer <token>`

**Response**: `200 OK`
```json
{
  "total_vms": 15,
  "running_vms": 12,
  "stopped_vms": 3,
  "total_clusters": 2,
  "total_nodes": 4,
  "total_users": 8,
  "cpu_usage": 45.5,
  "memory_usage": 62.3,
  "disk_usage": 55.8
}
```

---

## Error Handling

### Error Response Format

All errors follow this format:

```json
{
  "detail": "Error message description"
}
```

### HTTP Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `204 No Content` - Request succeeded, no response body
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - Server error

### Common Errors

**401 Unauthorized**:
```json
{
  "detail": "Not authenticated"
}
```

**403 Forbidden**:
```json
{
  "detail": "Insufficient permissions"
}
```

**404 Not Found**:
```json
{
  "detail": "VM not found"
}
```

**422 Validation Error**:
```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ]
}
```

---

## Rate Limiting

Currently no rate limiting is enforced. For production deployments, consider implementing rate limiting at the reverse proxy level (e.g., Nginx).

---

## Pagination

List endpoints support pagination via query parameters:

- `skip`: Number of records to skip (default: 0)
- `limit`: Maximum records to return (default: 100, max: 1000)

**Example**:
```bash
curl -X GET "http://localhost:8000/users/?skip=20&limit=10" \
  -H "Authorization: Bearer <token>"
```

---

## CORS

The API supports CORS for the following origins (configurable in `.env`):

- `http://localhost:4200` (development)
- Your production domain

Add origins in backend `.env`:
```
CORS_ORIGINS=http://localhost:4200,https://yourdomain.com
```

---

## API Clients

### Python Example

```python
import requests

# Login
response = requests.post(
    "http://localhost:8000/auth/token",
    data={"username": "admin", "password": "admin123"}
)
token = response.json()["access_token"]

# Make authenticated request
headers = {"Authorization": f"Bearer {token}"}
vms = requests.get(
    "http://localhost:8000/vms/node/1",
    headers=headers
).json()

print(f"Found {len(vms)} VMs")
```

### JavaScript Example

```javascript
// Login
const loginResponse = await fetch('http://localhost:8000/auth/token', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'username=admin&password=admin123'
});
const { access_token } = await loginResponse.json();

// Make authenticated request
const vmsResponse = await fetch('http://localhost:8000/vms/node/1', {
  headers: {'Authorization': `Bearer ${access_token}`}
});
const vms = await vmsResponse.json();

console.log(`Found ${vms.length} VMs`);
```

---

## WebSocket API (Future)

Real-time updates via WebSockets will be available in a future release for:
- VM status changes
- Resource usage monitoring
- Activity logs

---

## Support

- **API Documentation**: http://localhost:8000/docs (Swagger UI)
- **ReDoc**: http://localhost:8000/redoc
- **GitHub Issues**: https://github.com/kumpeapps/kvcloud/issues
- **Email**: support@kumpeapps.com
