"""Provision VMs without cloud-init using QEMU Guest Agent."""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.services.proxmox import ProxmoxService
from app.api.cloud_init import _resolve_vm_network_config, _build_default_network_block, SingleQuoted, _ensure_hashed_password
import yaml

router = APIRouter(prefix="/provision", tags=["provisioning"])


class GuestAgentProvisionRequest(BaseModel):
    node_id: int
    vmid: int
    # User & SSH
    default_user: Optional[str] = None
    default_password: Optional[str] = None  # plaintext allowed; will be hashed
    ssh_authorized_keys: Optional[List[str]] = None
    ssh_pwauth: Optional[bool] = None
    # Packages
    packages: Optional[List[str]] = None
    # Host settings
    hostname: Optional[str] = None
    timezone: Optional[str] = None
    # Docker compose
    docker_compose_content: Optional[str] = None
    docker_compose_path: Optional[str] = "/root/docker-compose.yml"
    start_docker_compose: Optional[bool] = False
    # Network: if omitted, will resolve from DB/IP pools
    write_network: bool = True


def _yaml_network_from_vm_net(vm_net: Dict[str, Any]) -> str:
    """Render netplan YAML from vm_network dict."""
    block = _build_default_network_block(vm_net)
    return yaml.dump(block, default_flow_style=False)


@router.post("/vm/guest-agent")
@require_permission("vm", "update")
async def provision_vm_via_guest_agent(
    req: GuestAgentProvisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Provision a VM using QEMU Guest Agent commands instead of cloud-init.

    Prerequisites: guest image must have qemu-guest-agent installed and running.
    """
    service = ProxmoxService(db)

    # Build config object for provisioning
    cfg: Dict[str, Any] = {}
    if req.default_user:
        cfg['default_user'] = req.default_user
    if req.default_password:
        # Hash plaintext to SHA-512 (same as cloud-init helper)
        cfg['password_hash'] = _ensure_hashed_password(req.default_password)
    if req.ssh_authorized_keys:
        cfg['ssh_authorized_keys'] = req.ssh_authorized_keys
    if req.ssh_pwauth is not None:
        cfg['ssh_pwauth'] = req.ssh_pwauth
    if req.packages:
        cfg['packages'] = req.packages
    if req.hostname:
        cfg['hostname'] = req.hostname
    if req.timezone:
        cfg['timezone'] = req.timezone
    if req.docker_compose_content:
        cfg['docker_compose_content'] = req.docker_compose_content
        cfg['docker_compose_path'] = req.docker_compose_path or "/root/docker-compose.yml"
        cfg['start_docker_compose'] = bool(req.start_docker_compose)

    # Network YAML from resolver if requested
    if req.write_network:
        vm_net = await _resolve_vm_network_config(db, req.vmid)
        if vm_net:
            cfg['network_yaml'] = _yaml_network_from_vm_net(vm_net)

    # Execute provisioning via guest agent
    result = await service.provision_vm_via_guest_agent(req.node_id, req.vmid, cfg)

    # Basic success check
    ok = any(step.get('status') == 'ok' for step in result.get('steps', []))
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={"message": "Provisioning failed", "result": result})

    return {"message": "Provisioning executed", "result": result}
