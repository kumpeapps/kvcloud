"""API endpoints for cloud-init configuration."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any, Optional
import ipaddress
import yaml
import re
import crypt

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.models.cloud_init import CloudInitProfile
from app.models.vm_user import VmNetworkConfig
from app.models.ip_pool import IPAddress, IPPool
from app.models.user import User
from app.services.proxmox import ProxmoxService

router = APIRouter(prefix="/cloud-init", tags=["cloud-init"])


class SingleQuoted(str):
    """Marker type to force single-quoted YAML scalars."""


def _single_quoted_representer(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style="'")


# Register representer so only values wrapped in SingleQuoted are forced to single quotes
yaml.add_representer(SingleQuoted, _single_quoted_representer)


class CloudInitProfileCreate(BaseModel):
    name: str
    description: str | None = None
    
    # Basic user configuration
    default_user: str | None = None
    default_password: str | None = None
    disable_root: bool = False
    
    # Package management
    apt_update: bool = True
    apt_upgrade: bool = False
    apt_reboot_if_required: bool = False
    packages: List[str] = []
    package_update_frequency: str | None = None  # daily, weekly, monthly
    
    # Scripts and commands
    bootcmd: List[str] = []
    runcmd: List[str] = []
    
    # Cron jobs
    cron_jobs: List[Dict[str, Any]] = []
    
    # File creation
    write_files: List[Dict[str, Any]] = []
    
    # Docker configuration
    install_docker: bool = False
    docker_compose_content: str | None = None
    docker_compose_path: str = "/root/docker-compose.yml"
    start_docker_compose: bool = False
    
    # Network configuration
    network_config_template: str | None = None
    hostname_template: str | None = None
    
    # SSH configuration
    ssh_authorized_keys: List[str] = []
    ssh_pwauth: bool = True
    
    # Timezone and locale
    timezone: str | None = None
    locale: str | None = None
    
    # Custom cloud-config
    custom_cloud_config: str | None = None
    
    # Variable documentation (for UI display)
    available_variables: List[str] = []


class ApplyCloudInit(BaseModel):
    node_id: int
    vmid: int
    ciuser: str | None = None
    cipassword: str | None = None
    sshkeys: str | None = None
    ipconfig0: str | None = None
    nameserver: str | None = None
    searchdomain: str | None = None


class VmCloudInitOverridesApply(BaseModel):
    """Per-VM overrides that augment an admin-selected profile."""
    node_id: int
    vmid: int
    profile_id: int | None = None  # Optional base profile to merge with
    # Provisioning flags
    enable_guest_agent: bool | None = None
    provision_via_guest_agent: bool | None = None
    # User & SSH
    default_user: str | None = None
    default_password: str | None = None
    ssh_authorized_keys: List[str] | None = None  # list of public keys
    ssh_pwauth: bool | None = None
    # Packages & commands
    packages: List[str] | None = None
    apt_update: bool | None = None
    apt_upgrade: bool | None = None
    apt_reboot_if_required: bool | None = None
    # Docker compose
    docker_compose_content: str | None = None
    docker_compose_path: str | None = None
    start_docker_compose: bool | None = None
    # Docker registry auth
    docker_registry_url: str | None = None
    docker_registry_username: str | None = None
    docker_registry_password: str | None = None
    # Locale/Time
    timezone: str | None = None
    locale: str | None = None


def _merge_unique(base: List[str] | None, extra: List[str] | None) -> List[str] | None:
    if base is None and extra is None:
        return None
    base_list = list(base or [])
    seen = set(base_list)
    if extra:
        for item in extra:
            if item not in seen:
                base_list.append(item)
                seen.add(item)
    return base_list


def _is_probably_hashed_password(password: str) -> bool:
    prefixes = ("$1$", "$2a$", "$2b$", "$2y$", "$5$", "$6$", "$y$", "$apr1$")
    return any(password.startswith(prefix) for prefix in prefixes)


def _ensure_hashed_password(password: str) -> str:
    """Hash plaintext passwords to SHA-512 so cloud-init accepts them."""
    if _is_probably_hashed_password(password):
        return password
    try:
        return crypt.crypt(password, crypt.mksalt(crypt.METHOD_SHA512))
    except Exception:
        return password


def _extract_overrides_from_yaml(yaml_str: str) -> Dict[str, Any]:
    """Best-effort extraction of override-like fields from existing user-data."""
    try:
        parsed = yaml.safe_load(yaml_str)
    except Exception:
        return {}

    if not isinstance(parsed, dict):
        return {}

    overrides: Dict[str, Any] = {}

    users = parsed.get("users") or []
    if isinstance(users, list) and users:
        first_user = users[0] if isinstance(users[0], dict) else None
        if first_user:
            overrides["default_user"] = first_user.get("name")
            overrides["ssh_authorized_keys"] = first_user.get("ssh_authorized_keys") or []
            if first_user.get("passwd"):
                overrides["has_password"] = True

    if "ssh_pwauth" in parsed:
        overrides["ssh_pwauth"] = parsed.get("ssh_pwauth")

    if parsed.get("packages"):
        overrides["packages"] = parsed.get("packages")

    overrides["apt_update"] = parsed.get("package_update")
    overrides["apt_upgrade"] = parsed.get("package_upgrade")
    overrides["apt_reboot_if_required"] = parsed.get("package_reboot_if_required")

    overrides["timezone"] = parsed.get("timezone")
    overrides["locale"] = parsed.get("locale")

    # Docker compose extraction from write_files and runcmd
    write_files = parsed.get("write_files") or []
    if isinstance(write_files, list):
        for wf in write_files:
            if not isinstance(wf, dict):
                continue
            path = wf.get("path", "")
            if "docker-compose" in path:
                overrides["docker_compose_path"] = path
                overrides["docker_compose_content"] = wf.get("content")
                break

    runcmd = parsed.get("runcmd") or []
    if isinstance(runcmd, list):
        overrides["start_docker_compose"] = any(
            isinstance(cmd, str) and "docker-compose up" in cmd for cmd in runcmd
        )

    return {k: v for k, v in overrides.items() if v is not None}


def _apply_overrides_to_profile(profile: CloudInitProfile, overrides: VmCloudInitOverridesApply) -> CloudInitProfile:
    # Scalars override when provided
    if overrides.default_user is not None:
        profile.default_user = overrides.default_user
    if overrides.default_password is not None:
        profile.default_password = overrides.default_password
    if overrides.ssh_pwauth is not None:
        profile.ssh_pwauth = overrides.ssh_pwauth
    if overrides.apt_update is not None:
        profile.apt_update = overrides.apt_update
    if overrides.apt_upgrade is not None:
        profile.apt_upgrade = overrides.apt_upgrade
    if overrides.apt_reboot_if_required is not None:
        profile.apt_reboot_if_required = overrides.apt_reboot_if_required
    if overrides.timezone is not None:
        profile.timezone = overrides.timezone
    if overrides.locale is not None:
        profile.locale = overrides.locale

    # Merge lists
    if overrides.packages is not None:
        profile.packages = _merge_unique(profile.packages, overrides.packages)
    if overrides.ssh_authorized_keys is not None:
        profile.ssh_authorized_keys = _merge_unique(profile.ssh_authorized_keys, overrides.ssh_authorized_keys)

    # Docker compose
    if overrides.docker_compose_content is not None:
        profile.docker_compose_content = overrides.docker_compose_content
    if overrides.docker_compose_path is not None:
        profile.docker_compose_path = overrides.docker_compose_path
    if overrides.start_docker_compose is not None:
        profile.start_docker_compose = overrides.start_docker_compose

    # Registry auth is not persisted in profile; handled during provisioning only

    return profile


@router.post("/vm/{node_id}/{vmid}/apply-overrides")
@require_permission("cloudinit", "apply")
async def apply_overrides_to_vm(
    node_id: int,
    vmid: int,
    payload: VmCloudInitOverridesApply,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Apply per-VM cloud-init overrides, merged with an optional admin profile.

    - Optionally provide profile_id to merge with an existing admin profile
    - Uploads merged user-data YAML as a Proxmox snippet via cicustom
    - Regenerates cloud-init ISO automatically
    """
    # Base profile
    base_profile: CloudInitProfile
    if payload.profile_id is not None:
        result = await db.execute(select(CloudInitProfile).where(CloudInitProfile.id == payload.profile_id))
        prof = result.scalar_one_or_none()
        if not prof:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
        # Make a transient copy to avoid mutating DB entity
        base_profile = CloudInitProfile(
            id=0,
            name=f"vm-{vmid}-merged",
            description=prof.description,
            default_user=prof.default_user,
            default_password=prof.default_password,
            disable_root=prof.disable_root,
            apt_update=prof.apt_update,
            apt_upgrade=prof.apt_upgrade,
            apt_reboot_if_required=prof.apt_reboot_if_required,
            packages=list(prof.packages or []),
            package_update_frequency=prof.package_update_frequency,
            bootcmd=list(prof.bootcmd or []),
            runcmd=list(prof.runcmd or []),
            cron_jobs=list(prof.cron_jobs or []),
            write_files=list(prof.write_files or []),
            install_docker=prof.install_docker,
            docker_compose_content=prof.docker_compose_content,
            docker_compose_path=prof.docker_compose_path,
            start_docker_compose=prof.start_docker_compose,
            network_config_template=prof.network_config_template,
            hostname_template=prof.hostname_template,
            ssh_authorized_keys=list(prof.ssh_authorized_keys or []),
            ssh_pwauth=prof.ssh_pwauth,
            timezone=prof.timezone,
            locale=prof.locale,
            custom_cloud_config=prof.custom_cloud_config,
            available_variables=list(prof.available_variables or []),
        )
    else:
        base_profile = CloudInitProfile(
            id=0,
            name=f"vm-{vmid}-overrides",
        )

    # Apply overrides
    merged_profile = _apply_overrides_to_profile(base_profile, payload)

    # Resolve VM network
    vm_network = await _resolve_vm_network_config(db, vmid)

    # Build variables
    variables = get_available_variables(current_user, {
        "vmid": vmid,
        "name": f"vm-{vmid}",
        "hostname": f"vm-{vmid}.local",
        "ip": vm_network.get("ip_address") if vm_network else None,
        "gateway": vm_network.get("gateway") if vm_network else None,
    })

    # Generate YAML
    userdata = await generate_cloud_init_yaml(merged_profile, variables, vm_network)

    # Apply via snippet + cicustom
    service = ProxmoxService(db)
    ok = await service.apply_cloud_init_user_data(node_id, vmid, userdata, storage="local")
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to apply overrides")

    provision_result = None
    # Optionally enable agent device and provision via guest agent automatically
    if payload.provision_via_guest_agent:
        try:
            # Ensure agent device enabled
            try:
                proxmox = service._get_proxmox_connection(await service.get_node(node_id))
                node_name = service._get_proxmox_node_name(await service.get_node(node_id))
                proxmox.nodes(node_name).qemu(vmid).config.put(agent=1)
            except Exception:
                pass

            # Build provisioning config from merged profile
            cfg: Dict[str, Any] = {}
            if merged_profile.default_user:
                cfg['default_user'] = merged_profile.default_user
            if merged_profile.default_password:
                # Hash plaintext
                cfg['password_hash'] = _ensure_hashed_password(merged_profile.default_password)
            if merged_profile.ssh_authorized_keys:
                cfg['ssh_authorized_keys'] = merged_profile.ssh_authorized_keys
            if merged_profile.ssh_pwauth is not None:
                cfg['ssh_pwauth'] = merged_profile.ssh_pwauth
            if merged_profile.packages:
                cfg['packages'] = merged_profile.packages
            if merged_profile.timezone:
                cfg['timezone'] = merged_profile.timezone
            cfg['hostname'] = variables.get('vm_hostname') or variables.get('vm_name') or f"vm-{vmid}"
            if merged_profile.docker_compose_content:
                cfg['docker_compose_content'] = merged_profile.docker_compose_content
                if merged_profile.docker_compose_path:
                    cfg['docker_compose_path'] = merged_profile.docker_compose_path
                if merged_profile.start_docker_compose is not None:
                    cfg['start_docker_compose'] = merged_profile.start_docker_compose
            if payload.docker_registry_url and payload.docker_registry_username and payload.docker_registry_password:
                cfg['docker_registry_url'] = payload.docker_registry_url
                cfg['docker_registry_username'] = payload.docker_registry_username
                cfg['docker_registry_password'] = payload.docker_registry_password
                cfg['install_docker'] = True
            if vm_network:
                from app.api.provision import _yaml_network_from_vm_net
                cfg['network_yaml'] = _yaml_network_from_vm_net(vm_network)

            provision_result = await service.provision_vm_via_guest_agent(node_id, vmid, cfg)
        except Exception as e:
            provision_result = {"error": str(e)}

    return {
        "message": "Overrides applied and cloud-init redeployed" + ("; guest-agent provisioning executed" if payload.provision_via_guest_agent else ""),
        "yaml": userdata,
        "network_used": vm_network,
        "provision_result": provision_result
    }


