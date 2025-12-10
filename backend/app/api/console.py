"""Console API endpoints for VM console access (VNC/SPICE)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.models.user import User
from app.services.proxmox import ProxmoxService


router = APIRouter(prefix="/console", tags=["Console"])


class VNCConnectionResponse(BaseModel):
    """VNC connection details."""
    ticket: str
    port: int
    upid: Optional[str] = None
    cert: Optional[str] = None
    node: str
    host: str
    vmid: int
    websocket_url: str


class SPICEConfigResponse(BaseModel):
    """SPICE connection configuration."""
    type: str
    host: str
    proxy: str
    tls_port: int
    password: str
    ca: Optional[str] = None


@router.get("/vnc/nodes/{node_id}/vms/{vmid}", response_model=VNCConnectionResponse)
@require_permission("vm", "console")
async def get_vnc_connection(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> VNCConnectionResponse:
    """
    Get VNC WebSocket connection details for a VM.
    
    This endpoint creates a VNC proxy ticket and returns the connection details
    needed to establish a WebSocket connection to the VM console.
    
    Args:
        node_id: Node ID where the VM is running
        vmid: VM ID to connect to
    
    Returns:
        VNCConnectionResponse with connection details including ticket and WebSocket URL
    """
    proxmox_service = ProxmoxService(db)
    
    try:
        # Get VNC connection details
        vnc_data = await proxmox_service.get_vnc_websocket(node_id, vmid)
        
        # Construct WebSocket URL
        # Format: wss://host:port/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket?port={port}&vncticket={ticket}
        websocket_url = (
            f"wss://{vnc_data['host']}:{vnc_data['port']}"
            f"/api2/json/nodes/{vnc_data['node']}/qemu/{vmid}/vncwebsocket"
            f"?port={vnc_data['port']}&vncticket={vnc_data['ticket']}"
        )
        
        return VNCConnectionResponse(
            ticket=vnc_data['ticket'],
            port=vnc_data['port'],
            upid=vnc_data.get('upid'),
            cert=vnc_data.get('cert'),
            node=vnc_data['node'],
            host=vnc_data['host'],
            vmid=vmid,
            websocket_url=websocket_url
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create VNC connection: {str(e)}"
        )


@router.get("/spice/nodes/{node_id}/vms/{vmid}", response_model=SPICEConfigResponse)
@require_permission("vm", "console")
async def get_spice_config(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> SPICEConfigResponse:
    """
    Get SPICE connection configuration for a VM.
    
    This endpoint creates a SPICE proxy configuration that can be used
    with a SPICE client to connect to the VM console.
    
    Args:
        node_id: Node ID where the VM is running
        vmid: VM ID to connect to
    
    Returns:
        SPICEConfigResponse with SPICE connection configuration
    """
    proxmox_service = ProxmoxService(db)
    
    try:
        # Get SPICE configuration
        spice_data = await proxmox_service.get_spice_config(node_id, vmid)
        
        return SPICEConfigResponse(
            type=spice_data['type'],
            host=spice_data['host'],
            proxy=spice_data['proxy'],
            tls_port=spice_data['tls-port'],
            password=spice_data['password'],
            ca=spice_data.get('ca')
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get SPICE configuration: {str(e)}"
        )


@router.post("/nodes/{node_id}/vms/{vmid}/command")
@require_permission("vm", "console")
async def send_console_command(
    node_id: int,
    vmid: int,
    command: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Send a command to VM console (for future implementation).
    
    This endpoint is a placeholder for sending commands directly to VM consoles.
    
    Args:
        node_id: Node ID where the VM is running
        vmid: VM ID to send command to
        command: Command to execute
    
    Returns:
        Command execution result
    """
    return {
        "status": "not_implemented",
        "message": "Console command execution is not yet implemented"
    }
