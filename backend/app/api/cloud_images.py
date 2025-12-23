"""Cloud image download and template creation endpoints."""
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
import asyncio
import httpx
import os
from datetime import datetime

from app.core.database import get_db
from app.models.user import User
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.services.proxmox import ProxmoxService
from app.core.tasks_store import active_tasks as download_status, archive_task
from app.core.config import settings

router = APIRouter(prefix="/cloud-images", tags=["cloud-images"])

# In-memory storage for download status
# In-memory storage moved to shared tasks_store (active_tasks)


class CloudImageSource(BaseModel):
    """Available cloud images."""
    id: str
    name: str
    distro: str
    version: str
    url: str
    description: Optional[str] = None


class CloudImageDownloadRequest(BaseModel):
    """Request to download a cloud image."""
    image_id: str = Field(..., description="Cloud image ID to download")
    node_id: int = Field(..., description="Node ID to download to")
    template_vmid: Optional[int] = Field(None, description="VM ID for the template (e.g., 9000). If not provided, auto-assigned.")
    template_name: str = Field(..., description="Name for the template")
    memory: int = Field(default=2048, description="Memory in MB")
    cores: int = Field(default=2, description="CPU cores")
    storage: str = Field(default="local-lvm", description="Storage name")
    custom_url: Optional[str] = Field(None, description="Optional custom image URL (QCOW2/IMG)")
    install_guest_agent: bool = Field(default=True, description="Install qemu-guest-agent in guest via cloud-init and halt before templating")
    template_scripts: Optional[List[str]] = Field(None, description="Optional shell scripts to run inside the template VM after guest agent verification (requires ALLOW_TEMPLATE_CUSTOM_SCRIPTS)")


# Pre-defined cloud images
CLOUD_IMAGES = {
    "debian-12": CloudImageSource(
        id="debian-12",
        name="Debian 12 (Bookworm)",
        distro="debian",
        version="12",
        url="https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2",
        description="Latest Debian 12 cloud image with cloud-init"
    ),
    "debian-11": CloudImageSource(
        id="debian-11",
        name="Debian 11 (Bullseye)",
        distro="debian",
        version="11",
        url="https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-generic-amd64.qcow2",
        description="Latest Debian 11 cloud image with cloud-init"
    ),
    "ubuntu-24.04": CloudImageSource(
        id="ubuntu-24.04",
        name="Ubuntu 24.04 LTS (Noble)",
        distro="ubuntu",
        version="24.04",
        url="https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img",
        description="Latest Ubuntu 24.04 LTS cloud image"
    ),
    "ubuntu-22.04": CloudImageSource(
        id="ubuntu-22.04",
        name="Ubuntu 22.04 LTS (Jammy)",
        distro="ubuntu",
        version="22.04",
        url="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img",
        description="Latest Ubuntu 22.04 LTS cloud image"
    ),
    "ubuntu-20.04": CloudImageSource(
        id="ubuntu-20.04",
        name="Ubuntu 20.04 LTS (Focal)",
        distro="ubuntu",
        version="20.04",
        url="https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64.img",
        description="Latest Ubuntu 20.04 LTS cloud image"
    ),
    "rocky-9": CloudImageSource(
        id="rocky-9",
        name="Rocky Linux 9",
        distro="rocky",
        version="9",
        url="https://download.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud-Base.latest.x86_64.qcow2",
        description="Latest Rocky Linux 9 cloud image"
    ),
    "rocky-8": CloudImageSource(
        id="rocky-8",
        name="Rocky Linux 8",
        distro="rocky",
        version="8",
        url="https://download.rockylinux.org/pub/rocky/8/images/x86_64/Rocky-8-GenericCloud-Base.latest.x86_64.qcow2",
        description="Latest Rocky Linux 8 cloud image"
    ),
    "almalinux-9": CloudImageSource(
        id="almalinux-9",
        name="AlmaLinux 9",
        distro="almalinux",
        version="9",
        url="https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2",
        description="Latest AlmaLinux 9 cloud image"
    ),
}


