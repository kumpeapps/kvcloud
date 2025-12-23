"""Provision VMs without cloud-init using QEMU Guest Agent."""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from app.core.database import get_db, async_session_maker
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.services.proxmox import ProxmoxService
from app.api.cloud_init import _resolve_vm_network_config, _build_default_network_block, SingleQuoted, _ensure_hashed_password
from app.core.tasks_store import active_tasks, archive_task
import yaml
import asyncio

router = APIRouter(prefix="/provision", tags=["provisioning"])


class DockerComposeFile(BaseModel):
    content: str
    path: Optional[str] = "/root/docker-compose.yml"
    start: Optional[bool] = False


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
    # Docker
    install_docker: Optional[bool] = None
    # Docker compose (single legacy + multiple)
    docker_compose_content: Optional[str] = None
    docker_compose_path: Optional[str] = "/root/docker-compose.yml"
    start_docker_compose: Optional[bool] = False
    docker_compose_files: Optional[List[DockerComposeFile]] = None
    docker_registry_url: Optional[str] = None
    docker_registry_username: Optional[str] = None
    docker_registry_password: Optional[str] = None
    # Network: if omitted, will resolve from DB/IP pools
    write_network: bool = True


def _yaml_network_from_vm_net(vm_net: Dict[str, Any]) -> str:
    """Render netplan YAML from vm_network dict."""
    block = _build_default_network_block(vm_net)
    return yaml.dump(block, default_flow_style=False)


