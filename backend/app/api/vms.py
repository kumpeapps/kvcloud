"""Virtual machine management endpoints."""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from datetime import datetime
import asyncio
import json

from app.core.database import get_db
from app.models.user import User
from app.models.vm_assignment import VMAssignment
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.core.tasks_store import active_tasks, archive_task
# Avoid potential local shadowing issues by importing the module and referencing the class via the module.
from app.services import proxmox as proxmox_service
from app.models.compose_template import ComposeTemplate

# Provide a safe alias for existing usages to avoid NameError in endpoints still
# referencing `ProxmoxService` directly. Prefer module-qualified references for
# new code, but keep this alias for backward compatibility.
ProxmoxService = proxmox_service.ProxmoxService


async def check_vm_not_locked(db: AsyncSession, vmid: int, node_id: int) -> Optional[str]:
    """Check if VM is locked and return lock reason if locked.
    
    Returns:
        Lock reason if locked, None if not locked
    """
    result = await db.execute(
        select(VMAssignment).where(
            VMAssignment.vmid == vmid,
            VMAssignment.node_id == node_id
        )
    )
    assignment = result.scalar_one_or_none()
    
    if assignment and assignment.is_locked:
        return assignment.lock_reason or "VM is locked"
    
    return None


class VMCreateRequest(BaseModel):
    """Request model for creating a new VM."""
    vmid: Optional[int] = Field(None, description="VM ID (auto-generated if not provided)")
    name: str = Field(..., min_length=1, max_length=255, description="VM name")
    cores: int = Field(default=2, ge=1, le=128, description="Number of CPU cores")
    memory: int = Field(default=2048, ge=512, description="Memory in MB")
    disk_size: int = Field(default=32, ge=1, description="Disk size in GB")
    storage: str = Field(default="local-lvm", description="Storage name")
    network_bridge: str = Field(default="vmbr0", description="Network bridge")
    os_type: str = Field(default="l26", description="OS type")
    iso: Optional[str] = Field(None, description="ISO image name")
    template_id: Optional[int] = Field(None, description="Template VM ID to clone from")
    clone_from: Optional[int] = Field(None, description="Clone from existing VM/template")
    cloud_init_profile_id: Optional[int] = Field(None, description="Cloud-init profile to apply")
    ip_pool_id: Optional[int] = Field(None, description="IP pool to allocate from")
    auto_assign_ip: bool = Field(default=False, description="Auto-assign IP from pool")
    enable_guest_agent: bool = Field(default=False, description="Enable QEMU Guest Agent device on VM")
    provision_via_guest_agent: bool = Field(default=False, description="Provision inside guest via QEMU Guest Agent (no cloud-init)")

    # Optional per-VM cloud-init overrides (applied at creation)
    default_user: Optional[str] = Field(None, description="Override default user")
    default_password: Optional[str] = Field(None, description="Override default user password (plaintext; will be hashed)")
    ssh_authorized_keys: Optional[List[str]] = Field(None, description="SSH authorized keys")
    ssh_pwauth: Optional[bool] = Field(None, description="Enable SSH password auth")
    packages: Optional[List[str]] = Field(None, description="Packages to install")
    apt_update: Optional[bool] = Field(None, description="Run package update")
    apt_upgrade: Optional[bool] = Field(None, description="Run package upgrade")
    apt_reboot_if_required: Optional[bool] = Field(None, description="Reboot if required after upgrades")
    docker_compose_content: Optional[str] = Field(None, description="Docker compose YAML content")
    docker_compose_path: Optional[str] = Field(None, description="Path to write docker-compose.yml")
    start_docker_compose: Optional[bool] = Field(None, description="Start docker compose on boot")
    timezone: Optional[str] = Field(None, description="Timezone")
    locale: Optional[str] = Field(None, description="Locale")


class VMCloneRequest(BaseModel):
    """Request model for cloning a VM."""
    newid: int = Field(description="New VM ID", ge=100)
    name: Optional[str] = Field(None, description="Name for cloned VM")
    full: int = Field(1, description="Full clone (1) or linked clone (0)")
    storage: Optional[str] = Field(None, description="Target storage for disks")
    description: Optional[str] = Field(None, description="Description for cloned VM")


class ComposeFileEntry(BaseModel):
    path: str = "/root/docker-compose.yml"
    content: str
    service_name: Optional[str] = None
    start_on_deploy: bool = False
    start_on_boot: bool = False
    template_id: Optional[int] = None
    variables: Optional[Dict[str, Any]] = None
    update_on_template_update: bool = False
    id: Optional[str] = None  # client-generated id for tracking


class ComposeFileCreate(ComposeFileEntry):
    pass


class ComposeTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    content: str
    variables: Optional[List[Dict[str, Any]]] = None  # list of {name, description, default}
    auto_update: bool = False


class ComposeTemplateUpdate(ComposeTemplateCreate):
    pass


class ComposeFromTemplateRequest(BaseModel):
    template_id: int
    variables: Dict[str, Any] = {}
    path: str = "/root/docker-compose.yml"
    service_name: Optional[str] = None
    start_on_deploy: bool = False
    start_on_boot: bool = False
    update_on_template_update: bool = False


class VMConfigUpdate(BaseModel):
    """Request model for updating VM configuration."""
    cores: Optional[int] = Field(None, ge=1, le=128, description="Number of CPU cores")
    memory: Optional[int] = Field(None, ge=512, description="Memory in MB")
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="VM name")
    description: Optional[str] = Field(None, description="VM description")


class VMDiskAddRequest(BaseModel):
    """Request model for adding a disk to a VM."""
    storage: str = Field(..., description="Storage name")
    size: int = Field(..., ge=1, description="Disk size in GB")
    interface: str = Field("scsi", description="Disk interface (scsi, virtio, ide, sata)")
    cache: Optional[str] = Field(None, description="Cache mode (none, writethrough, writeback)")
    discard: Optional[str] = Field(None, description="Enable discard/TRIM (on, off)")
    ssd: Optional[int] = Field(None, description="Emulate SSD (1, 0)")


class VMDiskResizeRequest(BaseModel):
    """Request model for resizing a VM disk."""
    size_increment: str = Field(..., description="Size to add (e.g., '+10G')")


class VMNetworkInterfaceAddRequest(BaseModel):
    """Request model for adding a network interface to a VM."""
    bridge: str = Field(..., description="Bridge name (e.g., 'vmbr0')")
    model: str = Field("virtio", description="Network model (virtio, e1000, rtl8139)")
    mac: Optional[str] = Field(None, description="MAC address (auto-generated if not provided)")
    firewall: Optional[bool] = Field(None, description="Enable firewall")
    rate: Optional[int] = Field(None, description="Rate limit in MB/s")
    tag: Optional[int] = Field(None, description="VLAN tag")


class VMNetworkInterfaceUpdateRequest(BaseModel):
    """Request model for updating a network interface."""
    bridge: Optional[str] = Field(None, description="Bridge name")
    firewall: Optional[bool] = Field(None, description="Enable firewall")
    rate: Optional[int] = Field(None, description="Rate limit in MB/s")
    tag: Optional[int] = Field(None, description="VLAN tag")


class VMBootOrderRequest(BaseModel):
    """Request model for setting VM boot order."""
    boot_order: str = Field(..., description="Boot order string (e.g., 'cdn' for cdrom, disk, network). c=disk, d=cdrom, n=network, a=floppy")


class VMLockRequest(BaseModel):
    """Request model for locking a VM."""
    reason: str = Field(..., description="Reason for locking the VM", max_length=500)


class VMUnlockRequest(BaseModel):
    """Request model for unlocking a VM."""
    force: bool = Field(False, description="Force unlock even if owned by another user")


