"""API endpoints for kvcloud-agent client interactions."""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime
import secrets

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.core.agent_auth import verify_agent_key, generate_agent_api_key
from app.models.vm_assignment import VMAssignment
from app.models.user import User
from app.services.proxmox import ProxmoxService
import os
import json

router = APIRouter(prefix="/provision/agent", tags=["agent"])


def generate_agent_api_key() -> str:
    """Generate a high-entropy API key for agent authentication."""
    # Generate 32 bytes (256 bits) of random data
    random_bytes = secrets.token_bytes(32)
    # Convert to hex string (64 characters)
    key_suffix = random_bytes.hex()
    return f"kvcloud_agent_{key_suffix}"


async def get_vm_by_agent_key(
    x_agent_key: str = Header(..., alias="X-Agent-Key"),
    db: AsyncSession = Depends(get_db)
) -> VMAssignment:
    """Dependency to authenticate agent requests via API key."""
    if not x_agent_key or not x_agent_key.startswith("kvcloud_agent_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid agent API key format"
        )
    
    # Find VM by agent API key
    stmt = select(VMAssignment).where(VMAssignment.agent_api_key == x_agent_key)
    result = await db.execute(stmt)
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid agent API key"
        )
    
    return assignment


class ProvisionCompleteRequest(BaseModel):
    """Request body for agent reporting provision completion."""
    vmid: int
    provision_id: str
    success: bool
    failed_steps: List[str] = []
    results: List[Dict[str, Any]] = []


@router.get("/pending/{vmid}")
async def get_pending_provision(
    vmid: int,
    assignment: VMAssignment = Depends(get_vm_by_agent_key),
    db: AsyncSession = Depends(get_db)
):
    """
    Check if there's a pending provision for this VM.
    Called by kvcloud-agent on the guest VM.
    Requires X-Agent-Key header for authentication.
    
    Returns:
    - 404 if no pending provision
    - 200 with provision data if pending
    """
    # Verify the vmid matches the authenticated VM
    if assignment.vmid != vmid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent key does not match VM"
        )
    
    # Check if provision is pending
    if not assignment.provision_pending:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending provision"
        )
    
    # Update last check-in time
    assignment.last_agent_checkin = datetime.utcnow()
    await db.commit()
    
    # Return provision configuration
    config = assignment.get_pending_provision_config()
    
    # Merge docker compose files from separate storage
    compose_files = assignment.get_compose_files()
    if compose_files:
        config['docker_compose_files'] = compose_files
        if compose_files and 'install_docker' not in config:
            config['install_docker'] = True
    
    return {
        "provision_id": f"agent-{vmid}-{int(datetime.now().timestamp())}",
        "vmid": vmid,
        "node_id": assignment.node_id,
        "config": config,
        "message": "Provision pending"
    }


@router.post("/complete")
async def complete_provision(
    req: ProvisionCompleteRequest,
    assignment: VMAssignment = Depends(get_vm_by_agent_key),
    db: AsyncSession = Depends(get_db)
):
    """
    Agent reports completion of a provision task.
    Requires X-Agent-Key header for authentication.
    """
    # Verify the vmid matches
    if assignment.vmid != req.vmid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent key does not match VM"
        )
    
    # Clear pending provision
    assignment.clear_pending_provision()
    assignment.last_agent_checkin = datetime.utcnow()
    
    # Unlock VM if it was locked for provisioning
    if assignment.is_locked and assignment.lock_reason == "pending provision":
        assignment.is_locked = False
        assignment.lock_reason = None
    
    await db.commit()
    
    # Log the result
    status_msg = "✓ Success" if req.success else f"✗ Failed: {', '.join(req.failed_steps)}"
    print(f"[Agent] Provision {req.provision_id} completed: {status_msg}")
    
    return {
        "message": "Provision completion recorded",
        "success": req.success
    }