def substitute_variables(template: str, variables: Dict[str, Any]) -> str:
    """Replace ${variable_name} with actual values."""
    if not template:
        return template

    def replacer(match):
        var_name = match.group(1)
        return str(variables.get(var_name, match.group(0)))

    return re.sub(r"\$\{([^}]+)\}", replacer, template)


def get_available_variables(user: User, vm_data: Dict[str, Any] = None) -> Dict[str, Any]:
    """Get all available variables for substitution."""
    variables = {
        "user_id": user.id,
        "user_username": user.username,
        "user_email": user.email,
        "user_full_name": user.full_name or user.username,
    }

    if vm_data:
        variables.update({
            "vm_id": vm_data.get("vmid"),
            "vm_name": vm_data.get("name"),
            "vm_hostname": vm_data.get("hostname"),
            "vm_ip": vm_data.get("ip"),
            "vm_node": vm_data.get("node"),
        })

    return variables


def _split_to_list(value: Any) -> List[str]:
    """Normalize comma/space separated strings or lists into a list of strings."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        import re as _re
        return [part.strip() for part in _re.split(r"[,\s]+", value) if part.strip()]
    return [str(value)]


def _netmask_to_prefix(netmask: Optional[str]) -> int:
    """Convert dotted netmask or /xx notation to prefix length.
    
    Returns 24 as default if no valid netmask is provided, as this is the most
    common subnet size and ensures CIDR notation is always present.
    """
    if not netmask:
        return 24  # Default to /24 if no netmask provided
    try:
        if netmask.startswith('/'):
            return int(netmask.lstrip('/'))
        # ipaddress will derive the prefix from the netmask provided
        return ipaddress.ip_network(f"0.0.0.0/{netmask}", strict=False).prefixlen
    except Exception:
        return 24  # Default to /24 on error


async def _resolve_vm_network_config(db: AsyncSession, vmid: int) -> Optional[Dict[str, Any]]:
    """Fetch network configuration for a VM from vm_network_configs or allocated IPs."""

    result = await db.execute(select(VmNetworkConfig).where(VmNetworkConfig.vm_id == vmid))
    config = result.scalar_one_or_none()
    if config:
        # Extract prefix from IP if already in CIDR notation (e.g., 192.168.1.10/24)
        ip_address = config.ip_address
        netmask = None
        if ip_address and '/' in ip_address:
            # IP already has prefix notation
            netmask = '/' + ip_address.split('/')[-1]
        
        # If no netmask in IP but we have an IP pool, fetch netmask from pool
        if not netmask and config.ip_pool_id:
            pool = await db.get(IPPool, config.ip_pool_id)
            if pool:
                netmask = pool.netmask
                print(f"[CLOUD-INIT] Fetched netmask from IP pool {config.ip_pool_id}: {netmask}")
        
        return {
            "ip_address": ip_address,
            "netmask": netmask,
            "gateway": config.gateway,
            "dns_servers": _split_to_list(config.dns_servers),
            "domain_search": _split_to_list(config.domain_search),
            "enable_dhcp": config.enable_dhcp,
        }

    # Fallback: check allocated IP in pool (prefer most recently allocated)
    result = await db.execute(
        select(IPAddress)
        .where(IPAddress.vm_id == vmid, IPAddress.is_allocated == True)
        .order_by(IPAddress.allocated_at.desc())
    )
    ip_addr = result.scalar_one_or_none()
    if not ip_addr:
        return None

    pool = await db.get(IPPool, ip_addr.pool_id)
    if not pool:
        return None

    print(f"[CLOUD-INIT] Resolved network from IP pool '{pool.name}': IP={ip_addr.ip_address}, netmask={pool.netmask}, gateway={pool.gateway}")
    
    return {
        "ip_address": ip_addr.ip_address,
        "netmask": pool.netmask,
        "gateway": pool.gateway,
        "dns_servers": _split_to_list(pool.name_servers),
        "domain_search": _split_to_list(pool.name_servers),
        "enable_dhcp": False,
    }


def _build_default_network_block(vm_network: Dict[str, Any]) -> Dict[str, Any]:
    """Construct a default netplan-style network block from VM network data.
    
    Uses modern Netplan v2 syntax with 'routes' instead of deprecated 'gateway4'.
    Interface name is 'ens18' which is standard for Proxmox VirtIO NICs.
    Returns dict nested under 'network' key for proper netplan YAML structure.
    """
    interface: Dict[str, Any] = {}

    if vm_network.get("enable_dhcp"):
        interface["dhcp4"] = True
    else:
        interface["dhcp4"] = False
        ip = vm_network.get("ip_address")
        netmask_raw = vm_network.get("netmask")
        prefix = _netmask_to_prefix(netmask_raw)
        
        print(f"[CLOUD-INIT] Building network block: IP={ip}, netmask_raw={netmask_raw}, prefix={prefix}")
        
        if ip:
            # Ensure CIDR notation is always present
            if "/" in ip:
                # IP already has prefix notation (e.g., 192.168.1.10/24)
                ip_with_prefix = ip
            else:
                # Add prefix to IP (prefix is guaranteed to have a value now)
                ip_with_prefix = f"{ip}/{prefix}"
            interface["addresses"] = [ip_with_prefix]
            print(f"[CLOUD-INIT] Network address configured: {ip_with_prefix}")
        
        # Use modern 'routes' syntax instead of deprecated 'gateway4'
        gateway = vm_network.get("gateway")
        if gateway:
            interface["routes"] = [
                {
                    "to": "default",
                    "via": gateway
                }
            ]
        
        dns = _split_to_list(vm_network.get("dns_servers"))
        search = _split_to_list(vm_network.get("domain_search"))
        if dns or search:
            interface["nameservers"] = {}
            if dns:
                interface["nameservers"]["addresses"] = dns
            if search:
                interface["nameservers"]["search"] = search

    return {
        "network": {
            "version": 2,
            "renderer": "networkd",
            "ethernets": {
                "ens18": interface  # Standard Proxmox VirtIO interface name
            }
        }
    }


async def generate_cloud_init_yaml(profile: CloudInitProfile, variables: Dict[str, Any], vm_network: Optional[Dict[str, Any]] = None) -> str:
    """Generate cloud-init user-data YAML from profile with optional network context."""
    config: Dict[str, Any] = {}

    # Basic user config
    # auto-hash plaintext passwords so cloud-init accepts them
    if profile.default_user:
        user_entry: Dict[str, Any] = {
            "name": substitute_variables(profile.default_user, variables),
            "sudo": "ALL=(ALL) NOPASSWD:ALL",
            "shell": "/bin/bash",
            "lock_passwd": False,
        }
        if profile.default_password:
            resolved_password = substitute_variables(profile.default_password, variables)
            hashed_password = _ensure_hashed_password(resolved_password)
            # Force single-quoted style without embedding quotes in the value
            user_entry["passwd"] = SingleQuoted(hashed_password)
        if profile.ssh_authorized_keys:
            user_entry["ssh_authorized_keys"] = [substitute_variables(key, variables) for key in profile.ssh_authorized_keys]
        config["users"] = [user_entry]

    if profile.disable_root:
        config["disable_root"] = True

    # SSH config
    if profile.ssh_pwauth is not None:
        config["ssh_pwauth"] = profile.ssh_pwauth

    # Timezone and locale
    if profile.timezone:
        config["timezone"] = profile.timezone
    if profile.locale:
        config["locale"] = profile.locale

    # Hostname
    if profile.hostname_template:
        config["hostname"] = substitute_variables(profile.hostname_template, variables)

    # Network configuration (netplan/cloud-init network block)
    if profile.network_config_template:
        try:
            rendered_network = substitute_variables(profile.network_config_template, variables)
            parsed_network = yaml.safe_load(rendered_network)
            if isinstance(parsed_network, dict):
                config["network"] = parsed_network
            else:
                # Keep raw content if not a mapping so users can troubleshoot
                config["network"] = rendered_network
        except yaml.YAMLError:
            # Fallback to raw template when YAML parsing fails
            config["network"] = profile.network_config_template
    elif vm_network:
        # Default network block derived from assigned IPs
        config["network"] = _build_default_network_block(vm_network)

    # Package management
    if profile.apt_update:
        config["package_update"] = True
    if profile.apt_upgrade:
        config["package_upgrade"] = True
    if profile.apt_reboot_if_required:
        config["package_reboot_if_required"] = True

    if profile.packages:
        config["packages"] = profile.packages

    # Boot commands
    if profile.bootcmd:
        config["bootcmd"] = [substitute_variables(cmd, variables) for cmd in profile.bootcmd]

    # Run commands
    runcmd: List[str] = []
    if profile.runcmd:
        runcmd.extend([substitute_variables(cmd, variables) for cmd in profile.runcmd])

    # Docker installation
    if profile.install_docker:
        runcmd.extend([
            "curl -fsSL https://get.docker.com -o get-docker.sh",
            "sh get-docker.sh",
            f"usermod -aG docker {profile.default_user or 'ubuntu'}",
            "systemctl enable docker",
            "systemctl start docker",
        ])

        # Docker compose
        if profile.docker_compose_content:
            runcmd.extend([
                "curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)\" -o /usr/local/bin/docker-compose",
                "chmod +x /usr/local/bin/docker-compose",
            ])

            if profile.start_docker_compose:
                compose_dir = profile.docker_compose_path.rsplit("/", 1)[0]
                runcmd.append(f"cd {compose_dir} && docker-compose up -d")

    if runcmd:
        config["runcmd"] = runcmd

    # Write files
    write_files: List[Dict[str, Any]] = []
    if profile.write_files:
        for wf in profile.write_files:
            write_files.append({
                "path": substitute_variables(wf.get("path", ""), variables),
                "content": substitute_variables(wf.get("content", ""), variables),
                "permissions": wf.get("permissions", "0644"),
                "owner": wf.get("owner", "root:root"),
            })

    # Add docker-compose.yml if specified
    if profile.docker_compose_content:
        write_files.append({
            "path": profile.docker_compose_path,
            "content": substitute_variables(profile.docker_compose_content, variables),
            "permissions": "0644",
            "owner": "root:root",
        })

    if write_files:
        config["write_files"] = write_files

    # Merge custom cloud-config
    if profile.custom_cloud_config:
        try:
            custom = yaml.safe_load(profile.custom_cloud_config)
            if isinstance(custom, dict):
                config.update(custom)
        except yaml.YAMLError:
            pass

    return yaml.dump(config, default_flow_style=False)


@router.get("/variables")
async def get_variables(current_user=Depends(get_current_user)):
    """Get available variables for cloud-init templates."""
    vars_doc = {
        "user_variables": [
            {"name": "user_id", "example": "123", "description": "User's database ID"},
            {"name": "user_username", "example": "john", "description": "Username"},
            {"name": "user_email", "example": "john@example.com", "description": "User's email address"},
            {"name": "user_full_name", "example": "John Doe", "description": "User's full name"},
        ],
        "vm_variables": [
            {"name": "vm_id", "example": "100", "description": "VM ID (vmid)"},
            {"name": "vm_name", "example": "web-server-01", "description": "VM name"},
            {"name": "vm_hostname", "example": "web01.local", "description": "VM hostname"},
            {"name": "vm_ip", "example": "192.168.1.100", "description": "VM IP address"},
            {"name": "vm_node", "example": "proxmox1", "description": "Proxmox node name"},
        ],
        "usage": "Use ${variable_name} in any text field, e.g., ${user_username}-vm or hostname-${vm_id}"
    }
    return vars_doc


@router.post("/profiles")
@require_permission("cloudinit", "create")
async def create_profile(data: CloudInitProfileCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Create a new cloud-init profile."""
    try:
        profile = CloudInitProfile(**data.model_dump())
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
        return {"profile": {"id": profile.id, "name": profile.name}}
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create profile: {str(e)}"
        )


