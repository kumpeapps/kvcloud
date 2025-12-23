"""Proxmox service for cluster and VM management."""
from typing import List, Optional, Dict, Any, Tuple
import os
from proxmoxer import ProxmoxAPI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.proxmox_cluster import ProxmoxCluster, ProxmoxNode
import paramiko
import time
import base64


class ProxmoxService:
    """Service for Proxmox cluster management."""
    
    def __init__(self, db: AsyncSession):
        """Initialize Proxmox service."""
        self.db = db
        self._connections: Dict[int, ProxmoxAPI] = {}
    
    async def get_cluster(self, cluster_id: int) -> Optional[ProxmoxCluster]:
        """Get cluster by ID."""
        result = await self.db.execute(
            select(ProxmoxCluster).where(ProxmoxCluster.id == cluster_id)
        )
        return result.scalar_one_or_none()
    
    async def list_clusters(self) -> List[ProxmoxCluster]:
        """List all clusters."""
        result = await self.db.execute(select(ProxmoxCluster))
        return list(result.scalars().all())
    
    async def get_node(self, node_id: int) -> Optional[ProxmoxNode]:
        """Get node by ID."""
        result = await self.db.execute(
            select(ProxmoxNode).where(ProxmoxNode.id == node_id)
        )
        return result.scalar_one_or_none()
    
    async def list_nodes(self, cluster_id: Optional[int] = None) -> List[ProxmoxNode]:
        """List all nodes or nodes for a specific cluster."""
        query = select(ProxmoxNode)
        if cluster_id:
            query = query.where(ProxmoxNode.cluster_id == cluster_id)
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    def _get_proxmox_connection(self, node: ProxmoxNode) -> ProxmoxAPI:
        """Get or create Proxmox API connection for a node."""
        if node.id not in self._connections:
            self._connections[node.id] = ProxmoxAPI(
                node.host,
                user=node.username,
                password=node.password,
                port=node.port,
                verify_ssl=node.verify_ssl
            )
        return self._connections[node.id]
    
    def _get_proxmox_node_name(self, node: ProxmoxNode) -> str:
        """Get the actual Proxmox node name (hostname) from the API."""
        try:
            proxmox = self._get_proxmox_connection(node)
            # Get list of nodes in the cluster
            nodes = proxmox.nodes.get()
            # Return the first node name (in standalone setups, there's only one)
            # In cluster setups, we should match by IP, but for now return first
            if nodes and len(nodes) > 0:
                return nodes[0]['node']
            return node.host.split('.')[0]  # Use first part of hostname
        except Exception as e:
            print(f"Error getting Proxmox node name: {e}")
            # Fallback to using the host as-is

    async def guest_agent_available(self, node_id: int, vmid: int, timeout: int = 60) -> bool:
        """Wait until QEMU Guest Agent responds to a trivial command."""
        node = await self.get_node(node_id)
        if not node:
            return False
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            deadline = time.time() + timeout
            while time.time() < deadline:
                try:
                    # Try a no-op exec; if agent isn't ready, Proxmox returns error
                    resp = proxmox.nodes(node_name).qemu(vmid).agent('exec').post(command='/bin/true')
                    pid = resp.get('pid')
                    if pid:
                        # Poll for status
                        for _ in range(10):
                            status = proxmox.nodes(node_name).qemu(vmid).agent('exec-status').get(pid=pid)
                            if status.get('exited'):
                                return True
                            time.sleep(0.5)
                    # If no pid, sleep and retry
                except Exception:
                    time.sleep(2)
            return False
        except Exception:
            return False

    async def guest_agent_exec(self, node_id: int, vmid: int, command: str, timeout: int = 120) -> Tuple[int, Optional[str], Optional[str]]:
        """Execute a command inside the guest via QEMU Guest Agent.

        Returns (exitcode, out, err). Output may be None if not captured.
        """
        node = await self.get_node(node_id)
        if not node:
            return (1, None, 'Node not found')
        proxmox = self._get_proxmox_connection(node)
        node_name = self._get_proxmox_node_name(node)

        try:
            # Wrap command in shell for proper execution
            shell_cmd = f"/bin/sh -c {repr(command)}"
            resp = proxmox.nodes(node_name).qemu(vmid).agent('exec').post(command=shell_cmd)
            pid = resp.get('pid')
            if not pid:
                return (1, None, 'No PID returned from guest agent')
            deadline = time.time() + timeout
            while time.time() < deadline:
                status = proxmox.nodes(node_name).qemu(vmid).agent('exec-status').get(pid=pid)
                if status.get('exited'):
                    exitcode = status.get('exitcode', 1)
                    out = None
                    err = None
                    # Proxmox may return out_data/err_data base64-encoded
                    if status.get('out_data'):
                        try:
                            out = base64.b64decode(status['out_data']).decode(errors='ignore')
                        except Exception:
                            out = str(status.get('out_data'))
                    if status.get('err_data'):
                        try:
                            err = base64.b64decode(status['err_data']).decode(errors='ignore')
                        except Exception:
                            err = str(status.get('err_data'))
                    return (exitcode, out, err)
                time.sleep(0.5)
            return (124, None, 'Timeout waiting for exec-status')
        except Exception as e:
            return (1, None, f'Guest agent exec error: {e}')

    async def exec_guest_command(self, node_id: int, vmid: int, command: str, timeout: int = 120) -> Tuple[int, Optional[str], Optional[str]]:
        """Compatibility wrapper used by API routes to execute guest commands.

        Delegates to guest_agent_exec and returns (exitcode, stdout, stderr).
        """
        code, out, err = await self.guest_agent_exec(node_id, vmid, command, timeout=timeout)
        # Minimal logging on failure to aid debugging without being verbose
        if code != 0:
            print(f"[GuestAgent] exec failed on VM {vmid}: code={code}, err={err}")
        return (code, out, err)

    async def guest_write_file(self, node_id: int, vmid: int, path: str, content: str, mode: str = '0644', owner: str = 'root:root') -> bool:
        """Write a file inside the guest using base64 encoding via exec.

        This avoids quoting/newline issues when passing through shell wrapper.
        """
        import base64
        
        # Ensure directory exists
        dir_cmd = f"mkdir -p $(dirname '{path}')"
        code, _, err = await self.guest_agent_exec(node_id, vmid, dir_cmd)
        if code != 0:
            print(f"[GuestAgent] mkdir failed: {err}")
            return False

        # Encode content as base64 to avoid any quoting/newline issues
        content_bytes = content.encode('utf-8')
        b64_content = base64.b64encode(content_bytes).decode('ascii')
        
        # Write using base64 decode
        write_cmd = f"echo '{b64_content}' | base64 -d > '{path}'"
        code, out, err = await self.guest_agent_exec(node_id, vmid, write_cmd)
        if code != 0:
            print(f"[GuestAgent] write file failed: code={code}, out={out}, err={err}")
            return False

        # Set permissions and ownership
        perm_cmd = f"chmod {mode} '{path}' && chown {owner} '{path}'"
        code, _, err = await self.guest_agent_exec(node_id, vmid, perm_cmd)
        if code != 0:
            print(f"[GuestAgent] chmod/chown failed: {err}")
            return False
        
        print(f"[GuestAgent] Successfully wrote file: {path}")
        return True
        return True

    async def provision_vm_via_guest_agent(self, node_id: int, vmid: int, config: Dict[str, Any]) -> Dict[str, Any]:
        """Provision a VM without cloud-init using QEMU Guest Agent commands.

        Supports: user creation/password, SSH keys, packages, hostname/timezone,
        Docker compose file, and network via netplan.
        """
        result: Dict[str, Any] = {"steps": []}

        # Wait for agent
        print(f"[Provision] Waiting for guest agent on VM {vmid}...")
        if not await self.guest_agent_available(node_id, vmid, timeout=120):
            result["steps"].append({"step": "agent", "status": "failed", "detail": "Guest agent not available"})
            return result
        result["steps"].append({"step": "agent", "status": "ready"})
        print(f"[Provision] Guest agent ready on VM {vmid}")

        # User & password
        user = config.get('default_user')
        password_hash = config.get('password_hash')  # SHA-512 hash recommended
        if user:
            print(f"[Provision] Creating user {user}...")
            code, out, err = await self.guest_agent_exec(node_id, vmid, f"id -u {user} 2>/dev/null || useradd -m -s /bin/bash {user}")
            result["steps"].append({"step": "useradd", "status": "ok" if code == 0 else "error", "detail": err or out})
            print(f"[Provision] User creation result: code={code}, out={out}, err={err}")
            
            if password_hash:
                # Set hashed password (chpasswd -e expects 'user:hash')
                print(f"[Provision] Setting password for {user}...")
                code, out, err = await self.guest_agent_exec(node_id, vmid, f"echo '{user}:{password_hash}' | chpasswd -e")
                result["steps"].append({"step": "setpass", "status": "ok" if code == 0 else "error", "detail": err or out})
                print(f"[Provision] Password set result: code={code}, out={out}, err={err}")
            
            # Add user to sudo group
            print(f"[Provision] Adding {user} to sudo group...")
            code, out, err = await self.guest_agent_exec(node_id, vmid, f"usermod -aG sudo {user} 2>/dev/null || usermod -aG wheel {user}")
            result["steps"].append({"step": "sudo", "status": "ok" if code == 0 else "error", "detail": err or out})
            print(f"[Provision] Sudo group result: code={code}")

        # SSH authorized keys
        keys = config.get('ssh_authorized_keys') or []
        if user and keys:
            print(f"[Provision] Setting up SSH keys for {user}...")
            auth_path = f"/home/{user}/.ssh/authorized_keys"
            ok = await self.guest_write_file(node_id, vmid, auth_path, "\n".join(keys), mode='0600', owner=f"{user}:{user}")
            result["steps"].append({"step": "ssh_keys", "status": "ok" if ok else "error"})
            print(f"[Provision] SSH keys result: {ok}")
            
            # Ensure sshd permits password auth if requested
            if config.get('ssh_pwauth') is not None:
                # Update sshd_config PasswordAuthentication
                pw = 'yes' if config['ssh_pwauth'] else 'no'
                print(f"[Provision] Setting SSH password auth to {pw}...")
                cmd = f"sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication {pw}/' /etc/ssh/sshd_config && systemctl restart sshd || systemctl restart ssh"
                code, out, err = await self.guest_agent_exec(node_id, vmid, cmd)
                result["steps"].append({"step": "sshd_pwauth", "status": "ok" if code == 0 else "error", "detail": err or out})
                print(f"[Provision] SSH pw auth result: code={code}")

        # Hostname & timezone
        if config.get('hostname'):
            print(f"[Provision] Setting hostname to {config['hostname']}...")
            code, out, err = await self.guest_agent_exec(node_id, vmid, f"hostnamectl set-hostname '{config['hostname']}'")
            result["steps"].append({"step": "hostname", "status": "ok" if code == 0 else "error", "detail": err or out})
            print(f"[Provision] Hostname result: code={code}")
            
        if config.get('timezone'):
            print(f"[Provision] Setting timezone to {config['timezone']}...")
            code, out, err = await self.guest_agent_exec(node_id, vmid, f"timedatectl set-timezone '{config['timezone']}'")
            result["steps"].append({"step": "timezone", "status": "ok" if code == 0 else "error", "detail": err or out})
            print(f"[Provision] Timezone result: code={code}")

        # Packages
        packages = config.get('packages') or []
        if packages:
            pkg_str = " ".join(packages)
            print(f"[Provision] Installing packages: {pkg_str}...")
            code, out, err = await self.guest_agent_exec(node_id, vmid, "apt-get update -y || apt update -y", timeout=300)
            result["steps"].append({"step": "apt_update", "status": "ok" if code == 0 else "error", "detail": err or out})
            print(f"[Provision] apt update result: code={code}")
            
            code, out, err = await self.guest_agent_exec(node_id, vmid, f"DEBIAN_FRONTEND=noninteractive apt-get install -y {pkg_str} || apt install -y {pkg_str}", timeout=600)
            result["steps"].append({"step": "apt_install", "status": "ok" if code == 0 else "error", "detail": err or out})
            print(f"[Provision] apt install result: code={code}")

        # If registry credentials provided, ensure docker installation
        if (config.get('docker_registry_url') and config.get('docker_registry_username') and config.get('docker_registry_password')) and not config.get('install_docker'):
            config['install_docker'] = True

        # Docker (install & repo setup)
        if config.get('install_docker'):
            print(f"[Provision] Installing Docker with official repo...")
            repo_cmd = (
                "set -e; "
                "apt-get update -y || apt update -y; "
                "apt-get install -y ca-certificates curl gnupg; "
                "install -m 0755 -d /etc/apt/keyrings; "
                "curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg; "
                "chmod a+r /etc/apt/keyrings/docker.gpg; "
                "echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable\" > /etc/apt/sources.list.d/docker.list; "
                "apt-get update -y || apt update -y"
            )
            code, out, err = await self.guest_agent_exec(node_id, vmid, repo_cmd, timeout=300)
            result["steps"].append({"step": "docker_repo", "status": "ok" if code == 0 else "warning", "detail": err or out})
            print(f"[Provision] Docker repo setup result: code={code}")

            install_cmd = (
                "DEBIAN_FRONTEND=noninteractive apt-get install -y "
                "docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin "
                "|| apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
            )
            code, out, err = await self.guest_agent_exec(node_id, vmid, install_cmd, timeout=600)
            result["steps"].append({"step": "docker_install", "status": "ok" if code == 0 else "error", "detail": err or out})
            print(f"[Provision] Docker install result: code={code}")

        # Docker registry auth (logout then login if provided)
        if config.get('docker_registry_url') and config.get('docker_registry_username') and config.get('docker_registry_password'):
            reg_url = config.get('docker_registry_url')
            reg_user = config.get('docker_registry_username')
            reg_pass = (config.get('docker_registry_password') or "").replace("'", "'\"'\"'")
            print(f"[Provision] Authenticating docker registry {reg_url}...")
            # Logout previous session for that registry (ignore failure)
            await self.guest_agent_exec(node_id, vmid, f"docker logout {reg_url} || true", timeout=60)
            login_cmd = f"echo '{reg_pass}' | docker login {reg_url} -u '{reg_user}' --password-stdin"
            code, out, err = await self.guest_agent_exec(node_id, vmid, login_cmd, timeout=120)
            result["steps"].append({"step": "docker_login", "status": "ok" if code == 0 else "error", "detail": err or out})
            print(f"[Provision] Docker login result: code={code}")

        # Docker compose (supports multiple files)
        compose_entries = []
        if config.get('docker_compose_files'):
            for entry in config['docker_compose_files']:
                normalized = dict(entry)
                if 'start' not in normalized:
                    normalized['start'] = bool(entry.get('start_on_deploy'))
                normalized['start_on_boot'] = bool(entry.get('start_on_boot'))
                compose_entries.append(normalized)
        if config.get('docker_compose_content'):
            compose_entries.append({
                "content": config['docker_compose_content'],
                "path": config.get('docker_compose_path') or '/root/docker-compose.yml',
                "start": bool(config.get('start_docker_compose')),
                "start_on_boot": False
            })

        if compose_entries and not config.get('install_docker'):
            config['install_docker'] = True

        for entry in compose_entries:
            content = entry.get('content')
            path = entry.get('path') or '/root/docker-compose.yml'
            start = bool(entry.get('start'))
            start_on_boot = bool(entry.get('start_on_boot'))
            if not content:
                continue
            print(f"[Provision] Writing docker-compose to {path}...")
            ok = await self.guest_write_file(node_id, vmid, path, content, mode='0644', owner='root:root')
            result["steps"].append({"step": f"compose_write:{path}", "status": "ok" if ok else "error"})
            print(f"[Provision] Docker compose write result: {ok}")
            
            if start:
                dir_path = path.rsplit('/', 1)[0]
                filename = path.rsplit('/', 1)[1] if '/' in path else path
                print(f"[Provision] Starting docker compose at {dir_path}...")
                code, out, err = await self.guest_agent_exec(node_id, vmid, f"cd '{dir_path}' && (docker compose -f {filename} up -d || docker-compose -f {filename} up -d)", timeout=300)
                result["steps"].append({"step": f"compose_up:{path}", "status": "ok" if code == 0 else "error", "detail": err or out})
                print(f"[Provision] Docker compose up result: code={code}")

            if start_on_boot:
                dir_path = path.rsplit('/', 1)[0]
                # Use service_name from entry if provided, otherwise generate from filename
                service_name = entry.get('service_name') or f"kvcloud-compose-{os.path.basename(path).replace('.', '-')}"
                service_path = f"/etc/systemd/system/{service_name}.service"
                unit_content = (
                    "[Unit]\n"
                    f"Description=KVCloud Compose {path}\n"
                    "Requires=docker.service\n"
                    "After=docker.service network-online.target\n\n"
                    "[Service]\n"
                    "Type=oneshot\n"
                    "RemainAfterExit=yes\n"
                    f"WorkingDirectory={dir_path}\n"
                    f"ExecStart=/usr/bin/env sh -c 'docker compose -f {path} up -d || docker-compose -f {path} up -d'\n"
                    f"ExecStop=/usr/bin/env sh -c 'docker compose -f {path} down || docker-compose -f {path} down'\n"
                    "TimeoutStartSec=300\n"
                    "TimeoutStopSec=120\n\n"
                    "[Install]\n"
                    "WantedBy=multi-user.target\n"
                )
                print(f"[Provision] Installing compose systemd unit {service_name}...")
                ok_unit = await self.guest_write_file(node_id, vmid, service_path, unit_content, mode='0644', owner='root:root')
                result["steps"].append({"step": f"compose_unit:{service_name}", "status": "ok" if ok_unit else "error"})
                if ok_unit:
                    code, out, err = await self.guest_agent_exec(node_id, vmid, "systemctl daemon-reload", timeout=60)
                    result["steps"].append({"step": f"daemon_reload:{service_name}", "status": "ok" if code == 0 else "warning", "detail": err or out})
                    code, out, err = await self.guest_agent_exec(node_id, vmid, f"systemctl enable --now {service_name}", timeout=120)
                    result["steps"].append({"step": f"compose_enable:{service_name}", "status": "ok" if code == 0 else "error", "detail": err or out})

        # Expand disk/filesystem (in case disk was resized)
        print(f"[Provision] Expanding disk/filesystem if needed...")
        code, out, err = await self.guest_agent_exec(node_id, vmid, "growpart /dev/sda 1 2>/dev/null || growpart /dev/vda 1 2>/dev/null || true", timeout=60)
        result["steps"].append({"step": "growpart", "status": "ok", "detail": out or "Partition expansion attempted"})
        print(f"[Provision] Growpart result: code={code}, out={out}")
        
        code, out, err = await self.guest_agent_exec(node_id, vmid, "resize2fs /dev/sda1 2>/dev/null || resize2fs /dev/vda1 2>/dev/null || xfs_growfs / 2>/dev/null || true", timeout=60)
        result["steps"].append({"step": "resize_fs", "status": "ok", "detail": out or "Filesystem resize attempted"})
        print(f"[Provision] Resize filesystem result: code={code}, out={out}")

        # Network (netplan)
        if config.get('network_yaml'):
            print(f"[Provision] Configuring network via netplan...")
            print(f"[Provision] Network YAML content:\n{config['network_yaml']}")
            
            # First, remove any cloud-init netplan files that might conflict
            print(f"[Provision] Removing cloud-init netplan files...")
            code, out, err = await self.guest_agent_exec(node_id, vmid, "rm -f /etc/netplan/*cloud-init*.yaml /etc/netplan/50-cloud-init.yaml", timeout=30)
            result["steps"].append({"step": "remove_cloudinit_netplan", "status": "ok" if code == 0 else "error", "detail": err or out})
            print(f"[Provision] Remove cloud-init netplan result: code={code}")
            
            # Write our netplan config with stricter permissions (0600)
            ok = await self.guest_write_file(node_id, vmid, '/etc/netplan/50-kvcloud.yaml', config['network_yaml'], mode='0600', owner='root:root')
            result["steps"].append({"step": "netplan_write", "status": "ok" if ok else "error"})
            print(f"[Provision] Netplan write result: {ok}")
            
            if ok:
                # List netplan files to verify
                print(f"[Provision] Listing netplan files...")
                code, out, err = await self.guest_agent_exec(node_id, vmid, "ls -la /etc/netplan/ && cat /etc/netplan/50-kvcloud.yaml", timeout=30)
                print(f"[Provision] Netplan files: {out}")
                
                # Validate netplan config
                print(f"[Provision] Validating netplan configuration...")
                code, out, err = await self.guest_agent_exec(node_id, vmid, "netplan validate 2>&1 || true", timeout=30)
                print(f"[Provision] Netplan validate result: code={code}, out={out}, err={err}")
                result["steps"].append({"step": "netplan_validate", "status": "ok" if code == 0 else "warning", "detail": err or out})
                
                # Generate netplan
                print(f"[Provision] Generating netplan...")
                code, out, err = await self.guest_agent_exec(node_id, vmid, "netplan generate", timeout=30)
                print(f"[Provision] Netplan generate result: code={code}, out={out}, err={err}")
                result["steps"].append({"step": "netplan_generate", "status": "ok" if code == 0 else "error", "detail": err or out})
                
                if code == 0:
                    # Apply netplan
                    print(f"[Provision] Applying netplan configuration...")
                    apply_cmd = "netplan apply 2>&1"
                    code, out, err = await self.guest_agent_exec(node_id, vmid, apply_cmd, timeout=60)
                    result["steps"].append({"step": "netplan_apply", "status": "ok" if code == 0 else "error", "detail": err or out})
                    print(f"[Provision] Netplan apply result: code={code}, out={out}, err={err}")
                    
                    # Restart networkd service
                    if code == 0:
                        print(f"[Provision] Restarting systemd-networkd...")
                        code2, out2, err2 = await self.guest_agent_exec(node_id, vmid, "systemctl restart systemd-networkd", timeout=30)
                        print(f"[Provision] Networkd restart: code={code2}")
                        result["steps"].append({"step": "networkd_restart", "status": "ok" if code2 == 0 else "error", "detail": err2 or out2})

        print(f"[Provision] Provisioning complete for VM {vmid}")
        return result

    async def apply_cloud_init(self, node_id: int, vmid: int, ci: Dict[str, Any]) -> bool:
        """Apply cloud-init configuration to a VM."""
        node = await self.get_node(node_id)
        if not node:
            return False

        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            print(f"[CloudInit] Applying cloud-init to VM {vmid} on node {node_name}")
            print(f"[CloudInit] Input config: {ci}")
            
            # First, add cloud-init drive if not present (ide2 is standard for cloud-init)
            try:
                current_config = proxmox.nodes(node_name).qemu(vmid).config.get()
                print(f"[CloudInit] Current VM config keys: {list(current_config.keys())}")
                if 'ide2' not in current_config or 'cloudinit' not in str(current_config.get('ide2', '')):
                    # Add cloud-init drive on ide2
                    print(f"[CloudInit] Adding cloud-init drive on ide2...")
                    proxmox.nodes(node_name).qemu(vmid).config.put(ide2='local:cloudinit')
                    print(f"[CloudInit] Cloud-init drive added successfully")
            except Exception as e:
                print(f"Warning: Could not add cloud-init drive: {e}")
            
            # Set cloud-init fields supported by Proxmox
            # Fields: ciuser, cipassword, sshkeys, ipconfig0, nameserver, searchdomain
            config = {}
            for key in ("ciuser", "cipassword", "sshkeys", "ipconfig0", "nameserver", "searchdomain"):
                if key in ci and ci[key] is not None:
                    config[key] = ci[key]
            
            if config:
                print(f"[CloudInit] Setting config fields: {list(config.keys())}")
                print(f"[CloudInit] Config values: {config}")
                # Use PUT to update existing VM configuration
                proxmox.nodes(node_name).qemu(vmid).config.put(**config)
                print(f"[CloudInit] Applied cloud-init config to VM {vmid}: {list(config.keys())}")
                print(f"[CloudInit] Details - ipconfig0: {config.get('ipconfig0', 'N/A')}, ciuser: {config.get('ciuser', 'N/A')}")

                # Regenerate cloud-init ISO so changes take effect on next boot
                try:
                    self._regenerate_cloudinit_iso(node, vmid)
                except Exception as regen_err:
                    print(f"[CloudInit] Warning: failed to regenerate cloud-init ISO via SSH: {regen_err}")
                    # Not fatal; the user can run `qm cloudinit update {vmid}` manually
            else:
                print(f"[CloudInit] No config to apply (all fields were None)")
            return True
        except Exception as e:
            print(f"[CloudInit] Error applying cloud-init: {e}")
            import traceback
            traceback.print_exc()
            return False

    async def apply_cloud_init_user_data(self, node_id: int, vmid: int, user_data_yaml: str, storage: str = "local") -> bool:
        """Upload cloud-init user-data YAML as a snippet and configure cicustom.

        - Uploads YAML to /var/lib/vz/snippets/{vmid}-user-data.yaml
        - Sets VM config: cicustom = f"user={storage}:snippets/{filename}"
        - Regenerates cloud-init ISO
        """
        node = await self.get_node(node_id)
        if not node:
            return False

        filename = f"vm-{vmid}-user-data.yaml"
        remote_path = f"/var/lib/vz/snippets/{filename}"

        try:
            # Upload snippet over SSH/SFTP
            self._upload_snippet(node, remote_path, user_data_yaml)

            # Configure cicustom to point at the snippet
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            cicustom_value = f"user={storage}:snippets/{filename}"
            print(f"[CloudInit] Setting cicustom: {cicustom_value}")
            proxmox.nodes(node_name).qemu(vmid).config.put(cicustom=cicustom_value)

            # Regenerate ISO
            self._regenerate_cloudinit_iso(node, vmid)
            return True
        except Exception as e:
            print(f"[CloudInit] Failed to apply user-data snippet: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _upload_snippet(self, node: ProxmoxNode, remote_path: str, content: str) -> None:
        """Upload a snippet file to the Proxmox node via SFTP, ensuring directory exists."""
        host = node.host
        username = node.ssh_username or "root"
        password = node.ssh_password

        if not host:
            raise RuntimeError("Missing Proxmox host for SSH upload")
        if not username or not password:
            raise RuntimeError("Missing SSH credentials on Proxmox node (ssh_username/ssh_password)")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(hostname=host, username=username, password=password, port=22, timeout=15)

            # Ensure directory exists
            dir_path = "/".join(remote_path.split("/")[:-1])
            mkdir_cmd = f"mkdir -p '{dir_path}' && chown root:root '{dir_path}'"
            _, stdout, stderr = client.exec_command(mkdir_cmd)
            _ = stdout.channel.recv_exit_status()

            # Upload file
            sftp = client.open_sftp()
            with sftp.file(remote_path, 'w') as f:
                f.write(content)
            sftp.chmod(remote_path, 0o644)
            sftp.close()
            print(f"[CloudInit] Uploaded snippet to {remote_path}")
        finally:
            try:
                client.close()
            except Exception:
                pass

    def _regenerate_cloudinit_iso(self, node: ProxmoxNode, vmid: int) -> None:
        """Regenerate cloud-init ISO on the Proxmox node using SSH.

        This mirrors `qm cloudinit update <vmid>` and ensures the NoCloud seed
        is rebuilt after changing Proxmox VM config (ciuser, ipconfig0, etc.).
        """
        host = node.host
        username = node.ssh_username or "root"
        password = node.ssh_password

        if not host:
            raise RuntimeError("Missing Proxmox host for SSH execution")
        if not username or not password:
            raise RuntimeError("Missing SSH credentials on Proxmox node (ssh_username/ssh_password)")

        print(f"[CloudInit] Regenerating cloud-init ISO via SSH on {host} for VM {vmid}...")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(hostname=host, username=username, password=password, port=22, timeout=15)
            stdin, stdout, stderr = client.exec_command(f"qm cloudinit update {vmid}")
            exit_status = stdout.channel.recv_exit_status()
            out = stdout.read().decode().strip()
            err = stderr.read().decode().strip()
            if exit_status == 0:
                print(f"[CloudInit] Cloud-init ISO regenerated successfully for VM {vmid}.")
                if out:
                    print(f"[CloudInit] qm output: {out}")
            else:
                raise RuntimeError(f"qm cloudinit update failed (exit {exit_status}): {err or out}")
        finally:
            try:
                client.close()
            except Exception:
                pass

    def _parse_cicustom_user_entry(self, cicustom: str) -> Optional[Dict[str, str]]:
        """Parse cicustom value and return dict with storage and relative path for user-data.

        Example cicustom formats:
          - "user=local:snippets/vm-100-user-data.yaml"
          - "user=local:snippets/u.yaml,meta=local:snippets/m.yaml"
        """
        if not cicustom:
            return None
        try:
            parts = [p.strip() for p in cicustom.split(',') if p.strip()]
            for p in parts:
                if p.startswith('user='):
                    _, val = p.split('=', 1)
                    storage, relpath = val.split(':', 1)
                    return {"storage": storage, "path": relpath}
        except Exception:
            return None
        return None

    def _read_snippet_file(self, node: ProxmoxNode, storage: str, relpath: str) -> Optional[str]:
        """Read a snippet file content from Proxmox node via SFTP.

        Currently supports 'local' storage at /var/lib/vz.
        """
        base = None
        if storage == 'local':
            base = '/var/lib/vz'
        else:
            # Unsupported storage for now
            return None

        abs_path = f"{base}/{relpath.lstrip('/')}"
        host = node.host
        username = node.ssh_username or "root"
        password = node.ssh_password

        if not (host and username and password):
            return None

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(hostname=host, username=username, password=password, port=22, timeout=15)
            sftp = client.open_sftp()
            try:
                with sftp.file(abs_path, 'r') as f:
                    return f.read().decode()
            finally:
                sftp.close()
        except Exception:
            return None
        finally:
            try:
                client.close()
            except Exception:
                pass

    async def get_active_user_data_yaml(self, node_id: int, vmid: int) -> Optional[str]:
        """Return the active user-data YAML content if cicustom user snippet is set."""
        node = await self.get_node(node_id)
        if not node:
            return None
        cfg = await self.get_vm_config(node_id, vmid)
        if not cfg:
            return None
        cicustom = cfg.get('cicustom')
        entry = self._parse_cicustom_user_entry(cicustom) if cicustom else None
        if not entry:
            return None
        return self._read_snippet_file(node, entry['storage'], entry['path'])
    
    async def get_node_status(self, node_id: int) -> Optional[Dict[str, Any]]:
        """Get status of a Proxmox node."""
        node = await self.get_node(node_id)
        if not node:
            return None
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            status = proxmox.nodes(node_name).status.get()
            return status
        except Exception as e:
            print(f"Error getting node status: {e}")
            return None
    
    async def get_node_rrd_data(self, node_id: int, timeframe: str = 'hour') -> List[Dict[str, Any]]:
        """Get node RRD (Round Robin Database) metrics data."""
        node = await self.get_node(node_id)
        if not node:
            return []
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            # Proxmox RRD API: /nodes/{node}/rrddata?timeframe=hour|day|week|month|year
            rrd_data = proxmox.nodes(node_name).rrddata.get(timeframe=timeframe)
            print(f"[DEBUG] Node RRD data sample: {rrd_data[0] if rrd_data else 'empty'}")
            return rrd_data
        except Exception as e:
            print(f"Error getting node RRD data: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    async def list_vms(self, node_id: int) -> List[Dict[str, Any]]:
        """List all VMs on a node."""
        node = await self.get_node(node_id)
        if not node:
            return []
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            vms = proxmox.nodes(node_name).qemu.get()
            return vms
        except Exception as e:
            print(f"Error listing VMs: {e}")
            return []
    
    async def get_next_vmid(self, node_id: int) -> int:
        """Get next available VM ID."""
        node = await self.get_node(node_id)
        if not node:
            return 100
        
        try:
            proxmox = self._get_proxmox_connection(node)
            # Get next available VMID from Proxmox
            return proxmox.cluster.nextid.get()
        except Exception as e:
            print(f"Error getting next VMID: {e}")
            # Fallback: find max VMID and add 1
            vms = await self.list_vms(node_id)
            if vms:
                max_vmid = max(vm.get('vmid', 100) for vm in vms)
                return max_vmid + 1
            return 100
    
    async def get_vm_status(self, node_id: int, vmid: int) -> Optional[Dict[str, Any]]:
        """Get status of a specific VM."""
        node = await self.get_node(node_id)
        if not node:
            return None
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            status = proxmox.nodes(node_name).qemu(vmid).status.current.get()
            return status
        except Exception as e:
            print(f"Error getting VM status: {e}")
            return None
    
    async def get_vm_rrd_data(self, node_id: int, vmid: int, timeframe: str = 'hour') -> List[Dict[str, Any]]:
        """Get VM RRD (Round Robin Database) metrics data."""
        node = await self.get_node(node_id)
        if not node:
            return []
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            # Proxmox RRD API: /nodes/{node}/qemu/{vmid}/rrddata?timeframe=hour|day|week|month|year
            rrd_data = proxmox.nodes(node_name).qemu(vmid).rrddata.get(timeframe=timeframe)
            return rrd_data
        except Exception as e:
            print(f"Error getting VM RRD data: {e}")
            return []
    
    async def start_vm(self, node_id: int, vmid: int) -> bool:
        """Start a VM."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            proxmox.nodes(node_name).qemu(vmid).status.start.post()
            return True
        except Exception as e:
            print(f"Error starting VM: {e}")
            return False
    
    async def stop_vm(self, node_id: int, vmid: int) -> bool:
        """Stop a VM."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            proxmox.nodes(node_name).qemu(vmid).status.stop.post()
            return True
        except Exception as e:
            print(f"Error stopping VM: {e}")
            return False
    
    async def restart_vm(self, node_id: int, vmid: int) -> bool:
        """Restart a VM."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            proxmox.nodes(node_name).qemu(vmid).status.reboot.post()
            return True
        except Exception as e:
            print(f"Error restarting VM: {e}")
            return False
    
    async def pause_vm(self, node_id: int, vmid: int) -> bool:
        """Pause a VM (suspend to RAM)."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            proxmox.nodes(node_name).qemu(vmid).status.suspend.post()
            return True
        except Exception as e:
            print(f"Error pausing VM: {e}")
            return False
    
    async def resume_vm(self, node_id: int, vmid: int) -> bool:
        """Resume a paused VM."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            proxmox.nodes(node_name).qemu(vmid).status.resume.post()
            return True
        except Exception as e:
            print(f"Error resuming VM: {e}")
            return False
    
    async def shutdown_vm(self, node_id: int, vmid: int) -> bool:
        """Graceful shutdown of a VM."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            proxmox.nodes(node_name).qemu(vmid).status.shutdown.post()
            return True
        except Exception as e:
            print(f"Error shutting down VM: {e}")
            return False
    
    async def get_vm_stats(self, node_id: int, vmid: int) -> Dict[str, Any]:
        """
        Get current VM statistics including CPU, memory, disk, and network usage.
        
        Args:
            node_id: Node ID
            vmid: VM ID
            
        Returns:
            Dictionary with current statistics
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get current VM status which includes current usage
            status = proxmox.nodes(node_name).qemu(vmid).status.current.get()
            
            # Calculate percentages
            cpu_percent = round((status.get('cpu', 0) * 100), 2)
            mem_percent = 0
            if status.get('maxmem', 0) > 0:
                mem_percent = round((status.get('mem', 0) / status.get('maxmem', 1)) * 100, 2)
            
            disk_percent = 0
            if status.get('maxdisk', 0) > 0:
                disk_percent = round((status.get('disk', 0) / status.get('maxdisk', 1)) * 100, 2)
            
            return {
                'cpu': cpu_percent,
                'cpu_cores': status.get('cpus', 0),
                'memory': status.get('mem', 0),
                'memory_max': status.get('maxmem', 0),
                'memory_percent': mem_percent,
                'disk': status.get('disk', 0),
                'disk_max': status.get('maxdisk', 0),
                'disk_percent': disk_percent,
                'netin': status.get('netin', 0),
                'netout': status.get('netout', 0),
                'uptime': status.get('uptime', 0),
                'status': status.get('status', 'unknown')
            }
        except Exception as e:
            print(f"Error getting VM stats: {e}")
            raise
    
    async def get_node_stats(self, node_id: int) -> Dict[str, Any]:
        """Get node statistics including CPU, memory, storage, and VM count.
        
        Args:
            node_id: Node ID
            
        Returns:
            Dictionary with node statistics
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get node status
            node_status = proxmox.nodes(node_name).status.get()
            
            # Get VM list for count
            vms = proxmox.nodes(node_name).qemu.get()
            running_vms = len([vm for vm in vms if vm.get('status') == 'running'])
            
            # Calculate percentages
            cpu_percent = round((node_status.get('cpu', 0) * 100), 2)
            mem_percent = 0
            if node_status.get('memory', {}).get('total', 0) > 0:
                mem_percent = round(
                    (node_status.get('memory', {}).get('used', 0) / 
                     node_status.get('memory', {}).get('total', 1)) * 100, 2
                )
            
            # Storage info
            rootfs_percent = 0
            if node_status.get('rootfs', {}).get('total', 0) > 0:
                rootfs_percent = round(
                    (node_status.get('rootfs', {}).get('used', 0) / 
                     node_status.get('rootfs', {}).get('total', 1)) * 100, 2
                )
            
            return {
                'node_name': node_name,
                'node_id': node_id,
                'cpu_percent': cpu_percent,
                'cpu_count': node_status.get('cpuinfo', {}).get('cpus', 0),
                'memory_used': node_status.get('memory', {}).get('used', 0),
                'memory_total': node_status.get('memory', {}).get('total', 0),
                'memory_percent': mem_percent,
                'memory_free': node_status.get('memory', {}).get('free', 0),
                'rootfs_used': node_status.get('rootfs', {}).get('used', 0),
                'rootfs_total': node_status.get('rootfs', {}).get('total', 0),
                'rootfs_percent': rootfs_percent,
                'rootfs_avail': node_status.get('rootfs', {}).get('avail', 0),
                'uptime': node_status.get('uptime', 0),
                'pveversion': node_status.get('pveversion', 'unknown'),
                'kversion': node_status.get('kversion', 'unknown'),
                'loadavg': node_status.get('loadavg', []),
                'total_vms': len(vms),
                'running_vms': running_vms,
                'stopped_vms': len(vms) - running_vms
            }
        except Exception as e:
            print(f"Error getting node stats: {e}")
            raise
    
    # Disk Management Methods
    
    async def list_vm_disks(self, node_id: int, vmid: int) -> List[Dict[str, Any]]:
        """List all disks attached to a VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get VM config
            config = proxmox.nodes(node_name).qemu(vmid).config.get()
            
            disks = []
            # Check for disks (scsi0-scsi30, virtio0-virtio15, ide0-ide3, sata0-sata5)
            disk_interfaces = ['scsi', 'virtio', 'ide', 'sata']
            disk_limits = {'scsi': 31, 'virtio': 16, 'ide': 4, 'sata': 6}
            
            for interface in disk_interfaces:
                for i in range(disk_limits[interface]):
                    disk_key = f"{interface}{i}"
                    if disk_key in config:
                        disk_value = config[disk_key]
                        if isinstance(disk_value, str) and 'cdrom' not in disk_value.lower():
                            # Parse disk string: "local-lvm:vm-100-disk-0,size=32G"
                            parts = disk_value.split(',')
                            storage_volume = parts[0]
                            
                            # Extract size
                            size = None
                            for part in parts:
                                if part.startswith('size='):
                                    size = part.split('=')[1]
                                    break
                            
                            # Split storage and volume
                            storage = storage_volume.split(':')[0] if ':' in storage_volume else None
                            
                            disks.append({
                                'id': disk_key,
                                'interface': interface,
                                'index': i,
                                'storage': storage,
                                'volume': storage_volume,
                                'size': size,
                                'full_config': disk_value
                            })
            
            return disks
        except Exception as e:
            print(f"Error listing VM disks: {e}")
            raise
    
    async def add_vm_disk(self, node_id: int, vmid: int, disk_config: Dict[str, Any]) -> str:
        """Add a new disk to a VM.
        
        Args:
            node_id: Node ID
            vmid: VM ID
            disk_config: Dictionary with disk configuration:
                - storage: Storage name (required)
                - size: Size in GB (required)
                - interface: Disk interface (scsi, virtio, ide, sata) - default: scsi
                - cache: Cache mode (none, writethrough, writeback) - optional
                - discard: Enable discard/TRIM (on, off) - optional
                - ssd: Emulate SSD (1, 0) - optional
                
        Returns:
            Task UPID or disk identifier
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get current disks to find next available slot
            current_disks = await self.list_vm_disks(node_id, vmid)
            interface = disk_config.get('interface', 'scsi')
            
            # Find next available slot for this interface
            used_indices = [d['index'] for d in current_disks if d['interface'] == interface]
            next_index = 0
            while next_index in used_indices:
                next_index += 1
            
            disk_id = f"{interface}{next_index}"
            
            # Build disk string
            storage = disk_config['storage']
            size = disk_config['size']
            disk_string = f"{storage}:{size}"
            
            # Add optional parameters
            if disk_config.get('cache'):
                disk_string += f",cache={disk_config['cache']}"
            if disk_config.get('discard'):
                disk_string += f",discard={disk_config['discard']}"
            if disk_config.get('ssd'):
                disk_string += f",ssd={disk_config['ssd']}"
            
            # Update VM config to add disk
            result = proxmox.nodes(node_name).qemu(vmid).config.put(**{disk_id: disk_string})
            
            return disk_id
        except Exception as e:
            print(f"Error adding VM disk: {e}")
            raise
    
    async def resize_vm_disk(self, node_id: int, vmid: int, disk_id: str, size_increment: str) -> bool:
        """Resize a VM disk.
        
        Args:
            node_id: Node ID
            vmid: VM ID
            disk_id: Disk identifier (e.g., 'scsi0', 'virtio0')
            size_increment: Size to add (e.g., '+10G')
            
        Returns:
            True if successful
        """
        # v2 - Direct implementation without reboot wait
        import asyncio
        
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        proxmox = self._get_proxmox_connection(node)
        node_name = self._get_proxmox_node_name(node)
        
        # Get VM status before resize
        vm_status_before = proxmox.nodes(node_name).qemu(vmid).status.current.get()
        
        # Resize disk
        proxmox.nodes(node_name).qemu(vmid).resize.put(
            disk=disk_id,
            size=size_increment
        )
        
        # If VM is running, reboot it so the guest OS detects the new size
        if vm_status_before.get('status') == 'running':
            try:
                proxmox.nodes(node_name).qemu(vmid).status.reboot.post()
            except Exception:
                pass
        
        return True
    
    async def delete_vm_disk(self, node_id: int, vmid: int, disk_id: str) -> bool:
        """Delete a disk from a VM.
        
        Args:
            node_id: Node ID
            vmid: VM ID
            disk_id: Disk identifier (e.g., 'scsi0', 'virtio0')
            
        Returns:
            True if successful
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Delete disk by setting it to empty string
            result = proxmox.nodes(node_name).qemu(vmid).config.put(**{disk_id: ''})
            
            return True
        except Exception as e:
            print(f"Error deleting VM disk: {e}")
            raise
    
    # Network Interface Management Methods
    
    async def list_vm_network_interfaces(self, node_id: int, vmid: int) -> List[Dict[str, Any]]:
        """List all network interfaces attached to a VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get VM config
            config = proxmox.nodes(node_name).qemu(vmid).config.get()
            
            interfaces = []
            # Check for network interfaces (net0-net31)
            for i in range(32):
                net_key = f"net{i}"
                if net_key in config:
                    net_value = config[net_key]
                    if isinstance(net_value, str):
                        # Parse network string: "virtio=XX:XX:XX:XX:XX:XX,bridge=vmbr0,firewall=1"
                        parts = dict(part.split('=', 1) for part in net_value.split(',') if '=' in part)
                        
                        interfaces.append({
                            'id': net_key,
                            'index': i,
                            'model': parts.get('virtio') or parts.get('e1000') or parts.get('rtl8139') or 'unknown',
                            'mac': parts.get('virtio') or parts.get('e1000') or parts.get('rtl8139'),
                            'bridge': parts.get('bridge', ''),
                            'firewall': parts.get('firewall') == '1',
                            'link_down': parts.get('link_down') == '1',
                            'rate': parts.get('rate'),
                            'tag': parts.get('tag'),
                            'trunks': parts.get('trunks'),
                            'full_config': net_value
                        })
            
            return interfaces
        except Exception as e:
            print(f"Error listing VM network interfaces: {e}")
            raise
    
    async def add_vm_network_interface(self, node_id: int, vmid: int, net_config: Dict[str, Any]) -> str:
        """Add a new network interface to a VM.
        
        Args:
            node_id: Node ID
            vmid: VM ID
            net_config: Dictionary with network configuration:
                - model: Network model (virtio, e1000, rtl8139) - default: virtio
                - bridge: Bridge name (required)
                - firewall: Enable firewall (bool) - optional
                - rate: Rate limit in MB/s - optional
                - tag: VLAN tag - optional
                
        Returns:
            Network interface ID (e.g., 'net0')
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get current interfaces to find next available slot
            current_interfaces = await self.list_vm_network_interfaces(node_id, vmid)
            used_indices = [iface['index'] for iface in current_interfaces]
            next_index = 0
            while next_index in used_indices and next_index < 32:
                next_index += 1
            
            if next_index >= 32:
                raise Exception("Maximum number of network interfaces reached")
            
            net_id = f"net{next_index}"
            
            # Build network string
            model = net_config.get('model', 'virtio')
            bridge = net_config['bridge']
            
            # Generate random MAC or use provided
            import random
            mac = net_config.get('mac')
            if not mac:
                mac = "52:54:00:%02x:%02x:%02x" % (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
            
            net_string = f"{model}={mac},bridge={bridge}"
            
            # Add optional parameters
            if net_config.get('firewall'):
                net_string += ",firewall=1"
            if net_config.get('rate'):
                net_string += f",rate={net_config['rate']}"
            if net_config.get('tag'):
                net_string += f",tag={net_config['tag']}"
            
            # Update VM config to add network interface
            result = proxmox.nodes(node_name).qemu(vmid).config.put(**{net_id: net_string})
            
            return net_id
        except Exception as e:
            print(f"Error adding VM network interface: {e}")
            raise
    
    async def update_vm_network_interface(self, node_id: int, vmid: int, net_id: str, net_config: Dict[str, Any]) -> bool:
        """Update a VM network interface.
        
        Args:
            node_id: Node ID
            vmid: VM ID
            net_id: Network interface ID (e.g., 'net0')
            net_config: Dictionary with updated network configuration
            
        Returns:
            True if successful
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get current config
            config = proxmox.nodes(node_name).qemu(vmid).config.get()
            if net_id not in config:
                raise Exception(f"Network interface {net_id} not found")
            
            # Parse current config
            current_value = config[net_id]
            parts = dict(part.split('=', 1) for part in current_value.split(',') if '=' in part)
            
            # Update with new values
            model = list(parts.keys())[0]  # First key is the model
            mac = parts[model]
            bridge = net_config.get('bridge', parts.get('bridge', 'vmbr0'))
            
            net_string = f"{model}={mac},bridge={bridge}"
            
            if net_config.get('firewall'):
                net_string += ",firewall=1"
            if net_config.get('rate'):
                net_string += f",rate={net_config['rate']}"
            if net_config.get('tag'):
                net_string += f",tag={net_config['tag']}"
            
            # Update interface
            result = proxmox.nodes(node_name).qemu(vmid).config.put(**{net_id: net_string})
            
            return True
        except Exception as e:
            print(f"Error updating VM network interface: {e}")
            raise
    
    async def delete_vm_network_interface(self, node_id: int, vmid: int, net_id: str) -> bool:
        """Delete a network interface from a VM.
        
        Args:
            node_id: Node ID
            vmid: VM ID
            net_id: Network interface ID (e.g., 'net0')
            
        Returns:
            True if successful
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Delete interface by setting it to empty string
            result = proxmox.nodes(node_name).qemu(vmid).config.put(**{net_id: ''})
            
            return True
        except Exception as e:
            print(f"Error deleting VM network interface: {e}")
            raise
    
    async def reset_vm(self, node_id: int, vmid: int) -> bool:
        """Reset a VM (hard reset)."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            proxmox.nodes(node_name).qemu(vmid).status.reset.post()
            return True
        except Exception as e:
            print(f"Error resetting VM: {e}")
            return False
    
    async def create_vm(self, node_id: int, vm_config: Dict[str, Any]) -> str:
        """Create a new VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            
            # Prepare VM configuration for Proxmox API
            config = {
                'vmid': vm_config['vmid'],
                'name': vm_config['name'],
                'cores': vm_config['cores'],
                'memory': vm_config['memory'],
                'ostype': vm_config.get('os_type', 'l26'),
                'net0': f"virtio,bridge={vm_config.get('network_bridge', 'vmbr0')}",
            }
            
            # Add storage configuration
            storage = vm_config.get('storage', 'local-lvm')
            disk_size = vm_config.get('disk_size', 32)
            config['scsi0'] = f"{storage}:{disk_size}G"  # Add G suffix for gigabytes
            
            # Add ISO if specified
            if vm_config.get('iso'):
                config['ide2'] = f"{storage}:iso/{vm_config['iso']},media=cdrom"
            
            # Clone from template if specified
            node_name = self._get_proxmox_node_name(node)
            if vm_config.get('template_id'):
                result = proxmox.nodes(node_name).qemu(vm_config['template_id']).clone.post(
                    newid=vm_config['vmid'],
                    name=vm_config['name']
                )
                # After cloning, resize the disk to requested size if different from template
                try:
                    # Get the cloned VM's current disk configuration
                    vm_info = proxmox.nodes(node_name).qemu(vm_config['vmid']).config.get()
                    print(f"Cloned VM config: {vm_info}")
                    
                    # Check if resize is needed
                    current_disk = vm_info.get('scsi0', '')
                    print(f"Current disk config: {current_disk}")
                    
                    # Resize scsi0 to the requested size
                    # Proxmox resize uses incremental size with +size format
                    print(f"Attempting to resize disk to {disk_size}G...")
                    proxmox.nodes(node_name).qemu(vm_config['vmid']).resize.put(
                        disk='scsi0',
                        size=f"+{disk_size}G"
                    )
                    print(f"Resized cloned VM disk by +{disk_size}G")
                    
                    # After resize, we need to reboot the VM if it's running
                    # For a freshly cloned VM, it's usually stopped, so we can skip this
                    vm_status = proxmox.nodes(node_name).qemu(vm_config['vmid']).status.current.get()
                    print(f"VM status after resize: {vm_status.get('status')}")
                    
                    if vm_status.get('status') == 'running':
                        # Shutdown and start the VM so Proxmox detects the new disk size
                        print(f"Shutting down running VM {vm_config['vmid']} to apply disk resize...")
                        try:
                            proxmox.nodes(node_name).qemu(vm_config['vmid']).status.shutdown.post()
                            # Wait for VM to stop (max 60 seconds)
                            import time
                            for i in range(60):
                                time.sleep(1)
                                status = proxmox.nodes(node_name).qemu(vm_config['vmid']).status.current.get()
                                if status.get('status') == 'stopped':
                                    break
                            print(f"Starting VM {vm_config['vmid']}...")
                            proxmox.nodes(node_name).qemu(vm_config['vmid']).status.start.post()
                        except Exception as shutdown_err:
                            print(f"Warning: Could not shutdown/start VM after resize: {shutdown_err}")
                except Exception as e:
                    print(f"Warning: Could not resize cloned disk: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                # Create new VM from scratch
                result = proxmox.nodes(node_name).qemu.post(**config)
            
            return result
        except Exception as e:
            print(f"Error creating VM: {e}")
            raise
    
    async def list_templates(self, node_id: int) -> List[Dict[str, Any]]:
        """List VM templates on a node."""
        node = await self.get_node(node_id)
        if not node:
            return []
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            vms = proxmox.nodes(node_name).qemu.get()
            # Filter for templates
            templates = [vm for vm in vms if vm.get('template', 0) == 1]
            return templates
        except Exception as e:
            print(f"Error listing templates: {e}")
            return []
    
    async def list_isos(self, node_id: int) -> List[Dict[str, Any]]:
        """List available ISO images on a node."""
        node = await self.get_node(node_id)
        if not node:
            return []
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            # List ISO storage content
            storages = proxmox.nodes(node_name).storage.get()
            isos = []
            
            for storage in storages:
                if storage.get('content', '').find('iso') != -1:
                    try:
                        content = proxmox.nodes(node_name).storage(storage['storage']).content.get(content='iso')
                        for item in content:
                            isos.append({
                                'volid': item.get('volid', ''),
                                'storage': storage['storage'],
                                'format': item.get('format', 'iso'),
                                'size': item.get('size', 0),
                                'name': item.get('volid', '').split('/')[-1]
                            })
                    except:
                        pass
            
            return isos
        except Exception as e:
            print(f"Error listing ISOs: {e}")
            return []
    
    async def list_storages(self, node_id: int) -> List[Dict[str, Any]]:
        """List available storage options on a node."""
        node = await self.get_node(node_id)
        if not node:
            return []
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            storages = proxmox.nodes(node_name).storage.get()
            
            # Format storage info
            formatted_storages = []
            for storage in storages:
                formatted_storages.append({
                    'storage': storage.get('storage', ''),
                    'type': storage.get('type', ''),
                    'content': storage.get('content', ''),
                    'active': storage.get('active', 0) == 1,
                    'avail': storage.get('avail', 0),
                    'used': storage.get('used', 0),
                    'total': storage.get('total', 0)
                })
            
            return formatted_storages
        except Exception as e:
            print(f"Error listing storages: {e}")
            return []
    
    async def upload_iso(self, node_id: int, storage: str, filename: str, url: str) -> str:
        """Upload ISO from URL to Proxmox storage.
        
        This starts a background download task. The ISO will be downloaded
        directly to the Proxmox node storage. Returns the task ID (UPID).
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Start ISO download task using download-url endpoint
            # This returns a task UPID that can be monitored
            # Note: Proxmoxer converts hyphens to underscores, so we use the Python-style name
            task_upid = proxmox.nodes(node_name).storage(storage)('download-url').post(
                content='iso',
                filename=filename,
                url=url
            )
            
            return task_upid
        except Exception as e:
            print(f"Error uploading ISO: {e}")
            raise Exception(f"Failed to upload ISO: {str(e)}")
    
    async def delete_iso(self, node_id: int, storage: str, volid: str):
        """Delete an ISO image from storage."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Delete the ISO
            proxmox.nodes(node_name).storage(storage).content(volid).delete()
            
        except Exception as e:
            print(f"Error deleting ISO: {e}")
            raise Exception(f"Failed to delete ISO: {str(e)}")
    
    async def mount_iso_to_vm(self, node_id: int, vmid: int, iso_volid: str) -> bool:
        """Mount an ISO image to a VM's CD-ROM drive."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Update the VM config to mount the ISO on ide2 (CD-ROM)
            proxmox.nodes(node_name).qemu(vmid).config.put(
                ide2=f"{iso_volid},media=cdrom"
            )
            return True
        except Exception as e:
            print(f"Error mounting ISO: {e}")
            raise Exception(f"Failed to mount ISO: {str(e)}")
    
    async def unmount_iso_from_vm(self, node_id: int, vmid: int) -> bool:
        """Unmount the ISO from a VM's CD-ROM drive."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Set ide2 to none to unmount
            proxmox.nodes(node_name).qemu(vmid).config.put(
                ide2="none,media=cdrom"
            )
            return True
        except Exception as e:
            print(f"Error unmounting ISO: {e}")
            raise Exception(f"Failed to unmount ISO: {str(e)}")
    
    async def get_vm_boot_order(self, node_id: int, vmid: int) -> dict:
        """
        Get VM boot order configuration.
        Returns boot order devices and their order.
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            config = proxmox.nodes(node_name).qemu(vmid).config.get()
            
            # Parse boot order from config
            boot_order = config.get('boot', 'cdn')  # Default: cd, disk, network
            
            # Map boot codes to device names
            device_map = {
                'c': 'disk',
                'd': 'cdrom',
                'n': 'network',
                'a': 'floppy'
            }
            
            devices = []
            for i, code in enumerate(boot_order):
                if code in device_map:
                    devices.append({
                        'order': i + 1,
                        'device': device_map[code],
                        'code': code
                    })
            
            return {
                'boot_order': boot_order,
                'devices': devices
            }
        except Exception as e:
            print(f"Error getting boot order: {e}")
            raise Exception(f"Failed to get boot order: {str(e)}")
    
    async def set_vm_boot_order(self, node_id: int, vmid: int, boot_order: str) -> bool:
        """
        Set VM boot order.
        
        Args:
            node_id: Node ID
            vmid: VM ID
            boot_order: Boot order string (e.g., 'cdn' for cdrom, disk, network)
                       c=disk, d=cdrom, n=network, a=floppy
        
        Returns:
            True if successful
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        # Validate boot order
        valid_codes = {'c', 'd', 'n', 'a'}
        if not all(code in valid_codes for code in boot_order):
            raise Exception(f"Invalid boot order. Valid codes: c(disk), d(cdrom), n(network), a(floppy)")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            proxmox.nodes(node_name).qemu(vmid).config.put(boot=boot_order)
            return True
        except Exception as e:
            print(f"Error setting boot order: {e}")
            raise Exception(f"Failed to set boot order: {str(e)}")
    
    async def download_iso(self, node_id: int, storage: str, filename: str, url: str) -> str:
        """Download ISO from URL to Proxmox storage."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            # Download ISO using Proxmox API
            result = proxmox.nodes(node_name).storage(storage)('download-url').post(
                content='iso',
                filename=filename,
                url=url
            )
            return result
        except Exception as e:
            print(f"Error downloading ISO: {e}")
            raise
    
    async def get_task_status(self, node_id: int, upid: str) -> Dict[str, Any]:
        """Get the status of a Proxmox task by UPID.
        
        Args:
            node_id: The node ID
            upid: The task UPID (Unique Process ID)
            
        Returns:
            Dict with task status information including:
            - status: running, stopped
            - exitstatus: OK or error message
            - type: task type (e.g., download)
            - starttime: timestamp
            - endtime: timestamp (if finished)
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get task status
            status = proxmox.nodes(node_name).tasks(upid).status.get()
            return status
        except Exception as e:
            print(f"Error getting task status: {e}")
            raise Exception(f"Failed to get task status: {str(e)}")
    
    async def delete_vm(self, node_id: int, vmid: int) -> bool:
        """Delete a VM."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            proxmox.nodes(node_name).qemu(vmid).delete()
            return True
        except Exception as e:
            print(f"Error deleting VM: {e}")
            return False
    
    async def clone_vm(
        self,
        node_id: int,
        vmid: int,
        newid: int,
        name: Optional[str] = None,
        full: int = 1,
        storage: Optional[str] = None,
        description: Optional[str] = None
    ) -> str:
        """
        Clone a VM or template.
        
        Args:
            node_id: Node ID
            vmid: Source VM/template ID
            newid: New VM ID
            name: Name for cloned VM (optional)
            full: Full clone (1) or linked clone (0)
            storage: Target storage for disks (optional)
            description: Description for cloned VM (optional)
            
        Returns:
            Task UPID
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            params = {
                'newid': newid,
                'full': full
            }
            
            if name:
                params['name'] = name
            if storage:
                params['storage'] = storage
            if description:
                params['description'] = description
            
            result = proxmox.nodes(node_name).qemu(vmid).clone.post(**params)
            return result
        except Exception as e:
            print(f"Error cloning VM: {e}")
            raise
    
    async def list_snapshots(self, node_id: int, vmid: int) -> List[Dict[str, Any]]:
        """List VM snapshots."""
        node = await self.get_node(node_id)
        if not node:
            return []
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            snapshots = proxmox.nodes(node_name).qemu(vmid).snapshot.get()
            return snapshots
        except Exception as e:
            print(f"Error listing snapshots: {e}")
            return []
    
    async def create_snapshot(self, node_id: int, vmid: int, snapname: str, description: Optional[str] = None, vmstate: Optional[bool] = False) -> str:
        """Create a VM snapshot."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            params = {'snapname': snapname}
            if description:
                params['description'] = description
            if vmstate:
                params['vmstate'] = 1
            
            result = proxmox.nodes(node_name).qemu(vmid).snapshot.post(**params)
            return result
        except Exception as e:
            print(f"Error creating snapshot: {e}")
            raise
    
    async def delete_snapshot(self, node_id: int, vmid: int, snapname: str) -> bool:
        """Delete a VM snapshot."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            proxmox.nodes(node_name).qemu(vmid).snapshot(snapname).delete()
            return True
        except Exception as e:
            print(f"Error deleting snapshot: {e}")
            return False
    
    async def rollback_snapshot(self, node_id: int, vmid: int, snapname: str) -> str:
        """Rollback VM to a snapshot."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            result = proxmox.nodes(node_name).qemu(vmid).snapshot(snapname).rollback.post()
            return result
        except Exception as e:
            print(f"Error rolling back snapshot: {e}")
            raise
    
    async def update_vm_config(self, node_id: int, vmid: int, config: Dict[str, Any]) -> str:
        """Update VM configuration."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            result = proxmox.nodes(node_name).qemu(vmid).config.put(**config)
            return result
        except Exception as e:
            print(f"Error updating VM config: {e}")
            raise
    
    async def convert_to_template(self, node_id: int, vmid: int) -> str:
        """Convert a VM to a template."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        # Check if VM is already a template
        config = await self.get_vm_config(node_id, vmid)
        if config and config.get('template') == 1:
            raise Exception("VM is already a template")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            result = proxmox.nodes(node_name).qemu(vmid).template.post()
            return result
        except Exception as e:
            print(f"Error converting VM to template: {e}")
            raise
    
    async def get_vm_config(self, node_id: int, vmid: int) -> Optional[Dict[str, Any]]:
        """Get VM configuration."""
        node = await self.get_node(node_id)
        if not node:
            return None
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            config = proxmox.nodes(node_name).qemu(vmid).config.get()
            return config
        except Exception as e:
            print(f"Error getting VM config: {e}")
            return None
    
    async def get_vnc_websocket(self, node_id: int, vmid: int) -> dict:
        """Get VNC WebSocket connection details for a VM.
        
        Creates a fresh VNC ticket that's valid for 2 minutes.
        The client should connect immediately to avoid ticket expiration.
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Create VNC proxy ticket (valid for 2 minutes by default)
            result = proxmox.nodes(node_name).qemu(vmid).vncproxy.post(
                websocket=1  # Request websocket-compatible ticket
            )
            
            return {
                'ticket': result['ticket'],
                'port': result['port'],
                'upid': result.get('upid', ''),
                'cert': result.get('cert', ''),
                'node': node_name,
                'host': node.host,
                'vmid': vmid
            }
        except Exception as e:
            print(f"Error creating VNC proxy: {e}")
            raise Exception(f"Failed to create VNC proxy: {str(e)}")
    
    async def get_spice_config(self, node_id: int, vmid: int) -> dict:
        """Get SPICE connection configuration for a VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Create SPICE proxy configuration
            result = proxmox.nodes(node_name).qemu(vmid).spiceproxy.post()
            
            return {
                'type': result.get('type', 'spice'),
                'host': result.get('host', node.host),
                'proxy': result.get('proxy', ''),
                'tls-port': result.get('tls-port', 0),
                'password': result.get('password', ''),
                'delete-this-file': result.get('delete-this-file', 1),
                'secure-attention': result.get('secure-attention', ''),
                'release-cursor': result.get('release-cursor', ''),
                'toggle-fullscreen': result.get('toggle-fullscreen', ''),
                'ca': result.get('ca', '')
            }
        except Exception as e:
            print(f"Error creating SPICE proxy: {e}")
            raise Exception(f"Failed to create SPICE proxy: {str(e)}")
    
    async def list_vm_disks(self, node_id: int, vmid: int) -> List[Dict[str, Any]]:
        """List all disks attached to a VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get VM configuration to extract disk info
            config = proxmox.nodes(node_name).qemu(vmid).config.get()
            
            disks = []
            # Check for IDE, SATA, SCSI, and VirtIO disks
            for key, value in config.items():
                if key.startswith(('ide', 'sata', 'scsi', 'virtio')) and isinstance(value, str):
                    # Parse disk configuration
                    parts = value.split(',')
                    disk_info = {
                        'device': key,
                        'storage': parts[0] if parts else '',
                        'size': None,
                        'format': None,
                        'cache': None,
                        'discard': None
                    }
                    
                    # Parse additional parameters
                    for part in parts[1:]:
                        if '=' in part:
                            param_key, param_value = part.split('=', 1)
                            if param_key == 'size':
                                disk_info['size'] = param_value
                            elif param_key == 'format':
                                disk_info['format'] = param_value
                            elif param_key == 'cache':
                                disk_info['cache'] = param_value
                            elif param_key == 'discard':
                                disk_info['discard'] = param_value
                    
                    disks.append(disk_info)
            
            return disks
        except Exception as e:
            print(f"Error listing VM disks: {e}")
            raise Exception(f"Failed to list VM disks: {str(e)}")
    
    async def add_vm_disk(self, node_id: int, vmid: int, disk_config: Dict[str, Any]) -> None:
        """Add a new disk to a VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Prepare disk configuration
            storage = disk_config.get('storage')
            size = disk_config.get('size')  # In GB
            disk_type = disk_config.get('type', 'scsi')  # scsi, sata, virtio, ide
            format_type = disk_config.get('format', 'raw')  # raw, qcow2
            cache = disk_config.get('cache', 'none')
            discard = disk_config.get('discard', 'on')
            
            # Find next available device number
            config = proxmox.nodes(node_name).qemu(vmid).config.get()
            device_num = 0
            while f"{disk_type}{device_num}" in config:
                device_num += 1
            
            device_name = f"{disk_type}{device_num}"
            
            # Build disk string
            disk_string = f"{storage}:{size}"
            if format_type:
                disk_string += f",format={format_type}"
            if cache:
                disk_string += f",cache={cache}"
            if discard and disk_type in ['scsi', 'virtio']:
                disk_string += f",discard={discard}"
            
            # Add the disk
            update_data = {device_name: disk_string}
            proxmox.nodes(node_name).qemu(vmid).config.post(**update_data)
            
        except Exception as e:
            print(f"Error adding VM disk: {e}")
            raise Exception(f"Failed to add VM disk: {str(e)}")
    
    async def delete_vm_disk(self, node_id: int, vmid: int, disk: str) -> None:
        """Delete/detach a disk from a VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Remove the disk by setting it to 'none' and then deleting
            update_data = {disk: 'none', 'delete': disk}
            proxmox.nodes(node_name).qemu(vmid).config.post(**update_data)
            
        except Exception as e:
            print(f"Error deleting VM disk: {e}")
            raise Exception(f"Failed to delete VM disk: {str(e)}")
    
    async def list_vm_network_interfaces(self, node_id: int, vmid: int) -> List[Dict[str, Any]]:
        """List all network interfaces attached to a VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get VM configuration to extract network info
            config = proxmox.nodes(node_name).qemu(vmid).config.get()
            
            interfaces = []
            # Check for network interfaces (net0, net1, etc.)
            for key, value in config.items():
                if key.startswith('net') and isinstance(value, str):
                    # Parse network configuration
                    parts = value.split(',')
                    interface_info = {
                        'interface': key,
                        'model': parts[0].split('=')[0] if '=' not in parts[0] else parts[0].split('=')[1],
                        'macaddr': None,
                        'bridge': None,
                        'firewall': None,
                        'link_down': None,
                        'rate': None,
                        'tag': None
                    }
                    
                    # Parse MAC address from first part if it's in format "model=macaddr"
                    if '=' in parts[0]:
                        interface_info['model'] = parts[0].split('=')[0]
                        interface_info['macaddr'] = parts[0].split('=')[1]
                    
                    # Parse additional parameters
                    for part in parts[1:] if len(parts) > 1 else []:
                        if '=' in part:
                            param_key, param_value = part.split('=', 1)
                            if param_key == 'bridge':
                                interface_info['bridge'] = param_value
                            elif param_key == 'firewall':
                                interface_info['firewall'] = param_value
                            elif param_key == 'link_down':
                                interface_info['link_down'] = param_value
                            elif param_key == 'rate':
                                interface_info['rate'] = param_value
                            elif param_key == 'tag':
                                interface_info['tag'] = param_value
                    
                    interfaces.append(interface_info)
            
            return interfaces
        except Exception as e:
            print(f"Error listing VM network interfaces: {e}")
            raise Exception(f"Failed to list VM network interfaces: {str(e)}")
    
    async def add_vm_network_interface(self, node_id: int, vmid: int, interface_config: Dict[str, Any]) -> None:
        """Add a new network interface to a VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Prepare network interface configuration
            model = interface_config.get('model', 'virtio')
            bridge = interface_config.get('bridge', 'vmbr0')
            macaddr = interface_config.get('macaddr')  # Optional
            firewall = interface_config.get('firewall', 1)
            rate = interface_config.get('rate')  # Optional bandwidth limit in MB/s
            tag = interface_config.get('tag')  # Optional VLAN tag
            
            # Find next available interface number
            config = proxmox.nodes(node_name).qemu(vmid).config.get()
            interface_num = 0
            while f"net{interface_num}" in config:
                interface_num += 1
            
            interface_name = f"net{interface_num}"
            
            # Build interface string
            interface_string = f"{model},bridge={bridge}"
            if macaddr:
                interface_string = f"{model}={macaddr},bridge={bridge}"
            if firewall is not None:
                interface_string += f",firewall={firewall}"
            if rate:
                interface_string += f",rate={rate}"
            if tag:
                interface_string += f",tag={tag}"
            
            # Add the interface
            update_data = {interface_name: interface_string}
            proxmox.nodes(node_name).qemu(vmid).config.post(**update_data)
            
        except Exception as e:
            print(f"Error adding VM network interface: {e}")
            raise Exception(f"Failed to add VM network interface: {str(e)}")
    
    async def update_vm_network_interface(self, node_id: int, vmid: int, interface: str, interface_config: Dict[str, Any]) -> None:
        """Update an existing network interface."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Prepare network interface configuration
            model = interface_config.get('model', 'virtio')
            bridge = interface_config.get('bridge', 'vmbr0')
            macaddr = interface_config.get('macaddr')
            firewall = interface_config.get('firewall', 1)
            rate = interface_config.get('rate')
            tag = interface_config.get('tag')
            
            # Build interface string
            interface_string = f"{model},bridge={bridge}"
            if macaddr:
                interface_string = f"{model}={macaddr},bridge={bridge}"
            if firewall is not None:
                interface_string += f",firewall={firewall}"
            if rate:
                interface_string += f",rate={rate}"
            if tag:
                interface_string += f",tag={tag}"
            
            # Update the interface
            update_data = {interface: interface_string}
            proxmox.nodes(node_name).qemu(vmid).config.post(**update_data)
            
        except Exception as e:
            print(f"Error updating VM network interface: {e}")
            raise Exception(f"Failed to update VM network interface: {str(e)}")
    
    async def delete_vm_network_interface(self, node_id: int, vmid: int, interface: str) -> None:
        """Delete/detach a network interface from a VM."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Remove the interface by deleting it
            update_data = {'delete': interface}
            proxmox.nodes(node_name).qemu(vmid).config.post(**update_data)
            
        except Exception as e:
            print(f"Error deleting VM network interface: {e}")
            raise Exception(f"Failed to delete VM network interface: {str(e)}")
    
    async def list_network_bridges(self, node_id: int) -> List[Dict[str, Any]]:
        """List available network bridges on a node."""
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Get network configuration
            network_config = proxmox.nodes(node_name).network.get()
            
            bridges = []
            for iface in network_config:
                if iface.get('type') == 'bridge':
                    bridges.append({
                        'iface': iface.get('iface'),
                        'type': iface.get('type'),
                        'active': iface.get('active', 0),
                        'autostart': iface.get('autostart', 0),
                        'bridge_ports': iface.get('bridge_ports'),
                        'cidr': iface.get('cidr'),
                        'gateway': iface.get('gateway')
                    })
            
            return bridges
        except Exception as e:
            print(f"Error listing network bridges: {e}")
            raise Exception(f"Failed to list network bridges: {str(e)}")
    
    async def create_backup(
        self, 
        node_id: int, 
        vmid: int, 
        storage: str = "local",
        mode: str = "snapshot",
        compress: str = "zstd",
        notes: str = None
    ) -> dict:
        """
        Create a backup of a VM.
        
        Args:
            node_id: Node ID where the VM is running
            vmid: VM ID to backup
            storage: Storage location for backup (default: local)
            mode: Backup mode - 'snapshot', 'suspend', or 'stop' (default: snapshot)
            compress: Compression - 'none', 'lzo', 'gzip', or 'zstd' (default: zstd)
            notes: Optional backup notes/description
            
        Returns:
            dict: Backup task information including UPID
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Prepare backup parameters
            params = {
                'vmid': vmid,
                'storage': storage,
                'mode': mode,
                'compress': compress
            }
            
            if notes:
                params['notes-template'] = notes
            
            # Create backup - returns task UPID
            result = proxmox.nodes(node_name).vzdump.post(**params)
            
            return {
                'upid': result,
                'node': node_name,
                'vmid': vmid,
                'storage': storage,
                'mode': mode,
                'compress': compress
            }
        except Exception as e:
            print(f"Error creating backup: {e}")
            raise Exception(f"Failed to create backup: {str(e)}")
    
    async def list_backups(self, node_id: int, vmid: int = None, storage: str = None) -> list:
        """
        List available backups for a VM or all VMs.
        
        Args:
            node_id: Node ID
            vmid: Optional VM ID to filter backups
            storage: Optional storage location to filter
            
        Returns:
            list: List of backup information dicts
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            backups = []
            
            # Get list of storages if not specified
            storages = [storage] if storage else []
            if not storages:
                # Get all backup-capable storages
                storage_list = proxmox.nodes(node_name).storage.get()
                for s in storage_list:
                    if s.get('content', '').find('backup') != -1:
                        storages.append(s['storage'])
            
            # Query each storage for backups
            for stor in storages:
                try:
                    content = proxmox.nodes(node_name).storage(stor).content.get(content='backup')
                    for backup in content:
                        # Parse backup filename to extract VM ID
                        # Format: vzdump-qemu-{vmid}-{timestamp}.{ext}
                        volid = backup.get('volid', '')
                        backup_vmid = None
                        
                        if 'vzdump-qemu-' in volid:
                            parts = volid.split('vzdump-qemu-')[1].split('-')
                            if parts:
                                try:
                                    backup_vmid = int(parts[0])
                                except:
                                    pass
                        
                        # Filter by vmid if specified
                        if vmid and backup_vmid != vmid:
                            continue
                        
                        backups.append({
                            'volid': backup.get('volid'),
                            'format': backup.get('format'),
                            'size': backup.get('size', 0),
                            'ctime': backup.get('ctime', 0),
                            'vmid': backup_vmid,
                            'storage': stor,
                            'notes': backup.get('notes', '')
                        })
                except Exception as e:
                    print(f"Error querying storage {stor}: {e}")
                    continue
            
            # Sort by creation time (newest first)
            backups.sort(key=lambda x: x.get('ctime', 0), reverse=True)
            
            return backups
        except Exception as e:
            print(f"Error listing backups: {e}")
            raise Exception(f"Failed to list backups: {str(e)}")
    
    async def restore_backup(self, node_id: int, vmid: int, volid: str, storage: str = None) -> dict:
        """
        Restore a VM from a backup.
        
        Args:
            node_id: Node ID
            vmid: Target VM ID (can be same or different from backup source)
            volid: Backup volume ID (format: storage:backup/vzdump-qemu-xxx.vma.zst)
            storage: Optional target storage for restored VM
            
        Returns:
            dict: Restore task information including UPID
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Prepare restore parameters
            params = {
                'vmid': vmid,
                'archive': volid
            }
            
            if storage:
                params['storage'] = storage
            
            # Restore backup - returns task UPID
            result = proxmox.nodes(node_name).qemu.post(**params)
            
            return {
                'upid': result,
                'node': node_name,
                'vmid': vmid,
                'archive': volid
            }
        except Exception as e:
            print(f"Error restoring backup: {e}")
            raise Exception(f"Failed to restore backup: {str(e)}")
    
    async def delete_backup(self, node_id: int, volid: str) -> bool:
        """
        Delete a backup.
        
        Args:
            node_id: Node ID
            volid: Backup volume ID (format: storage:backup/vzdump-qemu-xxx.vma.zst)
            
        Returns:
            bool: True if successful
        """
        node = await self.get_node(node_id)
        if not node:
            raise Exception("Node not found")
        
        try:
            proxmox = self._get_proxmox_connection(node)
            node_name = self._get_proxmox_node_name(node)
            
            # Parse volid to get storage and content path
            # Format: storage:backup/filename
            storage, content = volid.split(':', 1)
            
            # Delete backup
            proxmox.nodes(node_name).storage(storage).content(volid).delete()
            
            return True
        except Exception as e:
            print(f"Error deleting backup: {e}")
            raise Exception(f"Failed to delete backup: {str(e)}")
    
    async def get_next_available_vmid(self, host: str, username: str, password: str, starting_vmid: int = None) -> int:
        """Get the next available VMID via SSH.
        
        Args:
            host: Proxmox host
            username: SSH username
            password: SSH password
            starting_vmid: Optional starting VMID (default: None, uses Proxmox nextid or 100).
                          For templates, use starting_vmid=9000 to start from 9000 onwards.
        
        Returns:
            Next available VMID
        """
        import paramiko
        
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            ssh.connect(host, username=username, password=password, port=22, timeout=10)
            
            # Get list of all VMs to check for conflicts
            stdin, stdout, stderr = ssh.exec_command("/usr/sbin/qm list | awk 'NR>1 {print $1}' | sort -n")
            exit_status = stdout.channel.recv_exit_status()
            
            used_vmids = set()
            if exit_status == 0:
                output = stdout.read().decode().strip()
                if output:
                    try:
                        used_vmids = set(int(vid) for vid in output.split('\n') if vid.strip())
                    except:
                        pass
            
            # Determine starting point
            min_vmid = starting_vmid if starting_vmid is not None else 100
            
            # Find next available VMID starting from min_vmid
            candidate = min_vmid
            while candidate in used_vmids:
                candidate += 1
            
            return candidate
        finally:
            ssh.close()
    
    async def check_vmid_available(self, host: str, username: str, password: str, vmid: int) -> bool:
        """Check if a VMID is available (not already in use)."""
        import paramiko
        
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            ssh.connect(host, username=username, password=password, port=22, timeout=10)
            
            # Check if VMID exists
            stdin, stdout, stderr = ssh.exec_command(f"/usr/sbin/qm status {vmid}")
            exit_status = stdout.channel.recv_exit_status()
            
            # If exit status is 0, VM exists (not available)
            # If exit status is non-zero, VM doesn't exist (available)
            return exit_status != 0
        finally:
            ssh.close()
