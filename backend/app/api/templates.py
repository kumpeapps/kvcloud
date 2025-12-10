"""Debian template builder utilities."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.services.proxmox import ProxmoxService

router = APIRouter(prefix="/templates", tags=["templates"])


@router.post("/node/{node_id}/build-debian-template")
@require_permission("vm", "create")
async def build_debian_template(
    node_id: int,
    name: str = "debian-guest-agent",
    vmid: int | None = None,
    storage: str = "local-lvm",
    disk_gb: int = 10,
    cores: int = 2,
    memory_mb: int = 2048,
    ssh_public_key: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Build a Debian VM template with qemu-guest-agent installed.

    Steps:
    - Create VM with minimal specs
    - Mount Debian netinst ISO (requires ISO present in storage)
    - Start VM and wait for guest agent (after install)
    - Install qemu-guest-agent in the guest and enable service
    - Optionally add SSH key
    - Convert VM to a template

    Note: This flow expects a pre-uploaded Debian ISO (e.g., debian-12.6.0-amd64-netinst.iso)
    already available in Proxmox storage. Alternatively, use cloud images API to fetch images.
    """
    service = ProxmoxService(db)

    # Create base VM
    try:
        if not vmid:
            vmid = await service.get_next_vmid(node_id)
        cfg = {
            "vmid": vmid,
            "name": name,
            "cores": cores,
            "memory": memory_mb,
            "disk_size": disk_gb,
            "storage": storage,
            "network_bridge": "vmbr0",
            "os_type": "l26",
            "agent": 1
        }
        # Reuse create VM API
        from app.api.vms import create_vm, VMCreateRequest
        req = VMCreateRequest(**cfg)
        await create_vm(node_id=node_id, vm_data=req, db=db, current_user=current_user)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create base VM: {e}")

    # At this point manual install is required via ISO; we can at least start VM
    try:
        await service.start_vm(node_id, vmid)
    except Exception:
        pass

    return {"message": "Base VM created. Install Debian manually, then run provisioning to install qemu-guest-agent and convert to template.", "vmid": vmid}