router = APIRouter(prefix="/vms", tags=["virtual-machines"])


@router.get("/node/{node_id}")
@require_permission("vm", "read")
async def list_vms(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List VMs on a node (filtered by user permissions)."""
    service = proxmox_service.ProxmoxService(db)
    all_vms = await service.list_vms(node_id)
    # Remove template VMs from the generic list view; templates have their own endpoint
    visible_vms = [
        vm for vm in all_vms
        if vm.get('template') not in (1, True, '1', 'true')
    ]
    
    # If user is superuser, return all VMs
    if current_user.is_superuser:
        return {"vms": visible_vms}
    
    # Get assigned VM IDs for this user
    result = await db.execute(
        select(VMAssignment.vmid).where(VMAssignment.user_id == current_user.id)
    )
    assigned_vmids = {row[0] for row in result.all()}
    
    # Filter VMs to only those assigned to user
    user_vms = [vm for vm in visible_vms if vm.get('vmid') in assigned_vmids]
    
    return {"vms": user_vms}


@router.get("/node/{node_id}/vm/{vmid}/status")
@require_permission("vm", "read")
async def get_vm_status(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get VM status including lock status."""
    service = proxmox_service.ProxmoxService(db)
    vm_status = await service.get_vm_status(node_id, vmid)
    if not vm_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM not found"
        )
    
    # Get lock status from VM assignment
    result = await db.execute(
        select(VMAssignment).where(
            VMAssignment.vmid == vmid,
            VMAssignment.node_id == node_id
        )
    )
    assignment = result.scalar_one_or_none()
    
    # Add lock info to response
    if assignment:
        vm_status['is_locked'] = assignment.is_locked
        vm_status['lock_reason'] = assignment.lock_reason
    else:
        vm_status['is_locked'] = False
        vm_status['lock_reason'] = None
    
    return vm_status


@router.get("/node/{node_id}/vm/{vmid}/stats")
@require_permission("vm", "read")
async def get_vm_stats(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get VM statistics including CPU, memory, disk, and network usage."""
    service = proxmox_service.ProxmoxService(db)
    try:
        stats = await service.get_vm_stats(node_id, vmid)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get VM statistics: {str(e)}"
        )


@router.post("/node/{node_id}/vm/{vmid}/start")
@require_permission("vm", "start")
async def start_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Start a VM."""
    # Check if VM is locked
    lock_reason = await check_vm_not_locked(db, vmid, node_id)
    if lock_reason:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"VM is locked: {lock_reason}"
        )
    
    service = proxmox_service.ProxmoxService(db)
    success = await service.start_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to start VM"
        )
    return {"message": "VM start command sent"}


@router.post("/node/{node_id}/vm/{vmid}/stop")
@require_permission("vm", "stop")
async def stop_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Stop a VM."""
    # Check if VM is locked
    lock_reason = await check_vm_not_locked(db, vmid, node_id)
    if lock_reason:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"VM is locked: {lock_reason}"
        )
    
    service = proxmox_service.ProxmoxService(db)
    success = await service.stop_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to stop VM"
        )
    return {"message": "VM stop command sent"}


@router.post("/node/{node_id}/vm/{vmid}/restart")
@require_permission("vm", "restart")
async def restart_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Restart a VM."""
    # Check if VM is locked
    lock_reason = await check_vm_not_locked(db, vmid, node_id)
    if lock_reason:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"VM is locked: {lock_reason}"
        )
    
    service = proxmox_service.ProxmoxService(db)
    success = await service.restart_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to restart VM"
        )
    return {"message": "VM restart command sent"}


@router.post("/node/{node_id}/vm/{vmid}/pause")
@require_permission("vm", "pause")
async def pause_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Pause a VM (suspend to RAM)."""
    # Check if VM is locked
    lock_reason = await check_vm_not_locked(db, vmid, node_id)
    if lock_reason:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"VM is locked: {lock_reason}"
        )
    
    service = proxmox_service.ProxmoxService(db)
    success = await service.pause_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to pause VM"
        )
    return {"message": "VM pause command sent"}


@router.post("/node/{node_id}/vm/{vmid}/resume")
@require_permission("vm", "resume")
async def resume_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Resume a paused VM."""
    # Check if VM is locked
    lock_reason = await check_vm_not_locked(db, vmid, node_id)
    if lock_reason:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"VM is locked: {lock_reason}"
        )
    
    service = proxmox_service.ProxmoxService(db)
    success = await service.resume_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to resume VM"
        )
    return {"message": "VM resume command sent"}


@router.post("/node/{node_id}/vm/{vmid}/shutdown")
@require_permission("vm", "shutdown")
async def shutdown_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Graceful shutdown of a VM."""
    # Check if VM is locked
    lock_reason = await check_vm_not_locked(db, vmid, node_id)
    if lock_reason:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"VM is locked: {lock_reason}"
        )
    
    service = proxmox_service.ProxmoxService(db)
    success = await service.shutdown_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to shutdown VM"
        )
    return {"message": "VM shutdown command sent"}


@router.post("/node/{node_id}/vm/{vmid}/reset")
@require_permission("vm", "reset")
async def reset_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reset a VM (hard reset)."""
    # Check if VM is locked
    lock_reason = await check_vm_not_locked(db, vmid, node_id)
    if lock_reason:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"VM is locked: {lock_reason}"
        )
    
    service = proxmox_service.ProxmoxService(db)
    success = await service.reset_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to reset VM"
        )
    return {"message": "VM reset command sent"}


# Console Access Endpoints