@router.get("/profiles")
@require_permission("cloudinit", "read")
async def list_profiles(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(CloudInitProfile))
    profiles = []
    for p in result.scalars().all():
        profiles.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "default_user": p.default_user,
            "apt_update": p.apt_update,
            "apt_upgrade": p.apt_upgrade,
            "packages": p.packages,
            "install_docker": p.install_docker,
            "timezone": p.timezone,
            "locale": p.locale,
        })
    return {"profiles": profiles}


@router.get("/profiles/{profile_id}")
@require_permission("cloudinit", "read")
async def get_profile(profile_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(CloudInitProfile).where(CloudInitProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    return {
        "id": profile.id,
        "name": profile.name,
        "description": profile.description,
        "default_user": profile.default_user,
        "default_password": profile.default_password,
        "disable_root": profile.disable_root,
        "apt_update": profile.apt_update,
        "apt_upgrade": profile.apt_upgrade,
        "apt_reboot_if_required": profile.apt_reboot_if_required,
        "packages": profile.packages,
        "package_update_frequency": profile.package_update_frequency,
        "bootcmd": profile.bootcmd,
        "runcmd": profile.runcmd,
        "cron_jobs": profile.cron_jobs,
        "write_files": profile.write_files,
        "install_docker": profile.install_docker,
        "docker_compose_content": profile.docker_compose_content,
        "docker_compose_path": profile.docker_compose_path,
        "start_docker_compose": profile.start_docker_compose,
        "network_config_template": profile.network_config_template,
        "hostname_template": profile.hostname_template,
        "ssh_authorized_keys": profile.ssh_authorized_keys,
        "ssh_pwauth": profile.ssh_pwauth,
        "timezone": profile.timezone,
        "locale": profile.locale,
        "custom_cloud_config": profile.custom_cloud_config,
    }


@router.put("/profiles/{profile_id}")
@require_permission("cloudinit", "create")
async def update_profile(profile_id: int, data: CloudInitProfileCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(CloudInitProfile).where(CloudInitProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    for key, value in data.model_dump().items():
        setattr(profile, key, value)

    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return {"profile": {"id": profile.id, "name": profile.name}}


@router.delete("/profiles/{profile_id}")
@require_permission("cloudinit", "create")
async def delete_profile(profile_id: int, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(CloudInitProfile).where(CloudInitProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    await db.delete(profile)
    await db.commit()
    return {"message": "Profile deleted"}


class ApplyProfileToVM(BaseModel):
    profile_id: int
    vmid: int
    node_id: int


@router.post("/apply-profile")
@require_permission("cloudinit", "apply")
async def apply_profile_to_vm(data: ApplyProfileToVM, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Apply a cloud-init profile to a VM with variable substitution."""

    # Get the profile
    result = await db.execute(select(CloudInitProfile).where(CloudInitProfile.id == data.profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    # Resolve VM network configuration (assigned IPs or DHCP flag)
    vm_network = await _resolve_vm_network_config(db, data.vmid)

    # Fetch actual VM config for better variables
    from app.services.proxmox import ProxmoxService
    service = ProxmoxService(db)
    vm_cfg = await service.get_vm_config(data.node_id, data.vmid)
    vm_data = {
        "vmid": data.vmid,
        "name": vm_cfg.get("name", f"vm-{data.vmid}") if vm_cfg else f"vm-{data.vmid}",
        "hostname": vm_cfg.get("hostname", f"vm-{data.vmid}.local") if vm_cfg else f"vm-{data.vmid}.local",
    }

    # Enrich VM variables with IP information when available
    if vm_network and vm_network.get("ip_address"):
        prefix = _netmask_to_prefix(vm_network.get("netmask"))
        ip = vm_network.get("ip_address")
        vm_data["ip"] = ip if "/" in ip or prefix is None else f"{ip}/{prefix}"
        vm_data["gateway"] = vm_network.get("gateway")
        if vm_network.get("dns_servers"):
            vm_data["dns"] = vm_network.get("dns_servers")

    # Get variables
    variables = get_available_variables(current_user, vm_data)

    # Generate cloud-init YAML
    userdata = await generate_cloud_init_yaml(profile, variables, vm_network)

    # Apply to Proxmox as user-data snippet via cicustom
    ok = await service.apply_cloud_init_user_data(data.node_id, data.vmid, userdata, storage="local")
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to apply cloud-init user-data to VM")

    return {
        "message": "Cloud-init profile applied successfully",
        "userdata_preview": userdata,
        "variables_used": variables,
        "network_used": vm_network
    }


@router.post("/preview")
@require_permission("cloudinit", "read")
async def preview_profile(data: CloudInitProfileCreate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Preview the generated cloud-init YAML for a profile."""

    temp_profile = CloudInitProfile(**data.model_dump())

    variables = {
        "user_id": current_user.id,
        "user_username": current_user.username,
        "user_email": current_user.email,
        "user_full_name": current_user.full_name or current_user.username,
        "vm_id": "100",
        "vm_name": "example-vm",
        "vm_hostname": "example.local",
        "vm_ip": "192.168.1.100",
        "vm_node": "proxmox1",
    }

    yaml_output = await generate_cloud_init_yaml(temp_profile, variables, None)

    return {
        "yaml": yaml_output,
        "variables": variables
    }


@router.get("/vm/{node_id}/{vmid}/preview")
@require_permission("cloudinit", "read")
async def preview_vm_cloud_init(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Generate cloud-init YAML preview for a specific VM based on its current config."""
    from app.services.proxmox import ProxmoxService
    
    # Get VM config from Proxmox
    service = ProxmoxService(db)
    vm_config = await service.get_vm_config(node_id, vmid)
    
    if not vm_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM not found"
        )
    
    # Get VM network config
    vm_net = await _resolve_vm_network_config(db, vmid)
    
    # Build a synthetic profile from current VM config
    synthetic_profile = CloudInitProfile(
        id=0,
        name="Current Config",
        default_user=vm_config.get('ciuser'),
        default_password='********' if vm_config.get('cipassword') else None,
        ssh_authorized_keys=vm_config.get('sshkeys', '').split('\\n') if vm_config.get('sshkeys') else [],
        disable_root=False,
        apt_update=True,
        apt_upgrade=False,
        apt_reboot_if_required=False,
        packages=[],
        install_docker=False,
        docker_compose_path="/root/docker-compose.yml",
        start_docker_compose=False,
        ssh_pwauth=True
    )
    
    # Build variables
    variables = {
        "user_id": current_user.id,
        "user_username": current_user.username,
        "user_email": current_user.email,
        "user_full_name": current_user.full_name or current_user.username,
        "vm_id": vmid,
        "vm_name": vm_config.get('name', f'vm-{vmid}'),
        "vm_hostname": vm_config.get('hostname', f'vm-{vmid}.local'),
    }
    
    if vm_net and vm_net.get('ip_address'):
        variables["vm_ip"] = vm_net.get('ip_address')
        variables["vm_gateway"] = vm_net.get('gateway')
    
    # Prefer active user-data snippet content if cicustom is set
    yaml_output: str | None = await service.get_active_user_data_yaml(node_id, vmid)
    yaml_source = "snippet" if yaml_output else "generated"
    if not yaml_output:
        # Fallback to generated YAML from current config
        yaml_output = await generate_cloud_init_yaml(synthetic_profile, variables, vm_net)
    
    # Extract overrides so the UI can prefill the overrides form
    overrides = _extract_overrides_from_yaml(yaml_output or "") if yaml_output else {}
    
    return {
        "yaml": yaml_output,
        "yaml_source": yaml_source,
        "variables": variables,
        "network_config": vm_net,
        "overrides": overrides,
        "proxmox_config": {
            "ciuser": vm_config.get('ciuser'),
            "has_cipassword": bool(vm_config.get('cipassword')),
            "has_sshkeys": bool(vm_config.get('sshkeys')),
            "ipconfig0": vm_config.get('ipconfig0'),
            "nameserver": vm_config.get('nameserver'),
            "searchdomain": vm_config.get('searchdomain'),
            "cicustom": vm_config.get('cicustom'),
        }
    }


@router.post("/apply")
@require_permission("cloudinit", "apply")
async def apply_cloud_init(data: ApplyCloudInit, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    """Apply cloud-init configuration to a VM."""
    try:
        print(f"[CloudInit] Apply request: node_id={data.node_id}, vmid={data.vmid}")
        print(f"[CloudInit] Received from frontend: ciuser={data.ciuser}, sshkeys={'SET' if data.sshkeys else 'NONE'}, ipconfig0={data.ipconfig0}")
        
        # Pass DB session so ProxmoxService can resolve cluster/node metadata
        service = ProxmoxService(db)
        
        # Build the cloud-init config dict with only non-null values
        ci_config = {}
        if data.ciuser is not None:
            ci_config['ciuser'] = data.ciuser
        if data.cipassword is not None:
            ci_config['cipassword'] = data.cipassword
        if data.sshkeys is not None:
            ci_config['sshkeys'] = data.sshkeys
        if data.ipconfig0 is not None:
            ci_config['ipconfig0'] = data.ipconfig0
        if data.nameserver is not None:
            ci_config['nameserver'] = data.nameserver
        if data.searchdomain is not None:
            ci_config['searchdomain'] = data.searchdomain

        print(f"[CloudInit] Initial config from frontend: {list(ci_config.keys())}")
        
        # Auto-derive network config if not provided
        if 'ipconfig0' not in ci_config or not ci_config['ipconfig0']:
            print(f"[CloudInit] No ipconfig0 from frontend, attempting auto-derive for VM {data.vmid}")
            vm_net = await _resolve_vm_network_config(db, data.vmid)
            print(f"[CloudInit] Resolved VM network: {vm_net}")
            if vm_net:
                if vm_net.get('enable_dhcp'):
                    print(f"[CloudInit] Using DHCP mode")
                    ci_config['ipconfig0'] = 'ip=dhcp'
                else:
                    ip = vm_net.get('ip_address')
                    if ip:
                        prefix = _netmask_to_prefix(vm_net.get('netmask'))
                        print(f"[CloudInit] IP={ip}, netmask={vm_net.get('netmask')}, prefix={prefix}")
                        if '/' in ip:
                            ip_part = ip
                        elif prefix:
                            ip_part = f"{ip}/{prefix}"
                        else:
                            ip_part = f"{ip}/24"  # Default to /24 if no netmask
                        gw = vm_net.get('gateway')
                        ci_config['ipconfig0'] = f"ip={ip_part}" + (f",gw={gw}" if gw else '')
                        print(f"[CloudInit] Built ipconfig0: {ci_config['ipconfig0']}")
                    # Nameserver/searchdomain from resolver
                    dns_list = _split_to_list(vm_net.get('dns_servers'))
                    if dns_list:
                        ci_config['nameserver'] = ' '.join(dns_list)
                        print(f"[CloudInit] Set nameserver: {ci_config['nameserver']}")
                    search_list = _split_to_list(vm_net.get('domain_search'))
                    if search_list:
                        ci_config['searchdomain'] = ' '.join(search_list)
                        print(f"[CloudInit] Set searchdomain: {ci_config['searchdomain']}")
            else:
                print(f"[CloudInit] WARNING: No VM network config found for VM {data.vmid}")
        
        print(f"[CloudInit] Final config to apply: {ci_config}")
        
        # Apply the configuration to the VM
        success = await service.apply_cloud_init(data.node_id, data.vmid, ci_config)
        
        if success:
            return {
                "message": "Cloud-init applied successfully",
                "vmid": data.vmid,
                "config_applied": ci_config
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to apply cloud-init configuration"
            )
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error applying cloud-init: {str(e)}"
        )