"""Tests for RBAC permission enforcement."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.main import app
from app.models.user import User
from app.models.casbin_rule import CasbinRule
from app.core.security import get_password_hash


@pytest.fixture
async def test_user_viewer(db: AsyncSession):
    """Create a test user with viewer role."""
    user = User(
        username="viewer_user",
        email="viewer@test.com",
        hashed_password=get_password_hash("testpass"),
        full_name="Viewer User",
        role="viewer",
        is_active=True,
        is_superuser=False
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def test_user_regular(db: AsyncSession):
    """Create a test user with regular user role."""
    user = User(
        username="regular_user",
        email="user@test.com",
        hashed_password=get_password_hash("testpass"),
        full_name="Regular User",
        role="user",
        is_active=True,
        is_superuser=False
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_viewer_cannot_create_vm(client: TestClient, test_user_viewer, auth_headers_viewer):
    """Test that viewer role cannot create VMs."""
    response = client.post(
        "/api/vms/node/1/create",
        json={
            "name": "test-vm",
            "cores": 2,
            "memory": 2048,
            "disk_size": 32
        },
        headers=auth_headers_viewer
    )
    assert response.status_code == 403
    assert "Permission denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_viewer_cannot_delete_vm(client: TestClient, test_user_viewer, auth_headers_viewer):
    """Test that viewer role cannot delete VMs."""
    response = client.delete(
        "/api/vms/node/1/vm/100",
        headers=auth_headers_viewer
    )
    assert response.status_code == 403
    assert "Permission denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_viewer_cannot_start_vm(client: TestClient, test_user_viewer, auth_headers_viewer):
    """Test that viewer role cannot start VMs."""
    response = client.post(
        "/api/vms/node/1/vm/100/start",
        headers=auth_headers_viewer
    )
    assert response.status_code == 403
    assert "Permission denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_viewer_can_list_vms(client: TestClient, test_user_viewer, auth_headers_viewer):
    """Test that viewer role can list VMs (read-only)."""
    response = client.get(
        "/api/vms/node/1",
        headers=auth_headers_viewer
    )
    # Should succeed (200) or return empty list, but not 403
    assert response.status_code in [200, 404]  # 404 if node doesn't exist in test


@pytest.mark.asyncio
async def test_user_can_create_vm(client: TestClient, test_user_regular, auth_headers_user):
    """Test that regular user role can create VMs."""
    # This should succeed permission-wise (might fail on Proxmox connection)
    response = client.post(
        "/api/vms/node/1/create",
        json={
            "name": "test-vm",
            "cores": 2,
            "memory": 2048,
            "disk_size": 32
        },
        headers=auth_headers_user
    )
    # Should not be 403 (permission denied)
    assert response.status_code != 403


@pytest.mark.asyncio
async def test_viewer_cannot_create_snapshot(client: TestClient, test_user_viewer, auth_headers_viewer):
    """Test that viewer role cannot create snapshots."""
    response = client.post(
        "/api/vms/node/1/vm/100/snapshot",
        json={"snapname": "test-snap"},
        headers=auth_headers_viewer
    )
    assert response.status_code == 403
    assert "Permission denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_viewer_cannot_upload_iso(client: TestClient, test_user_viewer, auth_headers_viewer):
    """Test that viewer role cannot upload ISOs."""
    response = client.post(
        "/api/isos/upload",
        json={
            "node_id": 1,
            "storage": "local",
            "filename": "test.iso",
            "url": "http://example.com/test.iso"
        },
        headers=auth_headers_viewer
    )
    assert response.status_code == 403
    assert "Permission denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_viewer_cannot_allocate_ip(client: TestClient, test_user_viewer, auth_headers_viewer):
    """Test that viewer role cannot allocate IPs."""
    response = client.post(
        "/api/ippools/1/allocate",
        json={
            "ip_address": "192.168.1.100",
            "vm_id": 100
        },
        headers=auth_headers_viewer
    )
    assert response.status_code == 403
    assert "Permission denied" in response.json()["detail"]


@pytest.mark.asyncio
async def test_viewer_can_read_ip_pools(client: TestClient, test_user_viewer, auth_headers_viewer):
    """Test that viewer role can read IP pools."""
    response = client.get(
        "/api/ippools/",
        headers=auth_headers_viewer
    )
    # Should succeed (viewer has read permission)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_unauthenticated_request_denied(client: TestClient):
    """Test that unauthenticated requests are denied."""
    response = client.get("/api/vms/node/1")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_bypasses_all_checks(client: TestClient, auth_headers_admin):
    """Test that admin (superuser) can access any endpoint."""
    # Try multiple endpoints - admin should not get 403
    endpoints = [
        ("GET", "/api/vms/node/1"),
        ("GET", "/api/ippools/"),
        ("GET", "/api/isos/nodes/1"),
    ]
    
    for method, endpoint in endpoints:
        if method == "GET":
            response = client.get(endpoint, headers=auth_headers_admin)
        # Should not be 403 (permission denied)
        assert response.status_code != 403