@router.get("/node/{node_id}/vm/{vmid}/vnc")
@require_permission("vm", "console")
async def get_vm_vnc(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get VNC console connection details for a VM."""
    service = proxmox_service.ProxmoxService(db)
    try:
        vnc_data = await service.get_vnc_websocket(node_id, vmid)
        return vnc_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/node/{node_id}/create")
@require_permission("vm", "create")
async def create_vm(
    node_id: int,
    vm_data: VMCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new VM on the specified node (background task)."""
    
    # Auto-generate VMID if not provided
    if not vm_data.vmid:
        service = proxmox_service.ProxmoxService(db)
        vm_data.vmid = await service.get_next_vmid(node_id)
    
    # Create unique task ID
    task_id = f"vm-create-{vm_data.vmid}-{int(datetime.now().timestamp())}"
    
    # Initialize task status
    active_tasks[task_id] = {
        "id": task_id,
        "status": "creating",
        "progress": 5,
        "message": "Initializing VM creation...",
        "vmid": vm_data.vmid,
        "vm_name": vm_data.name,
        "node_id": node_id,
        "started_at": datetime.now().isoformat()
    }
    
    # Add to background tasks
    background_tasks.add_task(
        create_vm_background,
        task_id,
        db,
        node_id,
        vm_data,
        current_user
    )
    
    return {
        "message": f"VM creation started for {vm_data.name}",
        "task_id": task_id,
        "vmid": vm_data.vmid
    }


async def create_vm_background(
    task_id: str,
    db: AsyncSession,
    node_id: int,
    vm_data: "VMCreateRequest",
    current_user: User
):
    """Background task to create VM with progress tracking."""
    
    def update_progress(progress: int, message: str):
        """Update task progress."""
        if task_id in active_tasks:
            active_tasks[task_id]["progress"] = progress
            active_tasks[task_id]["message"] = message
            print(f"[{task_id}] {progress}% - {message}")
    
    try:
        update_progress(10, "🔍 Checking cloud license quota...")
        
        service = proxmox_service.ProxmoxService(db)
        
        vm_dict = vm_data.model_dump()
        # Ensure agent device if requested
        if vm_data.enable_guest_agent or vm_data.provision_via_guest_agent:
            vm_dict['agent'] = 1
        
        # Cloud license quota check (max VMs)
        try:
            from sqlalchemy import func as sa_func
            from app.models.cloud_license_plan import UserCloudLicense, CloudLicensePlan
            # Find user's license
            lic_res = await db.execute(select(UserCloudLicense).where(UserCloudLicense.user_id == current_user.id))
            user_lic = lic_res.scalars().first()
            if user_lic:
                plan = await db.get(CloudLicensePlan, user_lic.plan_id)
                if plan and plan.max_vms > 0:
                    count_res = await db.execute(
                        select(sa_func.count(VMAssignment.id)).where(VMAssignment.user_id == current_user.id)
                    )
                    current_vms = count_res.scalar_one() or 0
                    if current_vms >= plan.max_vms:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cloud License limit reached: max VMs"
                        )
        except HTTPException:
            raise
        except Exception:
            # Soft-fail quota check if any unexpected error
            pass
        
        update_progress(20, "⚙️  Creating VM from template..." if (vm_data.clone_from or vm_data.template_id) else "⚙️  Creating VM...")
        
        # Clone from template if specified
        if vm_data.clone_from or vm_data.template_id:
            source_vmid = vm_data.clone_from or vm_data.template_id
            # Run in thread to avoid blocking
            result = await asyncio.to_thread(
                lambda: asyncio.run(service.clone_vm(node_id, source_vmid, vm_data.vmid, vm_data.name))
            )
        else:
            # Run in thread to avoid blocking
            result = await asyncio.to_thread(
                lambda: asyncio.run(service.create_vm(node_id, vm_dict))
            )
        
        update_progress(35, "📝 Assigning VM to user...")
        
        # Assign VM to creating user and mark if cloned
        is_cloned = bool(vm_data.clone_from or vm_data.template_id)
        source_template = vm_data.clone_from or vm_data.template_id if is_cloned else None
        assignment = VMAssignment(
            vmid=vm_data.vmid,
            node_id=node_id,
            user_id=current_user.id,
            name=vm_data.name,
            is_owner=True,
            is_locked=True,  # Lock VM during creation
            lock_reason="pending deployment",
            template_vmid=source_template,
            ip_pool_id=vm_data.ip_pool_id
        )
        db.add(assignment)
        await db.commit()
        
        update_progress(45, "🌐 Assigning IP address...")
        
        # Handle IP assignment if requested
        assigned_ip = None
        if vm_data.auto_assign_ip and vm_data.ip_pool_id:
            from app.models.ip_pool import IPPool, IPAddress
            from sqlalchemy.orm import selectinload
            
            result_pool = await db.execute(
                select(IPPool).where(IPPool.id == vm_data.ip_pool_id).options(selectinload(IPPool.ips))
            )
            pool = result_pool.scalar_one_or_none()
            
            if pool:
                # Find first available IP
                for ip_addr in pool.ips:
                    if not ip_addr.is_allocated:
                        ip_addr.is_allocated = True
                        ip_addr.vm_id = vm_data.vmid
                        assigned_ip = ip_addr.ip_address
                        await db.commit()
                        print(f"[{task_id}] Assigned IP {assigned_ip} to VM {vm_data.vmid}")
                        break
        
        update_progress(60, "☁️  Applying cloud-init configuration...")
        
        # Apply cloud-init profile and/or overrides (full user-data via cicustom)
        from app.models.cloud_init import CloudInitProfile
        from app.api.cloud_init import (
            generate_cloud_init_yaml,
            get_available_variables,
            _resolve_vm_network_config,
            VmCloudInitOverridesApply,
            _apply_overrides_to_profile,
        )

        should_apply_cloud_init = bool(vm_data.cloud_init_profile_id) or any([
            vm_data.default_user is not None,
            vm_data.default_password is not None,
            vm_data.ssh_authorized_keys is not None,
            vm_data.ssh_pwauth is not None,
            vm_data.packages is not None,
            vm_data.apt_update is not None,
            vm_data.apt_upgrade is not None,
            vm_data.apt_reboot_if_required is not None,
            vm_data.docker_compose_content is not None,
            vm_data.docker_compose_path is not None,
            vm_data.start_docker_compose is not None,
            vm_data.timezone is not None,
            vm_data.locale is not None,
        ])

        if should_apply_cloud_init and not vm_data.provision_via_guest_agent:
            base_profile: Optional[CloudInitProfile] = None
            if vm_data.cloud_init_profile_id:
                base_profile = await db.get(CloudInitProfile, vm_data.cloud_init_profile_id)

            if not base_profile:
                # Create a minimal transient profile to apply overrides only
                base_profile = CloudInitProfile(
                    id=0,
                    name=f"vm-{vm_data.vmid}-overrides",
                )

            # Build overrides payload from request
            overrides = VmCloudInitOverridesApply(
                node_id=node_id,
                vmid=vm_data.vmid,
                profile_id=None,
                default_user=vm_data.default_user,
                default_password=vm_data.default_password,
                ssh_authorized_keys=vm_data.ssh_authorized_keys,
                ssh_pwauth=vm_data.ssh_pwauth,
                packages=vm_data.packages,
                apt_update=vm_data.apt_update,
                apt_upgrade=vm_data.apt_upgrade,
                apt_reboot_if_required=vm_data.apt_reboot_if_required,
                docker_compose_content=vm_data.docker_compose_content,
                docker_compose_path=vm_data.docker_compose_path,
                start_docker_compose=vm_data.start_docker_compose,
                timezone=vm_data.timezone,
                locale=vm_data.locale,
            )

            # Apply overrides onto base profile
            merged_profile = _apply_overrides_to_profile(base_profile, overrides)

            # Resolve VM network after assignment
            vm_network = await _resolve_vm_network_config(db, vm_data.vmid)

            # Build variables
            vm_info = {
                "vmid": vm_data.vmid,
                "name": vm_data.name,
                "hostname": vm_data.name or f"vm-{vm_data.vmid}",
            }
            if vm_network and vm_network.get("ip_address"):
                vm_info["ip"] = vm_network.get("ip_address")
            variables = get_available_variables(current_user, vm_info)

            # Generate full cloud-init user-data YAML
            userdata = await generate_cloud_init_yaml(merged_profile, variables, vm_network)

            # Apply as snippet and regenerate ISO
            ok = await service.apply_cloud_init_user_data(node_id, vm_data.vmid, userdata, storage="local")
            if not ok:
                print(f"[{task_id}] Warning: Failed to apply cloud-init user-data to VM {vm_data.vmid}")
            else:
                print(f"[{task_id}] Applied user-data snippet to VM {vm_data.vmid} and regenerated ISO")

        update_progress(80, "🤖 Provisioning guest agent (if enabled)...")
        
        # Optionally provision inside guest via QEMU Guest Agent (Virtualizor-style)
        if vm_data.provision_via_guest_agent:
            # Build provisioning config from overrides
            cfg: Dict[str, Any] = {}
            if vm_data.default_user:
                cfg['default_user'] = vm_data.default_user
            if vm_data.default_password:
                # Hash on server using existing helper
                from app.api.cloud_init import _ensure_hashed_password
                cfg['password_hash'] = _ensure_hashed_password(vm_data.default_password)
            if vm_data.ssh_authorized_keys:
                cfg['ssh_authorized_keys'] = vm_data.ssh_authorized_keys
            if vm_data.ssh_pwauth is not None:
                cfg['ssh_pwauth'] = vm_data.ssh_pwauth
            if vm_data.packages:
                cfg['packages'] = vm_data.packages
            # Host settings
            cfg['hostname'] = vm_data.name
            if vm_data.timezone:
                cfg['timezone'] = vm_data.timezone
            # Compose
            if vm_data.docker_compose_content:
                cfg['docker_compose_content'] = vm_data.docker_compose_content
                if vm_data.docker_compose_path:
                    cfg['docker_compose_path'] = vm_data.docker_compose_path
                if vm_data.start_docker_compose is not None:
                    cfg['start_docker_compose'] = vm_data.start_docker_compose

            # Netplan from resolver
            vm_network = await _resolve_vm_network_config(db, vm_data.vmid)
            if vm_network and (vm_network.get('enable_dhcp') or vm_network.get('ip_address')):
                from app.api.provision import _yaml_network_from_vm_net
                cfg['network_yaml'] = _yaml_network_from_vm_net(vm_network)
            else:
                print(f"[{task_id}] Skipping network config: vm_network={vm_network}")

            # Start VM before provisioning
            update_progress(82, "▶️  Starting VM for provisioning...")
            await service.start_vm(node_id, vm_data.vmid)
            
            # Wait for VM to boot (check status)
            import time
            max_wait = 120  # 2 minutes
            waited = 0
            while waited < max_wait:
                await asyncio.sleep(5)
                waited += 5
                vm_status = await service.get_vm_status(node_id, vm_data.vmid)
                if vm_status and vm_status.get('status') == 'running':
                    print(f"[{task_id}] VM started and running after {waited}s")
                    break
            
            # Give guest agent time to start
            update_progress(85, "⏳ Waiting for guest agent...")
            await asyncio.sleep(10)
            
            # Execute provisioning as separate background task (fire-and-forget)
            update_progress(87, "🤖 Queueing provisioning task...")
            print(f"[{task_id}] Queuing provisioning task for VM {vm_data.vmid}")
            
            # Create provision task ID
            provision_task_id = f"provision-{node_id}-{vm_data.vmid}-{int(datetime.now().timestamp())}"
            active_tasks[provision_task_id] = {
                "id": provision_task_id,
                "type": "provision",
                "status": "running",
                "progress": 0,
                "message": "Starting provisioning...",
                "node_id": node_id,
                "vmid": vm_data.vmid,
                "started_at": datetime.now().isoformat()
            }
            print(f"[{task_id}] Created provision task: {provision_task_id}")
            
            # Start provisioning in background (don't await it)
            from app.api.provision import provision_vm_background
            asyncio.create_task(provision_vm_background(provision_task_id, node_id, vm_data.vmid, cfg))
            print(f"[{task_id}] Queued provision task: {provision_task_id}")
            
            update_progress(100, f"✅ VM {vm_data.vmid} created. Provisioning in background...")
        
        # Unlock VM after successful creation (unless provisioning will run)
        if not vm_data.provision_via_guest_agent:
            # Unlock now if no provisioning needed
            assignment = await db.get(VMAssignment, assignment.id) if 'assignment' in locals() else None
            if not assignment:
                # Fetch by vmid and user_id if assignment variable not available
                result = await db.execute(
                    select(VMAssignment).where(
                        VMAssignment.vmid == vm_data.vmid,
                        VMAssignment.user_id == current_user.id
                    )
                )
                assignment = result.scalar_one_or_none()
            
            if assignment:
                assignment.is_locked = False
                assignment.lock_reason = None
                await db.commit()
        else:
            # Keep locked during provisioning - will be unlocked by provision_vm_background task
            print(f"[{task_id}] VM remains locked during provisioning")
        
        active_tasks[task_id]["status"] = "completed"
        active_tasks[task_id]["assigned_ip"] = assigned_ip
        active_tasks[task_id]["completed_at"] = datetime.now().isoformat()
        archive_task(task_id)
        
    except Exception as e:
        print(f"[{task_id}] Error creating VM: {e}")
        import traceback
        traceback.print_exc()
        
        update_progress(0, f"❌ Error: {str(e)[:200]}")
        active_tasks[task_id]["status"] = "failed"
        active_tasks[task_id]["error"] = str(e)
        active_tasks[task_id]["completed_at"] = datetime.now().isoformat()
        archive_task(task_id)