@router.get("/", response_model=List[CloudImageSource])
async def list_cloud_images(
    current_user: User = Depends(get_current_user)
):
    """List available cloud images for download."""
    return list(CLOUD_IMAGES.values())


@router.get("/status/{download_id}")
async def get_download_status(
    download_id: str,
):
    """Get the status of a cloud image download.

    This endpoint is intentionally unauthenticated to allow long-running
    frontend polling even if the session token expires mid-download.
    """
    if download_id not in download_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Download not found"
        )
    
    # Debug log to verify status is being accessed
    status_data = download_status[download_id]
    print(f"[{download_id}] Status requested - Progress: {status_data.get('progress', 0)}%, Message: {status_data.get('message', 'N/A')}")
    
    return status_data


@router.get("/next-vmid/{node_id}")
async def get_next_available_vmid(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the next available VMID for a given node."""
    service = ProxmoxService(db)
    
    # Get node details
    node = await service.get_node(node_id)
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found"
        )
    
    try:
        next_vmid = await service.get_next_available_vmid(node.host, node.ssh_username or "root", node.ssh_password, starting_vmid=9000)
        return {
            "next_vmid": next_vmid,
            "node_id": node_id,
            "node_name": node.name
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get next VMID: {str(e)}"
        )


@router.post("/validate-vmid/{node_id}/{vmid}")
async def validate_vmid(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if a VMID is available on a node."""
    service = ProxmoxService(db)
    
    # Get node details
    node = await service.get_node(node_id)
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found"
        )
    
    try:
        is_available = await service.check_vmid_available(node.host, node.ssh_username or "root", node.ssh_password, vmid)
        return {
            "vmid": vmid,
            "available": is_available,
            "node_id": node_id,
            "node_name": node.name
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate VMID: {str(e)}"
        )