@router.post("/install/{node_id}/{vmid}")
@require_permission("vm", "update")
async def install_agent(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Install kvcloud-agent on a VM using QEMU guest agent.
    This pushes the agent script, systemd service, and configuration.
    """
    # Find VM assignment
    stmt = select(VMAssignment).where(
        VMAssignment.vmid == vmid,
        VMAssignment.node_id == node_id
    )
    result = await db.execute(stmt)
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM not found"
        )
    
    # Load agent script and service file
    agent_script_path = os.path.join(os.path.dirname(__file__), "..", "resources", "kvcloud-agent.py")
    service_file_path = os.path.join(os.path.dirname(__file__), "..", "resources", "kvcloud-agent.service")
    
    if not os.path.exists(agent_script_path):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Agent script not found"
        )
    
    with open(agent_script_path, 'r') as f:
        agent_script = f.read()
    
    with open(service_file_path, 'r') as f:
        service_file = f.read()
    
    # Generate high-entropy API key for this agent
    api_key = generate_agent_api_key()
    
    # Store API key in database
    assignment.agent_api_key = api_key
    await db.commit()
    
    print(f"[Agent Install] Generated API key for VM {vmid}: {api_key[:20]}...")
    
    # Create agent configuration
    agent_config = {
        "api_url": os.environ.get("API_URL", "http://localhost:8000"),
        "vmid": vmid,
        "node_id": node_id,
        "api_key": api_key
    }
    
    # Use ProxmoxService to execute commands via guest agent
    service = ProxmoxService(db)
    
    try:
        # Create directories
        code, _, err = await service.exec_guest_command(node_id, vmid, "mkdir -p /opt/kvcloud /etc/kvcloud /var/lib/kvcloud")
        if code != 0:
            raise Exception(f"Failed to create directories: {err}")
        
        # Write agent script using guest_write_file (handles encoding properly)
        print(f"[Agent Install] Writing agent script ({len(agent_script)} bytes)...")
        ok = await service.guest_write_file(node_id, vmid, "/opt/kvcloud/kvcloud-agent.py", agent_script, mode='0755', owner='root:root')
        if not ok:
            raise Exception("Failed to write agent script")
        
        # Write service file
        print(f"[Agent Install] Writing systemd service ({len(service_file)} bytes)...")
        ok = await service.guest_write_file(node_id, vmid, "/etc/systemd/system/kvcloud-agent.service", service_file, mode='0644', owner='root:root')
        if not ok:
            raise Exception("Failed to write service file")
        
        # Write config file
        config_json = json.dumps(agent_config, indent=2)
        print(f"[Agent Install] Writing agent config ({len(config_json)} bytes)...")
        ok = await service.guest_write_file(node_id, vmid, "/etc/kvcloud/agent.conf", config_json, mode='0600', owner='root:root')
        if not ok:
            raise Exception("Failed to write config file")
        
        # Install requests if not present
        print(f"[Agent Install] Installing dependencies...")
        await service.exec_guest_command(node_id, vmid, "pip3 install requests 2>/dev/null || apt-get install -y python3-requests 2>/dev/null || true", timeout=120)
        
        # Stop existing service if running (for reinstalls)
        print(f"[Agent Install] Stopping existing service if running...")
        await service.exec_guest_command(node_id, vmid, "systemctl stop kvcloud-agent 2>/dev/null || true")
        
        # Enable and start service
        print(f"[Agent Install] Enabling and starting service...")
        code, _, err = await service.exec_guest_command(node_id, vmid, "systemctl daemon-reload")
        if code != 0:
            print(f"[Agent Install] Warning: daemon-reload failed: {err}")
        
        code, _, err = await service.exec_guest_command(node_id, vmid, "systemctl enable kvcloud-agent")
        if code != 0:
            print(f"[Agent Install] Warning: enable failed: {err}")
        
        # Give it a moment after daemon-reload
        await service.exec_guest_command(node_id, vmid, "sleep 1")
        
        code, out, err = await service.exec_guest_command(node_id, vmid, "systemctl start kvcloud-agent")
        if code != 0:
            print(f"[Agent Install] Warning: start failed: {err}")
            # Check status for more info
            code2, out2, err2 = await service.exec_guest_command(node_id, vmid, "systemctl status kvcloud-agent 2>&1")
            print(f"[Agent Install] Service status: {out2}")
            # Check journal logs
            code3, out3, err3 = await service.exec_guest_command(node_id, vmid, "journalctl -u kvcloud-agent -n 20 --no-pager 2>&1")
            print(f"[Agent Install] Service logs: {out3}")
        else:
            print(f"[Agent Install] Service started successfully")
        
        # Mark agent as installed
        assignment.agent_installed = True
        await db.commit()
        
        print(f"[Agent Install] Successfully installed agent on VM {vmid}")
        
        return {
            "message": "Agent installed successfully",
            "vmid": vmid,
            "agent_installed": True
        }
        
    except Exception as e:
        print(f"[Agent Install] Error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to install agent: {str(e)}"
        )


@router.get("/status/{vmid}")
@require_permission("vm", "read")
async def get_agent_status(
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get agent status for a VM."""
    stmt = select(VMAssignment).where(VMAssignment.vmid == vmid)
    result = await db.execute(stmt)
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM not found"
        )
    
    return {
        "vmid": vmid,
        "agent_installed": assignment.agent_installed,
        "provision_pending": assignment.provision_pending,
        "last_checkin": assignment.last_agent_checkin.isoformat() if assignment.last_agent_checkin else None,
        "pending_config": assignment.get_pending_provision_config() if assignment.provision_pending else None
    }