@router.get("/node/{node_id}/templates")
@require_permission("vm", "read")
async def list_templates(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List available VM templates on a node."""
    service = proxmox_service.ProxmoxService(db)
    templates = await service.list_templates(node_id)
    return {"templates": templates}


@router.delete("/node/{node_id}/templates/{vmid}")
@require_permission("vm", "delete")
async def delete_template(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a VM template (safety check to ensure it's a template)."""
    service = proxmox_service.ProxmoxService(db)

    # Confirm target is a template before deletion
    cfg = await service.get_vm_config(node_id, vmid)
    if not cfg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    if cfg.get("template") not in (1, True, "1", "true"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="VM is not a template")

    try:
        success = await service.delete_vm(node_id, vmid)
        if not success:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete template")
        return {"message": "Template deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/node/{node_id}/isos")
@require_permission("iso", "read")
async def list_isos(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List available ISO images on a node."""
    service = proxmox_service.ProxmoxService(db)
    isos = await service.list_isos(node_id)
    return {"isos": isos}


@router.get("/node/{node_id}/storages")
@require_permission("storage", "read")
async def list_storages(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List available storage options on a node."""
    service = proxmox_service.ProxmoxService(db)
    storages = await service.list_storages(node_id)
    return {"storages": storages}


@router.get("/node/{node_id}/nextid")
@require_permission("vm", "create")
async def get_next_vmid(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the next available VM ID."""
    service = proxmox_service.ProxmoxService(db)
    nextid = await service.get_next_vmid(node_id)
    return {"nextid": nextid}


@router.post("/node/{node_id}/upload-iso")
@require_permission("iso", "upload")
async def upload_iso(
    node_id: int,
    storage: str,
    filename: str,
    url: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Download ISO from URL to Proxmox storage."""
    service = proxmox_service.ProxmoxService(db)
    try:
        result = await service.download_iso(node_id, storage, filename, url)
        return {
            "message": "ISO download started",
            "task": result
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to download ISO: {str(e)}"
        )


@router.delete("/node/{node_id}/vm/{vmid}")
@require_permission("vm", "delete")
async def delete_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a VM."""
    # Check if VM is locked
    lock_reason = await check_vm_not_locked(db, vmid, node_id)
    if lock_reason:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"VM is locked: {lock_reason}"
        )
    
    service = proxmox_service.ProxmoxService(db)
    success = await service.delete_vm(node_id, vmid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete VM"
        )
    
    # Release allocated IPs
    from app.models.ip_pool import IPAddress
    result = await db.execute(
        select(IPAddress).where(IPAddress.vm_id == vmid)
    )
    ip_addresses = result.scalars().all()
    for ip_addr in ip_addresses:
        ip_addr.is_allocated = False
        ip_addr.vm_id = None
    await db.commit()
    
    # Remove VM assignments
    result = await db.execute(
        select(VMAssignment).where(VMAssignment.vmid == vmid)
    )
    assignments = result.scalars().all()
    for assignment in assignments:
        await db.delete(assignment)
    await db.commit()
    
    return {"message": "VM deleted successfully"}


@router.post("/node/{node_id}/vm/{vmid}/lock")
@require_permission("vm", "update")
async def lock_vm(
    node_id: int,
    vmid: int,
    lock_request: VMLockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lock a VM to prevent any changes."""
    # Find VM assignment
    result = await db.execute(
        select(VMAssignment).where(
            VMAssignment.vmid == vmid,
            VMAssignment.node_id == node_id
        )
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM not found in assignments"
        )
    
    # Check permission (owner or admin)
    if assignment.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only VM owner or admin can lock VM"
        )
    
    # Lock the VM
    assignment.is_locked = True
    assignment.lock_reason = lock_request.reason
    await db.commit()
    
    return {
        "message": f"VM {vmid} locked",
        "reason": lock_request.reason
    }


@router.post("/node/{node_id}/vm/{vmid}/unlock")
@require_permission("vm", "update")
async def unlock_vm(
    node_id: int,
    vmid: int,
    unlock_request: VMUnlockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Unlock a VM to allow changes."""
    # Find VM assignment
    result = await db.execute(
        select(VMAssignment).where(
            VMAssignment.vmid == vmid,
            VMAssignment.node_id == node_id
        )
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM not found in assignments"
        )
    
    # Check permission (owner or admin)
    if assignment.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only VM owner or admin can unlock VM"
        )
    
    # Unlock the VM
    assignment.is_locked = False
    assignment.lock_reason = None
    await db.commit()
    
    return {
        "message": f"VM {vmid} unlocked"
    }


@router.post("/node/{node_id}/vm/{vmid}/clone")
@require_permission("vm", "create")
async def clone_vm(
    node_id: int,
    vmid: int,
    clone_data: VMCloneRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Clone a VM or template."""
    service = proxmox_service.ProxmoxService(db)
    try:
        result = await service.clone_vm(
            node_id=node_id,
            vmid=vmid,
            newid=clone_data.newid,
            name=clone_data.name,
            full=clone_data.full,
            storage=clone_data.storage,
            description=clone_data.description
        )
        
        # Create VM assignment and mark as locked if cloned from template
        assignment = VMAssignment(
            vmid=clone_data.newid,
            node_id=node_id,
            user_id=current_user.id,
            name=clone_data.name or f"vm-{clone_data.newid}",
            is_owner=True,
            is_locked=True,  # Mark as locked since cloned
            template_vmid=vmid  # Track source template
        )
        db.add(assignment)
        await db.commit()
        
        return {
            "upid": result,
            "message": "Clone task started",
            "newid": clone_data.newid,
            "is_locked": True
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to clone VM: {str(e)}"
        )


@router.post("/node/{node_id}/vm/{vmid}/reinstall")
@require_permission("vm", "update")
async def reinstall_vm_os(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reinstall OS by re-cloning from template. Only works for cloned VMs."""
    service = proxmox_service.ProxmoxService(db)
    
    try:
        # Get VM assignment to find the source template
        result = await db.execute(
            select(VMAssignment).where(
                (VMAssignment.vmid == vmid) & 
                (VMAssignment.is_locked == True) &
                (VMAssignment.template_vmid.isnot(None))
            )
        )
        assignment = result.scalar_one_or_none()
        
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="VM is not a cloned VM or cannot be reinstalled"
            )
        
        # Check if user owns this VM
        if assignment.user_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to reinstall this VM"
            )
        
        # Delete the VM first
        await service.delete_vm(node_id, vmid)
        
        # Get VM name for the clone
        vm_name = assignment.name or f"vm-{vmid}"
        
        # Re-clone from template
        clone_result = await service.clone_vm(
            node_id=node_id,
            vmid=assignment.template_vmid,  # Clone from original template
            newid=vmid,
            name=vm_name,
            full=1,
            storage=None,
            description=f"Reinstalled from template {assignment.template_vmid}"
        )
        
        return {
            "message": "OS reinstall task started",
            "vmid": vmid,
            "upid": clone_result,
            "template_vmid": assignment.template_vmid
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to reinstall VM: {str(e)}"
        )


# Snapshot management
@router.get("/node/{node_id}/vm/{vmid}/snapshots")
@require_permission("snapshot", "read")
async def list_snapshots(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List VM snapshots."""
    service = proxmox_service.ProxmoxService(db)
    snapshots = await service.list_snapshots(node_id, vmid)
    return {"snapshots": snapshots}


@router.post("/node/{node_id}/vm/{vmid}/snapshot")
@require_permission("snapshot", "create")
async def create_snapshot(
    node_id: int,
    vmid: int,
    snapname: str,
    description: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a VM snapshot."""
    service = ProxmoxService(db)
    try:
        result = await service.create_snapshot(node_id, vmid, snapname, description)
        return {
            "message": "Snapshot created successfully",
            "snapname": snapname,
            "task": result
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create snapshot: {str(e)}"
        )


@router.delete("/node/{node_id}/vm/{vmid}/snapshot/{snapname}")
@require_permission("snapshot", "delete")
async def delete_snapshot(
    node_id: int,
    vmid: int,
    snapname: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a VM snapshot."""
    service = ProxmoxService(db)
    success = await service.delete_snapshot(node_id, vmid, snapname)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete snapshot"
        )
    return {"message": "Snapshot deleted successfully"}


@router.post("/node/{node_id}/vm/{vmid}/snapshot/{snapname}/rollback")
@require_permission("snapshot", "rollback")
async def rollback_snapshot(
    node_id: int,
    vmid: int,
    snapname: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Rollback VM to a snapshot."""
    service = ProxmoxService(db)
    try:
        result = await service.rollback_snapshot(node_id, vmid, snapname)
        return {
            "message": "Snapshot rollback initiated",
            "snapname": snapname,
            "task": result
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to rollback snapshot: {str(e)}"
        )


@router.put("/node/{node_id}/vm/{vmid}/config")
@require_permission("vm", "update")
async def update_vm_config(
    node_id: int,
    vmid: int,
    config: VMConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update VM configuration (CPU, memory, name, description)."""
    service = ProxmoxService(db)
    try:
        # Build config dict with only provided values
        config_dict = config.model_dump(exclude_none=True)
        if not config_dict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No configuration changes provided"
            )
        
        result = await service.update_vm_config(node_id, vmid, config_dict)
        
        # If name was changed, trigger reprovision to update hostname
        if config.name:
            from app.api.cloud_init import _resolve_vm_network_config, _build_default_network_block
            import yaml
            
            stmt = select(VMAssignment).where(
                VMAssignment.vmid == vmid,
                VMAssignment.node_id == node_id
            )
            assignment_result = await db.execute(stmt)
            assignment = assignment_result.scalar_one_or_none()
            
            if assignment:
                # Update VM name in assignment
                assignment.name = config.name
                
                # Trigger reprovision with new hostname
                reprov_config = {
                    'hostname': config.name
                }
                
                # Include network config
                vm_net = await _resolve_vm_network_config(db, vmid)
                if vm_net and (vm_net.get('enable_dhcp') or vm_net.get('ip_address')):
                    network_block = _build_default_network_block(vm_net)
                    reprov_config['network_yaml'] = yaml.dump(network_block, default_flow_style=False)
                
                assignment.set_pending_provision(reprov_config)
                await db.commit()
                print(f"[VM Config Update] Triggered reprovision for VM {vmid} with new hostname: {config.name}")
        
        return {
            "message": "VM configuration updated successfully",
            "task": result
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update VM configuration: {str(e)}"
        )


@router.post("/node/{node_id}/vm/{vmid}/template")
@require_permission("vm", "update")
async def convert_to_template(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Convert a VM to a template."""
    service = ProxmoxService(db)
    try:
        result = await service.convert_to_template(node_id, vmid)
        return {
            "message": "VM converted to template successfully",
            "task": result
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to convert VM to template: {str(e)}"
        )


@router.get("/node/{node_id}/vm/{vmid}/config")
@require_permission("vm", "read")
async def get_vm_config(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get VM configuration details."""
    service = proxmox_service.ProxmoxService(db)
    config = await service.get_vm_config(node_id, vmid)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM not found"
        )
    return config


# VM Assignment endpoints
@router.post("/node/{node_id}/vm/{vmid}/assign/{user_id}")
@require_permission("vm", "assign")
async def assign_vm_to_user(
    node_id: int,
    vmid: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Assign a VM to a user (admin only)."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can assign VMs"
        )
    
    # Check if assignment already exists
    result = await db.execute(
        select(VMAssignment).where(
            VMAssignment.vmid == vmid,
            VMAssignment.user_id == user_id
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VM already assigned to this user"
        )
    
    # Get VM name from Proxmox
    service = ProxmoxService(db)
    vm_status = await service.get_vm_status(node_id, vmid)
    vm_name = vm_status.get('name', f'VM-{vmid}') if vm_status else f'VM-{vmid}'
    
    assignment = VMAssignment(
        vmid=vmid,
        node_id=node_id,
        user_id=user_id,
        name=vm_name,
        is_owner=False
    )
    db.add(assignment)
    await db.commit()
    
    return {"message": "VM assigned successfully"}


@router.delete("/node/{node_id}/vm/{vmid}/assign/{user_id}")
@require_permission("vm", "assign")
async def unassign_vm_from_user(
    node_id: int,
    vmid: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove VM assignment from a user (admin only)."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can unassign VMs"
        )
    
    result = await db.execute(
        select(VMAssignment).where(
            VMAssignment.vmid == vmid,
            VMAssignment.user_id == user_id
        )
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    await db.delete(assignment)
    await db.commit()
    
    return {"message": "VM unassigned successfully"}


@router.get("/assignments")
@require_permission("vm", "read")
async def list_vm_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all VM assignments (admin sees all, users see their own)."""
    if current_user.is_superuser:
        result = await db.execute(select(VMAssignment))
    else:
        result = await db.execute(
            select(VMAssignment).where(VMAssignment.user_id == current_user.id)
        )
    
    assignments = result.scalars().all()
    return {"assignments": [
        {
            "id": a.id,
            "vmid": a.vmid,
            "node_id": a.node_id,
            "user_id": a.user_id,
            "name": a.name,
            "is_owner": a.is_owner,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
        for a in assignments
    ]}

# Disk Management Endpoints

class DiskCreateRequest(BaseModel):
    """Request model for adding a disk to a VM."""
    storage: str = Field(..., description="Storage name (e.g., local-lvm)")
    size: int = Field(..., ge=1, description="Disk size in GB")
    type: str = Field(default="scsi", description="Disk type: scsi, sata, virtio, ide")
    format: str = Field(default="raw", description="Disk format: raw or qcow2")
    cache: Optional[str] = Field(default="none", description="Cache mode")
    discard: Optional[str] = Field(default="on", description="Discard/TRIM support")


class DiskResizeRequest(BaseModel):
    """Request model for resizing a disk."""
    disk: str = Field(..., description="Disk device name (e.g., scsi0)")
    size: str = Field(..., description="Size to add (e.g., +10G)")


@router.get("/node/{node_id}/vm/{vmid}/disks")
@require_permission("vm", "read")
async def list_vm_disks(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all disks attached to a VM."""
    service = proxmox_service.ProxmoxService(db)
    try:
        disks = await service.list_vm_disks(node_id, vmid)
        return {"disks": disks}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/node/{node_id}/vm/{vmid}/disks")
@require_permission("disk", "create")
async def add_vm_disk(
    node_id: int,
    vmid: int,
    disk_config: DiskCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a new disk to a VM."""
    service = ProxmoxService(db)
    try:
        await service.add_vm_disk(node_id, vmid, disk_config.dict())
        return {"message": "Disk added successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/node/{node_id}/vm/{vmid}/disks/resize")
@require_permission("disk", "update")
async def resize_vm_disk(
    node_id: int,
    vmid: int,
    resize_request: DiskResizeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Resize a VM disk (can only increase size)."""
    # Check if VM is locked
    lock_reason = await check_vm_not_locked(db, vmid, node_id)
    if lock_reason:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"VM is locked: {lock_reason}"
        )
    
    service = ProxmoxService(db)
    try:
        await service.resize_vm_disk(node_id, vmid, resize_request.disk, resize_request.size)
        return {"message": "Disk resize initiated"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/node/{node_id}/vm/{vmid}/disks/{disk}")
@require_permission("disk", "delete")
async def delete_vm_disk(
    node_id: int,
    vmid: int,
    disk: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete/detach a disk from a VM."""
    service = ProxmoxService(db)
    try:
        await service.delete_vm_disk(node_id, vmid, disk)
        return {"message": "Disk deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# Network Interface Management Endpoints

class NetworkInterfaceCreateRequest(BaseModel):
    """Request model for adding a network interface to a VM."""
    model: str = Field(default="virtio", description="Network model: virtio, e1000, rtl8139")
    bridge: str = Field(default="vmbr0", description="Network bridge")
    macaddr: Optional[str] = Field(None, description="MAC address (auto-generated if not provided)")
    firewall: Optional[int] = Field(default=1, description="Enable firewall (1=yes, 0=no)")
    rate: Optional[int] = Field(None, description="Rate limit in MB/s")
    tag: Optional[int] = Field(None, description="VLAN tag")


class NetworkInterfaceUpdateRequest(BaseModel):
    """Request model for updating a network interface."""
    model: Optional[str] = Field(None, description="Network model")
    bridge: Optional[str] = Field(None, description="Network bridge")
    macaddr: Optional[str] = Field(None, description="MAC address")
    firewall: Optional[int] = Field(None, description="Enable firewall")
    rate: Optional[int] = Field(None, description="Rate limit in MB/s")
    tag: Optional[int] = Field(None, description="VLAN tag")


@router.get("/node/{node_id}/vm/{vmid}/network")
@require_permission("vm", "read")
async def list_vm_network_interfaces(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all network interfaces attached to a VM."""
    service = proxmox_service.ProxmoxService(db)
    try:
        interfaces = await service.list_vm_network_interfaces(node_id, vmid)
        return {"interfaces": interfaces}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/node/{node_id}/vm/{vmid}/network")
@require_permission("network", "create")
async def add_vm_network_interface(
    node_id: int,
    vmid: int,
    interface_config: NetworkInterfaceCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a new network interface to a VM."""
    service = ProxmoxService(db)
    try:
        await service.add_vm_network_interface(node_id, vmid, interface_config.dict(exclude_none=True))
        return {"message": "Network interface added successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put("/node/{node_id}/vm/{vmid}/network/{interface}")
@require_permission("network", "update")
async def update_vm_network_interface(
    node_id: int,
    vmid: int,
    interface: str,
    interface_config: NetworkInterfaceUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing network interface."""
    service = ProxmoxService(db)
    try:
        # Filter out None values
        config_dict = {k: v for k, v in interface_config.dict().items() if v is not None}
        await service.update_vm_network_interface(node_id, vmid, interface, config_dict)
        return {"message": "Network interface updated successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/node/{node_id}/vm/{vmid}/network/{interface}")
@require_permission("network", "delete")
async def delete_vm_network_interface(
    node_id: int,
    vmid: int,
    interface: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete/detach a network interface from a VM."""
    service = ProxmoxService(db)
    try:
        await service.delete_vm_network_interface(node_id, vmid, interface)
        return {"message": "Network interface deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/node/{node_id}/network/bridges")
@require_permission("node", "read")
async def list_network_bridges(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List available network bridges on a node."""
    service = ProxmoxService(db)
    try:
        bridges = await service.list_network_bridges(node_id)
        return {"bridges": bridges}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/node/{node_id}/vm/{vmid}/cdrom/mount")
@require_permission("iso", "upload")
async def mount_iso_to_vm(
    node_id: int,
    vmid: int,
    iso_volid: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mount an ISO image to a VM's CD-ROM drive."""
    service = ProxmoxService(db)
    try:
        await service.mount_iso_to_vm(node_id, vmid, iso_volid)
        return {"message": "ISO mounted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/node/{node_id}/vm/{vmid}/cdrom/unmount")
@require_permission("iso", "upload")
async def unmount_iso_from_vm(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Unmount the ISO from a VM's CD-ROM drive."""
    service = ProxmoxService(db)
    try:
        await service.unmount_iso_from_vm(node_id, vmid)
        return {"message": "ISO unmounted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/node/{node_id}/vm/{vmid}/boot-order")
@require_permission("vm", "read")
async def get_vm_boot_order(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get VM boot order configuration."""
    service = ProxmoxService(db)
    try:
        boot_info = await service.get_vm_boot_order(node_id, vmid)
        return boot_info
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put("/node/{node_id}/vm/{vmid}/boot-order")
@require_permission("vm", "update")
async def set_vm_boot_order(
    node_id: int,
    vmid: int,
    boot_request: VMBootOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Set VM boot order.
    
    Boot order codes:
    - c: disk (hard drive)
    - d: cdrom (CD/DVD)
    - n: network (PXE)
    - a: floppy
    
    Example: 'cdn' boots from CD, then disk, then network
    """
    service = ProxmoxService(db)
    try:
        await service.set_vm_boot_order(node_id, vmid, boot_request.boot_order)
        return {"message": "Boot order updated successfully", "boot_order": boot_request.boot_order}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# Disk Management Endpoints

@router.get("/node/{node_id}/vm/{vmid}/disks")
@require_permission("vm", "read")
async def list_vm_disks(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all disks attached to a VM."""
    service = ProxmoxService(db)
    try:
        disks = await service.list_vm_disks(node_id, vmid)
        return disks
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list disks: {str(e)}"
        )


@router.post("/node/{node_id}/vm/{vmid}/disks")
@require_permission("vm", "update")
async def add_vm_disk(
    node_id: int,
    vmid: int,
    disk_config: VMDiskAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a new disk to a VM."""
    service = ProxmoxService(db)
    try:
        disk_id = await service.add_vm_disk(node_id, vmid, disk_config.model_dump())
        return {
            "message": "Disk added successfully",
            "disk_id": disk_id
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add disk: {str(e)}"
        )


@router.put("/node/{node_id}/vm/{vmid}/disks/{disk_id}/resize")
@require_permission("vm", "update")
async def resize_vm_disk(
    node_id: int,
    vmid: int,
    disk_id: str,
    resize_config: VMDiskResizeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Resize a VM disk (can only increase size)."""
    import traceback
    service = ProxmoxService(db)
    try:
        print(f"Resize disk request: node_id={node_id}, vmid={vmid}, disk_id={disk_id}, size_increment={resize_config.size_increment}")
        success = await service.resize_vm_disk(node_id, vmid, disk_id, resize_config.size_increment)
        print(f"Resize result: {success}")
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to resize disk"
            )
        return {"message": f"Disk {disk_id} resize initiated"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Exception in resize_vm_disk: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resize disk: {str(e)}"
        )


@router.delete("/node/{node_id}/vm/{vmid}/disks/{disk_id}")
@require_permission("vm", "update")
async def delete_vm_disk(
    node_id: int,
    vmid: int,
    disk_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a disk from a VM."""
    service = ProxmoxService(db)
    try:
        success = await service.delete_vm_disk(node_id, vmid, disk_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete disk"
            )
        return {"message": f"Disk {disk_id} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete disk: {str(e)}"
        )


# Network Interface Management Endpoints

@router.get("/node/{node_id}/vm/{vmid}/network-interfaces")
@require_permission("vm", "read")
async def list_vm_network_interfaces(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all network interfaces attached to a VM."""
    service = ProxmoxService(db)
    try:
        interfaces = await service.list_vm_network_interfaces(node_id, vmid)
        return interfaces
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list network interfaces: {str(e)}"
        )


@router.post("/node/{node_id}/vm/{vmid}/network-interfaces")
@require_permission("vm", "update")
async def add_vm_network_interface(
    node_id: int,
    vmid: int,
    net_config: VMNetworkInterfaceAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a new network interface to a VM."""
    service = ProxmoxService(db)
    try:
        net_id = await service.add_vm_network_interface(node_id, vmid, net_config.model_dump())
        return {
            "message": "Network interface added successfully",
            "interface_id": net_id
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add network interface: {str(e)}"
        )


@router.put("/node/{node_id}/vm/{vmid}/network-interfaces/{net_id}")
@require_permission("vm", "update")
async def update_vm_network_interface(
    node_id: int,
    vmid: int,
    net_id: str,
    net_config: VMNetworkInterfaceUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a VM network interface configuration."""
    service = ProxmoxService(db)
    try:
        success = await service.update_vm_network_interface(node_id, vmid, net_id, net_config.model_dump(exclude_none=True))
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update network interface"
            )
        return {"message": f"Network interface {net_id} updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update network interface: {str(e)}"
        )


@router.delete("/node/{node_id}/vm/{vmid}/network-interfaces/{net_id}")
@require_permission("vm", "update")
async def delete_vm_network_interface(
    node_id: int,
    vmid: int,
    net_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a network interface from a VM."""
    service = ProxmoxService(db)
    try:
        success = await service.delete_vm_network_interface(node_id, vmid, net_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete network interface"
            )
        return {"message": f"Network interface {net_id} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete network interface: {str(e)}"
        )


class QueueProvisionRequest(BaseModel):
    """Request model for queueing provision for agent."""
    default_user: Optional[str] = None
    default_password: Optional[str] = None
    ssh_authorized_keys: Optional[List[str]] = None
    ssh_pwauth: Optional[bool] = None
    packages: Optional[List[str]] = None
    hostname: Optional[str] = None
    timezone: Optional[str] = None
    docker_compose_content: Optional[str] = None
    docker_compose_path: Optional[str] = "/root/docker-compose.yml"
    start_docker_compose: Optional[bool] = False
    docker_registry_url: Optional[str] = None
    docker_registry_username: Optional[str] = None
    docker_registry_password: Optional[str] = None
    write_network: bool = True


@router.post("/{node_id}/{vmid}/queue-provision")
@require_permission("vm", "update")
async def queue_provision_for_agent(
    node_id: int,
    vmid: int,
    req: QueueProvisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Queue a provision configuration for the agent to pick up and execute.
    
    This is used by the frontend retry provision button to queue work for the agent
    instead of executing immediately via QEMU guest agent.
    """
    from app.api.cloud_init import _ensure_hashed_password, _resolve_vm_network_config, _build_default_network_block
    import yaml
    
    # Get VM assignment
    result = await db.execute(
        select(VMAssignment).where(
            VMAssignment.vmid == vmid,
            VMAssignment.node_id == node_id
        )
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM assignment not found"
        )
    
    # Build config
    config: Dict[str, Any] = {}
    if req.default_user:
        config['default_user'] = req.default_user
    if req.default_password:
        config['password_hash'] = _ensure_hashed_password(req.default_password)
    if req.ssh_authorized_keys:
        config['ssh_authorized_keys'] = req.ssh_authorized_keys
    if req.ssh_pwauth is not None:
        config['ssh_pwauth'] = req.ssh_pwauth
    if req.packages:
        config['packages'] = req.packages
    
    # Always use VM assignment name as hostname
    if assignment.name:
        config['hostname'] = assignment.name
        print(f"[Queue Provision] Setting hostname from VM assignment: {assignment.name}")
    elif req.hostname:
        config['hostname'] = req.hostname
        print(f"[Queue Provision] Using provided hostname: {req.hostname}")
    else:
        config['hostname'] = f"vm-{vmid}"
        print(f"[Queue Provision] Using default hostname: vm-{vmid}")
    
    if req.timezone:
        config['timezone'] = req.timezone
    if req.docker_compose_content:
        config['docker_compose_content'] = req.docker_compose_content
        config['docker_compose_path'] = req.docker_compose_path
        config['start_docker_compose'] = req.start_docker_compose
        config['install_docker'] = True
    if req.docker_registry_url and req.docker_registry_username and req.docker_registry_password:
        config['docker_registry_url'] = req.docker_registry_url
        config['docker_registry_username'] = req.docker_registry_username
        config['docker_registry_password'] = req.docker_registry_password
        config['install_docker'] = True
    
    # Network config removed from agent provisioning - cloud-init handles primary NIC
    # If you need secondary/additional NICs, manually add network_yaml to the config
    
    # Set pending provision
    assignment.set_pending_provision(config)
    await db.commit()
    
    return {
        "message": "Provision queued for agent",
        "vmid": vmid,
        "provision_pending": True,
        "agent_installed": assignment.agent_installed
    }


@router.get("/{node_id}/{vmid}/pending-provision")
@require_permission("vm", "read")
async def get_pending_provision(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get pending provision status and config for a VM."""
    result = await db.execute(
        select(VMAssignment).where(
            VMAssignment.vmid == vmid,
            VMAssignment.node_id == node_id
        )
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM assignment not found"
        )
    
    return {
        "provision_pending": assignment.provision_pending,
        "pending_config": assignment.get_pending_provision_config() if assignment.provision_pending else None,
        "agent_installed": assignment.agent_installed,
        "last_agent_checkin": assignment.last_agent_checkin.isoformat() if assignment.last_agent_checkin else None
    }


# ---------------------------- Compose Templates ----------------------------


@router.get("/compose-templates")
@require_permission("vm", "read")
async def list_compose_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(ComposeTemplate))
    templates = result.scalars().all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "content": t.content,
            "variables": json.loads(t.variables) if t.variables else [],
            "auto_update": t.auto_update,
        }
        for t in templates
    ]


@router.post("/compose-templates")
@require_permission("vm", "update")
async def create_compose_template(
    tpl: ComposeTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tmpl = ComposeTemplate(
        name=tpl.name,
        description=tpl.description,
        content=tpl.content,
        variables=json.dumps(tpl.variables) if tpl.variables else None,
        auto_update=tpl.auto_update,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return {"id": tmpl.id, "message": "Template created"}


@router.put("/compose-templates/{template_id}")
@require_permission("vm", "update")
async def update_compose_template(
    template_id: int,
    tpl: ComposeTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(ComposeTemplate).where(ComposeTemplate.id == template_id))
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    tmpl.name = tpl.name
    tmpl.description = tpl.description
    tmpl.content = tpl.content
    tmpl.variables = json.dumps(tpl.variables) if tpl.variables else None
    tmpl.auto_update = tpl.auto_update
    await db.commit()
    return {"message": "Template updated"}


@router.delete("/compose-templates/{template_id}")
@require_permission("vm", "update")
async def delete_compose_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await db.execute(
        ComposeTemplate.__table__.delete().where(ComposeTemplate.id == template_id)
    )
    await db.commit()
    return {"message": "Template deleted"}


def _render_template(content: str, variables: Dict[str, Any]) -> str:
    try:
        return content.format(**variables)
    except Exception:
        return content


# ---------------------------- VM Compose Files ----------------------------


@router.get("/{node_id}/{vmid}/compose-files")
@require_permission("vm", "read")
async def list_compose_files(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(VMAssignment).where(VMAssignment.vmid == vmid, VMAssignment.node_id == node_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="VM not found")
    return assignment.get_compose_files()


@router.post("/{node_id}/{vmid}/compose-files")
@require_permission("vm", "update")
async def add_compose_file(
    node_id: int,
    vmid: int,
    body: ComposeFileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(VMAssignment).where(VMAssignment.vmid == vmid, VMAssignment.node_id == node_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="VM not found")

    entry = body.model_dump()
    if not entry.get('id'):
        entry['id'] = f"cf-{int(datetime.now().timestamp()*1000)}"

    files = assignment.get_compose_files()
    files.append(entry)
    assignment.set_compose_files(files)

    # Queue reprovision
    cfg = assignment.get_pending_provision_config() or {}
    cfg['docker_compose_files'] = files
    cfg['install_docker'] = True
    assignment.provision_pending = True
    assignment.set_pending_provision(cfg)
    await db.commit()
    return {"message": "Compose file added", "entry": entry, "provision_pending": True}


@router.put("/{node_id}/{vmid}/compose-files/{compose_id}")
@require_permission("vm", "update")
async def update_compose_file(
    node_id: int,
    vmid: int,
    compose_id: str,
    body: ComposeFileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(VMAssignment).where(VMAssignment.vmid == vmid, VMAssignment.node_id == node_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="VM not found")

    files = assignment.get_compose_files()
    updated = False
    for idx, f in enumerate(files):
        if f.get('id') == compose_id:
            new_entry = body.model_dump()
            new_entry['id'] = compose_id
            files[idx] = new_entry
            updated = True
            break
    if not updated:
        raise HTTPException(status_code=404, detail="Compose entry not found")

    assignment.set_compose_files(files)
    cfg = assignment.get_pending_provision_config() or {}
    cfg['docker_compose_files'] = files
    cfg['install_docker'] = True
    assignment.provision_pending = True
    assignment.set_pending_provision(cfg)
    await db.commit()
    return {"message": "Compose file updated", "provision_pending": True}


@router.delete("/{node_id}/{vmid}/compose-files/{compose_id}")
@require_permission("vm", "update")
async def delete_compose_file(
    node_id: int,
    vmid: int,
    compose_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(VMAssignment).where(VMAssignment.vmid == vmid, VMAssignment.node_id == node_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="VM not found")

    files = assignment.get_compose_files()
    files = [f for f in files if f.get('id') != compose_id]
    assignment.set_compose_files(files)
    cfg = assignment.get_pending_provision_config() or {}
    cfg['docker_compose_files'] = files
    cfg['install_docker'] = True if files else cfg.get('install_docker')
    assignment.provision_pending = True
    assignment.set_pending_provision(cfg)
    await db.commit()
    return {"message": "Compose file removed", "provision_pending": True}


@router.post("/{node_id}/{vmid}/compose-from-template")
@require_permission("vm", "update")
async def add_compose_from_template(
    node_id: int,
    vmid: int,
    req: ComposeFromTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tmpl_result = await db.execute(select(ComposeTemplate).where(ComposeTemplate.id == req.template_id))
    tmpl = tmpl_result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    rendered = _render_template(tmpl.content, req.variables or {})

    result = await db.execute(select(VMAssignment).where(VMAssignment.vmid == vmid, VMAssignment.node_id == node_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="VM not found")

    entry = {
        "id": f"tpl-{req.template_id}-{int(datetime.now().timestamp()*1000)}",
        "path": req.path,
        "service_name": req.service_name,
        "content": rendered,
        "start_on_deploy": req.start_on_deploy,
        "start_on_boot": req.start_on_boot,
        "template_id": req.template_id,
        "variables": req.variables or {},
        "update_on_template_update": req.update_on_template_update,
    }

    files = assignment.get_compose_files()
    files.append(entry)
    assignment.set_compose_files(files)
    cfg = assignment.get_pending_provision_config() or {}
    cfg['docker_compose_files'] = files
    cfg['install_docker'] = True
    assignment.provision_pending = True
    assignment.set_pending_provision(cfg)
    await db.commit()
    return {"message": "Compose added from template", "entry": entry, "provision_pending": True}