@router.post("/download")
@require_permission("template", "create")
async def download_cloud_image(
    request: CloudImageDownloadRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Download a cloud image and create a Proxmox template."""
    # Resolve image URL (support custom URL)
    if request.image_id in CLOUD_IMAGES:
        image = CLOUD_IMAGES[request.image_id]
        image_url = image.url
    elif request.custom_url:
        # Use provided custom URL when image_id is unknown
        image = CloudImageSource(
            id="custom",
            name="Custom Image",
            distro="custom",
            version="",
            url=request.custom_url,
            description="User-provided image URL"
        )
        image_url = request.custom_url
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cloud image not found (and no custom_url provided)"
        )

    # Enforce admin guard for template scripts
    if request.template_scripts and not settings.ALLOW_TEMPLATE_CUSTOM_SCRIPTS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Template customization scripts are disabled by administrator."
        )
    service = ProxmoxService(db)
    
    # Get node details
    node = await service.get_node(request.node_id)
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found"
        )
    
    # Auto-assign VMID if not provided (templates start at 9000)
    if request.template_vmid is None:
        try:
            request.template_vmid = await service.get_next_available_vmid(
                node.host, node.ssh_username or "root", node.ssh_password, starting_vmid=9000
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to auto-assign VMID: {str(e)}"
            )
    
    # Validate VMID is available
    try:
        is_available = await service.check_vmid_available(node.host, node.ssh_username or "root", node.ssh_password, request.template_vmid)
        if not is_available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"VMID {request.template_vmid} already exists on node {node.name}"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate VMID: {str(e)}"
        )
    
    # Create unique download ID
    download_id = f"{request.node_id}-{request.template_vmid}-{int(datetime.now().timestamp())}"
    
    # Initialize status
    download_status[download_id] = {
        "id": download_id,
        "status": "downloading",
        "progress": 5,
        "message": "Initializing download...",
        "image_name": image.name,
        "template_vmid": request.template_vmid,
        "node_name": node.name,
        "started_at": datetime.now().isoformat()
    }
    
    # Start download in background with database context
    # We need to pass db so the background task can query IP pools
    background_tasks.add_task(
        download_and_create_template,
        download_id,
        db,
        node.host,
        node.ssh_username or "root",
        node.ssh_password,
        image_url,
        image.distro,
        request.template_vmid,
        request.template_name,
        request.memory,
        request.cores,
        request.storage,
        request.install_guest_agent,
        request.template_scripts or []
    )
    
    return {
        "message": f"Started downloading {image.name}. Template will be created as VM {request.template_vmid}.",
        "download_id": download_id,
        "image": image.name,
        "template_vmid": request.template_vmid,
        "node": node.name
    }


async def download_and_create_template(
    download_id: str,
    db: AsyncSession,
    proxmox_host: str,
    proxmox_user: str,
    proxmox_password: str,
    image_url: str,
    image_distro: Optional[str],
    vmid: int,
    vm_name: str,
    memory: int,
    cores: int,
    storage: str,
    install_guest_agent: bool,
    template_scripts: List[str]
):
    """Download cloud image and create Proxmox template."""
    from sqlalchemy import select
    from app.models.ip_pool import IPPool, IPAddress
    
    collected_errors = []  # Collect all error messages
    vm_created = False  # Track if VM was successfully created
    ssh = None
    temp_ip = None  # IP to use for template VM network config
    temp_ip_obj = None  # IPAddress object to clean up later
    temp_vlan_tag = None  # VLAN tag from IP pool
    temp_bridge = "vmbr0"  # Default bridge
    
    # Heartbeat tracking variables (must be declared here for update_progress access)
    last_progress_update = None
    last_progress_value = 5
    
    try:
        # Get first available IP from any active pool
        query = select(IPPool).where(IPPool.is_active == True).limit(1)
        result = await db.execute(query)
        pool = result.scalar_one_or_none()
        
        if pool:
            # Get last available (unallocated) IP from this pool
            ip_query = select(IPAddress).where(
                IPAddress.pool_id == pool.id,
                IPAddress.is_allocated == False
            ).order_by(IPAddress.id.desc()).limit(1)
            ip_result = await db.execute(ip_query)
            temp_ip_obj = ip_result.scalar_one_or_none()
            
            if temp_ip_obj:
                temp_ip = temp_ip_obj.ip_address
                # Extract gateway and netmask from pool
                temp_gateway = pool.gateway
                temp_netmask = pool.netmask
                # Extract VLAN tag and bridge from pool
                temp_vlan_tag = pool.vlan_tag
                temp_bridge = pool.bridge or "vmbr0"
                # Convert /24 format to CIDR if needed
                if temp_netmask.startswith('/'):
                    temp_cidr = temp_netmask
                else:
                    # Simple conversion (assumes /24 for 255.255.255.0, etc.)
                    temp_cidr = '/24'
                print(f"[{download_id}] Selected temporary IP {temp_ip} from pool {pool.name} (VLAN: {temp_vlan_tag}, Bridge: {temp_bridge})")
    except Exception as e:
        print(f"[{download_id}] Warning: Could not get IP from pool: {e}")
        # Fall back to DHCP if no IP pool available
        temp_ip = None
    
    # Initialize heartbeat tracking variables before defining update_progress
    import time
    start_time = time.time()
    last_progress_update = start_time
    last_progress_value = 5  # Start from initial progress
    
    def update_progress(output_line: str):
        nonlocal last_progress_update, last_progress_value
        """Parse output and update progress status."""
        if output_line:
            # Ensure status dict still exists (could be stale)
            if download_id not in download_status:
                print(f"[{download_id}] WARNING: download_id not in status dict!")
                return
        
        # Reset heartbeat timer on any meaningful output
        last_progress_update = time.time()
        
        # Debug: Log that we're updating progress
        print(f"[{download_id}] update_progress called with: {output_line[:100] if output_line else 'None'}...")
        
        if 'STEP 1' in output_line or 'Downloading cloud image' in output_line:
            download_status[download_id]["progress"] = 15
            download_status[download_id]["message"] = "📥 Downloading cloud image..."
            print(f"[{download_id}] Progress: 15% - Downloading cloud image")
            last_progress_value = 15
        elif 'STEP 2' in output_line or 'creating VM' in output_line or 'Create' in output_line:
            download_status[download_id]["progress"] = 35
            download_status[download_id]["message"] = "⚙️  Creating virtual machine..."
            print(f"[{download_id}] Progress: 35% - Creating VM")
        elif 'STEP 3' in output_line or 'Importing disk' in output_line or 'importdisk' in output_line:
            download_status[download_id]["progress"] = 45
            download_status[download_id]["message"] = "💾 Importing disk..."
            print(f"[{download_id}] Progress: 45% - Importing disk")
        elif 'STEP 4' in output_line or 'Configuring VM' in output_line:
            download_status[download_id]["progress"] = 60
            download_status[download_id]["message"] = "⚙️  Configuring VM..."
            print(f"[{download_id}] Progress: 60% - Configuring VM")
        elif 'STEP 4a' in output_line or 'Configuring cloud-init IP' in output_line or 'ipconfig0' in output_line:
            download_status[download_id]["progress"] = 62
            download_status[download_id]["message"] = "🌐 Configuring cloud-init IP..."
            print(f"[{download_id}] Progress: 62% - Configuring cloud-init IP")
        elif 'STEP 4b' in output_line or 'Installing guest agent' in output_line:
            download_status[download_id]["progress"] = 65
            download_status[download_id]["message"] = "🤖 Installing guest agent via cloud-init..."
            print(f"[{download_id}] Progress: 65% - Installing guest agent")
        elif 'STEP 4c' in output_line or 'Applying cloud-init' in output_line or 'cicustom' in output_line:
            download_status[download_id]["progress"] = 70
            download_status[download_id]["message"] = "☁️  Applying cloud-init configuration..."
            print(f"[{download_id}] Progress: 70% - Applying cloud-init")
        elif 'STEP 4d' in output_line or 'Booting VM' in output_line or 'start' in output_line.lower():
            download_status[download_id]["progress"] = 75
            download_status[download_id]["message"] = "🚀 Booting VM for guest agent setup..."
            print(f"[{download_id}] Progress: 75% - Booting VM")
        elif 'STEP 4e' in output_line or 'Waiting for VM' in output_line or 'halted' in output_line.lower():
            download_status[download_id]["progress"] = 80
            download_status[download_id]["message"] = "⏳ Waiting for VM to complete setup and halt..."
            print(f"[{download_id}] Progress: 80% - Waiting for VM")
        elif 'STEP 4f' in output_line or 'Ensuring VM is stopped' in output_line:
            download_status[download_id]["progress"] = 82
            download_status[download_id]["message"] = "🛑 Ensuring VM is stopped..."
            print(f"[{download_id}] Progress: 82% - Ensuring VM is stopped")
        elif 'STEP 4g' in output_line or 'Rebooting VM' in output_line or 'network connectivity' in output_line:
            download_status[download_id]["progress"] = 85
            download_status[download_id]["message"] = "🔄 Rebooting VM for network connectivity..."
            print(f"[{download_id}] Progress: 85% - Rebooting VM")
        elif 'STEP 4h' in output_line or 'guest agent' in output_line.lower():
            download_status[download_id]["progress"] = 87
            download_status[download_id]["message"] = "🤖 Verifying QEMU guest agent..."
            print(f"[{download_id}] Progress: 87% - Verifying guest agent")
        elif 'STEP 4i' in output_line or 'Removing cloud-init from template' in output_line:
            download_status[download_id]["progress"] = 88
            download_status[download_id]["message"] = "🧽 Removing cloud-init configuration from template..."
            print(f"[{download_id}] Progress: 88% - Removing cloud-init from template")
        elif 'STEP 5' in output_line or 'Converting to template' in output_line or 'template' in output_line.lower():
            download_status[download_id]["progress"] = 90
            download_status[download_id]["message"] = "📋 Converting to template..."
            print(f"[{download_id}] Progress: 90% - Converting to template")
        elif 'STEP 6' in output_line or 'Cleanup' in output_line or 'rm -f' in output_line:
            download_status[download_id]["progress"] = 95
            download_status[download_id]["message"] = "🧹 Cleaning up temporary files..."
            print(f"[{download_id}] Progress: 95% - Cleanup")
        elif 'DONE' in output_line:
            download_status[download_id]["progress"] = 100
            download_status[download_id]["status"] = "completed"
            download_status[download_id]["message"] = f"✅ Template {vmid} created successfully!"
            download_status[download_id]["completed_at"] = datetime.now().isoformat()
            print(f"[{download_id}] Progress: 100% - DONE")
            # Archive the task to history
            archive_task(download_id)
        
        # Collect error messages
        if 'unable to' in output_line.lower() or 'error' in output_line.lower() or 'failed' in output_line.lower():
            if output_line and len(collected_errors) < 5:  # Limit to 5 error lines
                collected_errors.append(output_line)
    
    async def cleanup_vm_on_failure():
        """Delete the created VM if template creation fails."""
        nonlocal ssh
        if not vm_created:
            return  # VM wasn't created, nothing to clean up
        
        try:
            if ssh is None:
                ssh = paramiko.SSHClient()
                ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                ssh.connect(
                    proxmox_host,
                    username=proxmox_user,
                    password=proxmox_password,
                    port=22,
                    timeout=30
                )
            
            print(f"[{download_id}] Cleaning up VM {vmid} after failure...")
            download_status[download_id]["message"] = f"Cleaning up failed VM {vmid}..."
            
            # Destroy the VM (purge to remove all disks)
            delete_cmd = f"/usr/sbin/qm destroy {vmid} --purge"
            stdin, stdout, stderr = ssh.exec_command(delete_cmd, timeout=60)
            exit_status = stdout.channel.recv_exit_status()
            
            if exit_status == 0:
                print(f"[{download_id}] Successfully deleted VM {vmid}")
                download_status[download_id]["message"] = f"VM {vmid} cleanup completed."
            else:
                err = stderr.read().decode().strip()
                print(f"[{download_id}] Failed to delete VM {vmid}: {err}")
                download_status[download_id]["message"] = f"Warning: Could not cleanup VM {vmid}: {err}"
        except Exception as e:
            print(f"[{download_id}] Error during VM cleanup: {e}")

    try:
        download_status[download_id]["status"] = "downloading"
        download_status[download_id]["progress"] = 10
        download_status[download_id]["message"] = "Connecting to Proxmox node..."
        
        # SSH commands to execute on Proxmox node
        filename = os.path.basename(image_url)
        tmp_path = f"/tmp/{filename}"
        
        # Build the command sequence with better progress tracking
        # Use full paths to ensure commands are found
        # Note: Use backslash line continuations for very long commands to avoid bash parsing issues
        
        # Compose optional cloud-init user-data to install qemu-guest-agent and halt
        user_data_filename = f"vm-{vmid}-user-data.yaml"
        user_data_path = f"/var/lib/vz/snippets/{user_data_filename}"
        
        # Build cloud-init user-data (no network config here - using Proxmox ipconfig instead)
        user_data_yaml = f"""#cloud-config
package_update: true
packages:
    - qemu-guest-agent

runcmd:
    - systemctl enable --now qemu-guest-agent || true

power_state:
    mode: halt
    message: "KVCloud: Halting after guest agent install"
    timeout: 60
    condition: true
"""

        # Build network interface config with optional VLAN tag
        net_config = f"virtio,bridge={temp_bridge}"
        if temp_vlan_tag:
            net_config += f",tag={temp_vlan_tag}"
        
        # Build custom script block (executed inside template via guest agent)
        custom_script_block = "            # No custom template scripts provided or disabled\n"
        if settings.ALLOW_TEMPLATE_CUSTOM_SCRIPTS and template_scripts:
            parts = []
            for idx, script in enumerate(template_scripts, start=1):
                parts.append(
                    "            echo 'STEP 4k: Running custom template script {idx}' >&2\n"
                    "            SCRIPT_B64=$(cat <<'EOF' | base64 -w0\n".format(idx=idx)
                    + script + "\nEOF\n)\n"
                    f"            /usr/sbin/qm agent {{vmid}} exec --timeout 180 -- bash -lc \"echo $SCRIPT_B64 | base64 -d | bash\" || echo 'Warning: custom script {idx} failed' >&2\n"
                )
            custom_script_block = "".join(parts)
        
        image_distro = image_distro or ""

        commands = f"""
        set -e
        echo 'STEP 1: Downloading cloud image' >&2
        /usr/bin/wget --timeout=60 --tries=3 -O {tmp_path} {image_url} 2>&1 | tee /tmp/wget.log
        echo 'STEP 2: Download complete, creating VM' >&2
        /usr/sbin/qm create {vmid} --name {vm_name} --memory {memory} --cores {cores} --net0 {net_config} --ostype l26
        echo 'STEP 3: Importing disk image' >&2
        /usr/sbin/qm importdisk {vmid} {tmp_path} {storage}
        echo 'STEP 4: Configuring VM' >&2
        /usr/sbin/qm set {vmid} \\
          --scsihw virtio-scsi-pci \\
          --scsi0 {storage}:vm-{vmid}-disk-0 \\
          --ide2 {storage}:cloudinit,media=cdrom \\
          --boot 'order=scsi0;ide2' \\
          --bootdisk scsi0 \\
          --serial0 socket \\
          --vga std \\
          --agent 1"""
        
        # Add IP configuration if we have an IP from the pool
        if temp_ip:
            commands += f"""
        echo 'STEP 4a: Configuring cloud-init IP' >&2
        /usr/sbin/qm set {vmid} --ipconfig0 ip={temp_ip}{temp_cidr},gw={temp_gateway}
        /usr/sbin/qm set {vmid} --nameserver 8.8.8.8 --searchdomain local"""
        
        commands += f"""
        if [ "{str(install_guest_agent).lower()}" = "true" ]; then
            echo 'STEP 4b: Installing guest agent via cloud-init' >&2
            /bin/mkdir -p /var/lib/vz/snippets
            /bin/cat > {user_data_path} <<'KVEOF'
{user_data_yaml}
KVEOF
            /bin/chmod 644 {user_data_path}
            echo 'STEP 4c: Applying cloud-init config' >&2
            /usr/sbin/qm set {vmid} --cicustom user=local:snippets/{user_data_filename}
            /usr/sbin/qm cloudinit update {vmid}
            echo 'STEP 4d: Booting VM for guest agent setup' >&2
            /usr/sbin/qm start {vmid}
            echo 'STEP 4e: Waiting for VM to halt after setup' >&2
            for i in $(seq 1 120); do
                STATUS=$(/usr/sbin/qm status {vmid} 2>/dev/null | awk '{{print $2}}' || echo 'unknown')
                if [ "$STATUS" = "stopped" ]; then
                    echo 'VM halted successfully after guest agent install' >&2
                    break
                fi
                if [ $((i % 10)) -eq 0 ]; then
                    echo "Still waiting... ({{i}}s elapsed)" >&2
                fi
                /bin/sleep 1
            done
            # Force stop the VM if it's still running
            STATUS=$(/usr/sbin/qm status {vmid} 2>/dev/null | awk '{{print $2}}' || echo 'stopped')
            if [ "$STATUS" != "stopped" ]; then
                echo 'Force stopping VM before template conversion' >&2
                /usr/sbin/qm stop {vmid} || true
                /bin/sleep 3
            fi
        fi
        # Ensure VM is stopped before converting to template
        echo 'STEP 4f: Ensuring VM is stopped' >&2
        /usr/sbin/qm stop {vmid} 2>/dev/null || true
        /bin/sleep 2
        
        # Reboot VM to ensure network connectivity is initialized
        echo 'STEP 4g: Rebooting VM for network connectivity' >&2
        /usr/sbin/qm start {vmid}
        /bin/sleep 5
        echo 'Waiting for VM to boot and initialize network...' >&2
        /bin/sleep 15
        
        # Verify QEMU guest agent is available
        echo 'STEP 4h: Verifying QEMU guest agent availability' >&2
        AGENT_READY=0
        for i in $(seq 1 60); do
            if /usr/sbin/qm agent {vmid} ping 2>/dev/null | grep -q 'returned'; then
                echo "QEMU guest agent is responding" >&2
                AGENT_READY=1
                break
            fi
            if [ $((i % 10)) -eq 0 ]; then
                echo "Waiting for QEMU guest agent... ({{i}}s elapsed)" >&2
            fi
            /bin/sleep 1
        done
        
        if [ $AGENT_READY -eq 0 ]; then
            echo 'Warning: QEMU guest agent did not respond within 60 seconds' >&2
        else
            echo 'QEMU guest agent is ready' >&2
        fi

        # Configure Docker APT repo inside Debian templates once agent and network are ready
        if [ $AGENT_READY -eq 1 ] && [ "{image_distro}" = "debian" ]; then
            echo 'STEP 4j: Configuring Docker APT repo inside template' >&2
            DOCKER_B64=$(cat <<'EOF' | base64 -w0
#!/bin/bash
set -e
apt-get update -y || apt update -y
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y || apt update -y
EOF
)
            /usr/sbin/qm agent {vmid} exec --timeout 180 -- bash -lc "echo $DOCKER_B64 | base64 -d | bash" || echo 'Warning: Docker repo configuration failed' >&2
        fi

        # Run custom template scripts if enabled
        if [ $AGENT_READY -eq 1 ] && [ {int(bool(settings.ALLOW_TEMPLATE_CUSTOM_SCRIPTS))} -eq 1 ]; then
{custom_script_block}
        fi
        
        # Stop VM after verification
        echo 'Stopping VM after agent verification' >&2
        /usr/sbin/qm stop {vmid}
        /bin/sleep 3

        # Remove cloud-init configuration from template to prevent inheritance
        echo 'STEP 4i: Removing cloud-init from template' >&2
        /usr/sbin/qm set {vmid} -delete cicustom || true
        /usr/sbin/qm set {vmid} -delete ide2 || /usr/sbin/qm set {vmid} --ide2 none || true
        /usr/sbin/qm set {vmid} -delete ipconfig0 || true
        /usr/sbin/qm set {vmid} -delete nameserver || true
        /usr/sbin/qm set {vmid} -delete searchdomain || true
        /usr/sbin/qm set {vmid} -delete ciuser || true
        /usr/sbin/qm set {vmid} -delete cipassword || true
        /usr/sbin/qm set {vmid} -delete sshkeys || true
        /usr/sbin/qm set {vmid} --boot 'order=scsi0'
        /bin/rm -f {user_data_path}
        
        # Remove cloud-init netplan file from the template VM
        echo 'STEP 4j: Removing cloud-init netplan file' >&2
        /usr/sbin/qm guest exec {vmid} -- /bin/sh -c "rm -f /etc/netplan/50-cloud-init.yaml /etc/netplan/*cloud-init*.yaml" 2>/dev/null || true
        
        echo 'STEP 5: Converting to template' >&2
        /usr/sbin/qm template {vmid}
        echo 'STEP 6: Cleanup' >&2
        /bin/rm -f {tmp_path} /tmp/wget.log
        echo 'DONE'
        """
        
        # Execute via SSH using paramiko
        import paramiko
        
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            download_status[download_id]["progress"] = 20
            download_status[download_id]["message"] = "Connecting via SSH..."
            
            ssh.connect(
                proxmox_host,
                username=proxmox_user,
                password=proxmox_password,
                port=22,
                timeout=30
            )
            
            download_status[download_id]["progress"] = 30
            download_status[download_id]["message"] = f"Downloading {os.path.basename(image_url)}..."
            
            print(f"Connected to {proxmox_host}, starting cloud image download...")
            
            # Execute the command in a thread to avoid blocking the event loop
            def execute_ssh_command():
                """Execute SSH command and stream output (blocking operation)."""
                nonlocal last_progress_update, last_progress_value
                
                stdin, stdout, stderr = ssh.exec_command(commands, timeout=1800)  # 30 min timeout
                
                # Reset start time for this execution
                start_time = time.time()
                last_progress_update = start_time
                last_progress_value = 10  # Start from 10% (after initial steps)
                
                while True:
                    # Check if command is still running
                    if stdout.channel.exit_status_ready():
                        break
                    
                    current_time = time.time()
                    line_received = False
                    
                    # Try to read available output
                    try:
                        # Read from stdout
                        if stdout.channel.recv_ready():
                            line = stdout.readline().strip()
                            if line:
                                print(f"[{download_id}] {line}")
                                update_progress(line)
                                last_progress_update = current_time  # Reset heartbeat timer
                                line_received = True
                                # Check if VM was created
                                if f"VM {vmid} created successfully" in line:
                                    vm_created = True
                        
                        # Read from stderr
                        if stdout.channel.recv_stderr_ready():
                            err_line = stderr.readline().strip()
                            if err_line:
                                print(f"[{download_id}] STDERR: {err_line}")
                                update_progress(err_line)
                                last_progress_update = current_time  # Reset heartbeat timer
                                line_received = True
                                # Check if VM was created
                                if f"VM {vmid} created successfully" in err_line:
                                    vm_created = True
                    except:
                        pass
                    
                    # Heartbeat: periodically increment progress if no meaningful updates received
                    # This handles long-running operations like wget downloads
                    if (current_time - last_progress_update) > 8 and download_id in download_status:
                        if download_status[download_id]["progress"] < 85:  # Don't go past 85% until completion
                            last_progress_value = min(85, last_progress_value + 1)
                            download_status[download_id]["progress"] = last_progress_value
                            elapsed = int(current_time - start_time)
                            download_status[download_id]["message"] = f"⏳ Processing... {last_progress_value}% ({elapsed}s elapsed)"
                            print(f"[{download_id}] Heartbeat: {last_progress_value}% - Still processing... ({elapsed}s elapsed)")
                            last_progress_update = current_time
                    
                    # Small delay to avoid busy-waiting
                    time.sleep(0.1)
                
                # Read any remaining output
                for line in stdout:
                    line = line.strip()
                    if line:
                        print(f"[{download_id}] {line}")
                        update_progress(line)
                
                for line in stderr:
                    line = line.strip()
                    if line:
                        print(f"[{download_id}] STDERR: {line}")
                        update_progress(line)
                
                # Return exit status
                return stdout.channel.recv_exit_status()
            
            # Run the blocking SSH execution in a thread pool
            exit_status = await asyncio.to_thread(execute_ssh_command)
            
            if exit_status != 0:
                # Build error message from collected errors
                error_msg = " | ".join(collected_errors) if collected_errors else "Command failed with exit status " + str(exit_status)
                print(f"Error creating template: {error_msg}")
                
                # Clean up the VM if it was created
                await cleanup_vm_on_failure()
                
                download_status[download_id]["status"] = "failed"
                download_status[download_id]["message"] = f"Failed: {error_msg[:250]}"
                download_status[download_id]["error_details"] = error_msg
                archive_task(download_id)
            elif download_status[download_id]["status"] != "completed":
                # If we didn't get DONE but exit was 0
                download_status[download_id]["status"] = "completed"
                download_status[download_id]["progress"] = 100
                download_status[download_id]["message"] = f"Template {vmid} created successfully!"
                download_status[download_id]["completed_at"] = datetime.now().isoformat()
                archive_task(download_id)
                
        finally:
            if ssh:
                ssh.close()
            
            # Clean up temporary IP if one was allocated
            if temp_ip_obj and download_status[download_id]["status"] == "completed":
                try:
                    print(f"[{download_id}] Releasing temporary IP {temp_ip}...")
                    # Mark IP as deallocated
                    temp_ip_obj.is_allocated = False
                    temp_ip_obj.vm_id = None
                    await db.commit()
                    print(f"[{download_id}] Successfully released IP {temp_ip}")
                except Exception as e:
                    print(f"[{download_id}] Warning: Could not release IP {temp_ip}: {e}")
            
    except Exception as e:
        print(f"Error in download_and_create_template: {e}")
        import traceback
        traceback.print_exc()
        
        # Clean up the VM if it was created
        await cleanup_vm_on_failure()
        
        download_status[download_id]["status"] = "failed"
        download_status[download_id]["message"] = f"Error: {str(e)}"