async def provision_vm_background(
    task_id: str,
    node_id: int,
    vmid: int,
    config: Dict[str, Any]
):
    """Background task for VM provisioning with retry logic."""
    print(f"[{task_id}] ===== PROVISION TASK STARTED =====")
    def update_progress(progress: int, message: str):
        """Update task progress."""
        if task_id in active_tasks:
            active_tasks[task_id]["progress"] = progress
            active_tasks[task_id]["message"] = message
            print(f"[{task_id}] {progress}% - {message}")
    
    max_retries = 3
    retry_count = 0
    retry_delay = 10  # Start with 10 seconds
    
    while retry_count < max_retries:
        try:
            update_progress(10, "🔍 Initializing provisioning service...")
            # Create a new session for this background task (don't reuse request session)
            async with async_session_maker() as db:
                # Get VM name from database
                from app.models.vm_assignment import VMAssignment
                stmt = select(VMAssignment).where(
                    (VMAssignment.vmid == vmid) &
                    (VMAssignment.node_id == node_id)
                )
                result_query = await db.execute(stmt)
                vm_assignment = result_query.scalar_one_or_none()
                
                # Always use VM name as hostname (from assignment or config)
                if vm_assignment and vm_assignment.name:
                    config['hostname'] = vm_assignment.name
                    print(f"[{task_id}] Using VM assignment name as hostname: {vm_assignment.name}")
                elif not config.get('hostname'):
                    # If no VM assignment or name, use provided hostname or VM ID as fallback
                    config['hostname'] = f"vm-{vmid}"
                    print(f"[{task_id}] Using fallback hostname: vm-{vmid}")
                
                service = ProxmoxService(db)
                
                update_progress(20, "🤖 Waiting for guest agent...")
                # Execute provisioning via guest agent
                result = await service.provision_vm_via_guest_agent(node_id, vmid, config)
                
                update_progress(90, "✅ Provisioning completed")
                
                # Check if provisioning was successful
                ok = any(step.get('status') == 'ok' for step in result.get('steps', []))
                
                if not ok:
                    # Failed - determine if we should retry
                    failed_steps = [step.get('step') for step in result.get('steps', []) if step.get('status') == 'error']
                    print(f"[{task_id}] Provisioning failed at steps: {failed_steps}")
                    
                    # Retry if it looks like a connectivity/timing issue (guest agent not ready)
                    if retry_count < max_retries - 1:
                        retry_count += 1
                        update_progress(15, f"⏳ Retrying ({retry_count}/{max_retries})... waiting {retry_delay}s")
                        print(f"[{task_id}] Retrying provisioning in {retry_delay} seconds...")
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                        continue
                    else:
                        # Max retries exhausted
                        update_progress(0, f"❌ Provisioning failed after {max_retries} attempts")
                        active_tasks[task_id]["status"] = "failed"
                        active_tasks[task_id]["error"] = f"Failed steps: {failed_steps}"
                        active_tasks[task_id]["result"] = result
                        active_tasks[task_id]["completed_at"] = datetime.now().isoformat()
                        
                        # Unlock VM on failure (so user can try again or investigate)
                        from app.models.vm_assignment import VMAssignment
                        stmt_unlock = select(VMAssignment).where(
                            (VMAssignment.vmid == vmid) &
                            (VMAssignment.node_id == node_id)
                        )
                        result_unlock = await db.execute(stmt_unlock)
                        vm_assign = result_unlock.scalar_one_or_none()
                        if vm_assign:
                            vm_assign.is_locked = False
                            vm_assign.lock_reason = None
                            await db.commit()
                            print(f"[{task_id}] Unlocked VM on provisioning failure")
                        
                        archive_task(task_id)
                        return
                else:
                    # Success!
                    update_progress(100, "✅ Provisioning completed successfully")
                    active_tasks[task_id]["status"] = "completed"
                    active_tasks[task_id]["result"] = result
                    active_tasks[task_id]["completed_at"] = datetime.now().isoformat()
                    
                    # Unlock VM on success
                    from app.models.vm_assignment import VMAssignment
                    stmt_unlock = select(VMAssignment).where(
                        (VMAssignment.vmid == vmid) &
                        (VMAssignment.node_id == node_id)
                    )
                    result_unlock = await db.execute(stmt_unlock)
                    vm_assign = result_unlock.scalar_one_or_none()
                    if vm_assign:
                        vm_assign.is_locked = False
                        vm_assign.lock_reason = None
                        await db.commit()
                        print(f"[{task_id}] Unlocked VM on provisioning success")
                    
                    archive_task(task_id)
                    return
            
        except Exception as e:
            print(f"[{task_id}] Error during provisioning attempt {retry_count + 1}: {e}")
            import traceback
            traceback.print_exc()
            
            # Retry on error
            if retry_count < max_retries - 1:
                retry_count += 1
                update_progress(15, f"⏳ Retrying ({retry_count}/{max_retries})... waiting {retry_delay}s")
                print(f"[{task_id}] Retrying provisioning in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                # Max retries exhausted
                update_progress(0, f"❌ Error: {str(e)[:200]}")
                active_tasks[task_id]["status"] = "failed"
                active_tasks[task_id]["error"] = str(e)
                active_tasks[task_id]["completed_at"] = datetime.now().isoformat()
                
                # Unlock VM on exception
                async with async_session_maker() as db_unlock:
                    from app.models.vm_assignment import VMAssignment
                    stmt_unlock = select(VMAssignment).where(
                        (VMAssignment.vmid == vmid) &
                        (VMAssignment.node_id == node_id)
                    )
                    result_unlock = await db_unlock.execute(stmt_unlock)
                    vm_assign = result_unlock.scalar_one_or_none()
                    if vm_assign:
                        vm_assign.is_locked = False
                        vm_assign.lock_reason = None
                        await db_unlock.commit()
                        print(f"[{task_id}] Unlocked VM on provisioning exception")
                
                archive_task(task_id)
                return


@router.post("/vm/guest-agent")
@require_permission("vm", "update")
async def provision_vm_via_guest_agent(
    req: GuestAgentProvisionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Provision a VM using QEMU Guest Agent commands instead of cloud-init.

    Prerequisites: guest image must have qemu-guest-agent installed and running.
    
    Returns a task_id for tracking progress.
    """
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
    if req.docker_compose_files:
        cfg['docker_compose_files'] = [f.model_dump() for f in req.docker_compose_files]
    # Install docker if requested or if compose files are present
    if req.install_docker is not None:
        cfg['install_docker'] = req.install_docker
    else:
        cfg['install_docker'] = bool(req.docker_compose_content or req.docker_compose_files)
    if req.docker_registry_url and req.docker_registry_username and req.docker_registry_password:
        cfg['docker_registry_url'] = req.docker_registry_url
        cfg['docker_registry_username'] = req.docker_registry_username
        cfg['docker_registry_password'] = req.docker_registry_password
        cfg['install_docker'] = True

    # Network YAML from resolver if requested
    if req.write_network:
        vm_net = await _resolve_vm_network_config(db, req.vmid)
        if vm_net and (vm_net.get('enable_dhcp') or vm_net.get('ip_address')):
            cfg['network_yaml'] = _yaml_network_from_vm_net(vm_net)
        else:
            print(f"[Provision] Skipping network config: vm_net={vm_net}")

    # Create task
    task_id = f"provision-{req.node_id}-{req.vmid}-{int(datetime.now().timestamp())}"
    active_tasks[task_id] = {
        "id": task_id,
        "type": "provision",
        "status": "running",
        "progress": 0,
        "message": "Starting provisioning...",
        "node_id": req.node_id,
        "vmid": req.vmid,
        "started_at": datetime.now().isoformat()
    }
    
    # Launch background task as a coroutine (don't pass db - will create its own session)
    asyncio.create_task(provision_vm_background(task_id, req.node_id, req.vmid, cfg))
    
    return {
        "message": "Provisioning started",
        "task_id": task_id
    }
