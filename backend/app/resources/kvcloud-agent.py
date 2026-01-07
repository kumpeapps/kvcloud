#!/usr/bin/env python3
"""
KVCloud Agent - Pulls provisioning configuration from KVCloud server and executes locally.

This agent runs as a systemd service on guest VMs and polls the KVCloud API for
pending provisioning tasks. This allows provisioning to work reliably even when:
- VM is rebooting
- Guest agent is slow to start
- Network connectivity is intermittent

Installation:
  curl -fsSL http://kvcloud-api:8000/provision/agent/installer.sh | sudo bash

Or manually:
  sudo cp kvcloud-agent.py /opt/kvcloud/kvcloud-agent.py
  sudo cp kvcloud-agent.service /etc/systemd/system/
  sudo systemctl enable kvcloud-agent
  sudo systemctl start kvcloud-agent
"""

import os
import sys
import time
import json
import subprocess
import logging
from datetime import datetime
from pathlib import Path
try:
    import requests
except ImportError:
    print("ERROR: requests module not installed. Run: pip3 install requests")
    sys.exit(1)

# Configuration
CONFIG_FILE = "/etc/kvcloud/agent.conf"
LOG_FILE = "/var/log/kvcloud-agent.log"
STATE_FILE = "/var/lib/kvcloud/state.json"
POLL_INTERVAL = 60  # seconds

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def load_config():
    """Load agent configuration."""
    if not os.path.exists(CONFIG_FILE):
        logger.error(f"Config file not found: {CONFIG_FILE}")
        sys.exit(1)
    
    with open(CONFIG_FILE, 'r') as f:
        config = json.load(f)
    
    required = ['api_url', 'vmid', 'node_id', 'api_key']
    for key in required:
        if key not in config:
            logger.error(f"Missing required config: {key}")
            sys.exit(1)
    
    return config


def save_state(state):
    """Save agent state."""
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)


def load_state():
    """Load agent state."""
    if not os.path.exists(STATE_FILE):
        return {}
    with open(STATE_FILE, 'r') as f:
        return json.load(f)


def check_pending_provision(config):
    """Check if there's a pending provision task."""
    try:
        url = f"{config['api_url']}/provision/agent/pending/{config['vmid']}"
        headers = {'X-Agent-Key': config['api_key']}
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 404:
            return None  # No pending provision
        
        if response.status_code == 200:
            return response.json()
        
        logger.warning(f"Unexpected status code: {response.status_code}")
        return None
        
    except Exception as e:
        logger.error(f"Failed to check pending provision: {e}")
        return None


def execute_command(cmd, description):
    """Execute a shell command."""
    logger.info(f"Executing: {description}")
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        if result.returncode == 0:
            logger.info(f"✓ {description} - Success")
            return True, result.stdout
        else:
            logger.error(f"✗ {description} - Failed: {result.stderr}")
            return False, result.stderr
            
    except subprocess.TimeoutExpired:
        logger.error(f"✗ {description} - Timeout")
        return False, "Command timeout"
    except Exception as e:
        logger.error(f"✗ {description} - Error: {e}")
        return False, str(e)


def execute_provision(provision_data):
    """Execute provisioning tasks."""
    provision_id = provision_data.get('provision_id')
    config = provision_data.get('config', {})
    state = load_state()
    registry_state = state.get('docker_registry', {}) if isinstance(state, dict) else {}
    compose_services = {}
    
    logger.info(f"Starting provision {provision_id}")
    logger.info(f"Config keys: {list(config.keys())}")
    if config.get('docker_compose_files'):
        logger.info(f"Found {len(config['docker_compose_files'])} docker compose files")
        for cf in config['docker_compose_files']:
            logger.info(f"  - {cf.get('path')} (start_on_deploy: {cf.get('start_on_deploy')}, start_on_boot: {cf.get('start_on_boot')})")
    
    results = []
    failed_steps = []
    
    # 1. Set hostname
    if config.get('hostname'):
        hostname = config['hostname']
        success, output = execute_command(
            f"hostnamectl set-hostname {hostname}",
            f"Setting hostname to {hostname}"
        )
        results.append({'step': 'hostname', 'success': success, 'output': output})
        if not success:
            failed_steps.append('hostname')
    
    # 2. Configure network (ONLY if explicitly provided - for secondary NICs)
    # Primary NIC is handled by cloud-init ipconfig0; agent should not touch it
    if config.get('network_yaml'):
        logger.info("network_yaml provided - applying additional/secondary network config")
        network_yaml = config['network_yaml']
        netplan_file = "/etc/netplan/60-kvcloud-agent.yaml"  # Use different file to avoid conflict with cloud-init
        
        try:
            with open(netplan_file, 'w') as f:
                f.write(network_yaml)
            
            success, output = execute_command(
                "netplan apply",
                "Applying additional network configuration"
            )
            results.append({'step': 'network', 'success': success, 'output': output})
            if not success:
                failed_steps.append('network')
        except Exception as e:
            logger.error(f"Failed to write netplan config: {e}")
            results.append({'step': 'network', 'success': False, 'output': str(e)})
            failed_steps.append('network')
    else:
        logger.info("No network_yaml in config - primary NIC handled by cloud-init")
    
    # 3. Create/update user
    if config.get('default_user'):
        user = config['default_user']
        
        # Check if user exists
        check_cmd = f"id {user} > /dev/null 2>&1"
        user_exists = subprocess.run(check_cmd, shell=True).returncode == 0
        
        if not user_exists:
            # Create user
            success, output = execute_command(
                f"useradd -m -s /bin/bash {user}",
                f"Creating user {user}"
            )
            results.append({'step': 'create_user', 'success': success, 'output': output})
            if not success:
                failed_steps.append('create_user')
        
        # Set password if provided
        if config.get('password_hash'):
            # Use chpasswd -e which accepts hashed passwords
            password_hash = config['password_hash']
            success, output = execute_command(
                f"echo '{user}:{password_hash}' | chpasswd -e",
                f"Setting password for {user}"
            )
            results.append({'step': 'set_password', 'success': success, 'output': output})
            if not success:
                failed_steps.append('set_password')
                logger.error(f"Password hash format: {password_hash[:20]}...")
        
        # Add to sudo group
        success, output = execute_command(
            f"usermod -aG sudo {user}",
            f"Adding {user} to sudo group"
        )
        results.append({'step': 'sudo_access', 'success': success, 'output': output})
        if not success:
            failed_steps.append('sudo_access')
        
        # Configure SSH keys
        if config.get('ssh_authorized_keys'):
            ssh_dir = f"/home/{user}/.ssh"
            auth_keys_file = f"{ssh_dir}/authorized_keys"
            
            try:
                os.makedirs(ssh_dir, exist_ok=True)
                
                with open(auth_keys_file, 'w') as f:
                    for key in config['ssh_authorized_keys']:
                        f.write(key + '\n')
                
                # Set permissions
                execute_command(f"chown -R {user}:{user} {ssh_dir}", "Setting SSH dir ownership")
                execute_command(f"chmod 700 {ssh_dir}", "Setting SSH dir permissions")
                execute_command(f"chmod 600 {auth_keys_file}", "Setting authorized_keys permissions")
                
                results.append({'step': 'ssh_keys', 'success': True, 'output': 'SSH keys configured'})
            except Exception as e:
                logger.error(f"Failed to configure SSH keys: {e}")
                results.append({'step': 'ssh_keys', 'success': False, 'output': str(e)})
                failed_steps.append('ssh_keys')
    
    # 4. Install packages
    if config.get('packages'):
        packages = ' '.join(config['packages'])
        success, output = execute_command(
            f"apt-get update && apt-get install -y {packages}",
            f"Installing packages: {packages}"
        )
        results.append({'step': 'packages', 'success': success, 'output': output})
        if not success:
            failed_steps.append('packages')
    
    # Always install docker if registry credentials are provided
    if (config.get('docker_registry_url') and config.get('docker_registry_username') and config.get('docker_registry_password')):
        config['install_docker'] = True

    # 5. Install Docker if requested
    if config.get('install_docker'):
        # Check if Docker is already installed
        docker_check, _ = execute_command("which docker", "Checking if Docker is installed")
        
        if docker_check:
            logger.info("Docker is already installed, skipping installation")
            results.append({'step': 'docker', 'success': True, 'output': 'Docker already installed'})
        else:
            success, output = execute_command(
                "curl -fsSL https://get.docker.com | sh",
                "Installing Docker"
            )
            results.append({'step': 'docker', 'success': success, 'output': output})
            if not success:
                failed_steps.append('docker')
        
        # Add user to docker group
        if config.get('default_user'):
            execute_command(
                f"usermod -aG docker {config['default_user']}",
                f"Adding {config['default_user']} to docker group"
            )

    # 5b. Docker registry auth
    if config.get('docker_registry_url') and config.get('docker_registry_username') and config.get('docker_registry_password'):
        new_reg = {
            'url': config['docker_registry_url'],
            'username': config['docker_registry_username'],
        }
        if registry_state:
            execute_command(
                f"docker logout {registry_state.get('url', '')}",
                f"Docker logout {registry_state.get('url', '')}"
            )

        success, output = execute_command(
            f"docker login {new_reg['url']} -u {new_reg['username']} -p {config['docker_registry_password']}",
            f"Docker login {new_reg['url']}"
        )
        results.append({'step': 'docker_login', 'success': success, 'output': output})
        if not success:
            failed_steps.append('docker_login')
        else:
            registry_state = new_reg
            if isinstance(state, dict):
                state['docker_registry'] = new_reg
                save_state(state)
    
    # 6. Docker Compose files
    if config.get('docker_compose_files'):
        logger.info(f"Processing {len(config['docker_compose_files'])} docker compose files")

        if not config.get('install_docker'):
            config['install_docker'] = True
        try:
            if isinstance(state, dict) and isinstance(state.get('compose_services'), dict):
                compose_services = dict(state.get('compose_services'))
            else:
                compose_services = {}
            compose_hashes = state.get('compose_hashes', {}) if isinstance(state, dict) else {}
        except Exception:
            compose_services = {}
            compose_hashes = {}

        desired_services = {}
        for compose in config['docker_compose_files']:
            path = compose.get('path', '/root/docker-compose.yml')
            cid = compose.get('id') or f"path:{path}"
            svc_name = compose.get('service_name') or f"kvcloud-compose-{os.path.basename(path).replace('.', '-')}"
            if compose.get('start_on_boot'):
                desired_services[cid] = {
                    'service_name': svc_name,
                    'unit_path': f"/etc/systemd/system/{svc_name}.service"
                }

        # Remove obsolete/renamed services
        for cid, info in list(compose_services.items()):
            old_svc = info.get('service_name')
            if (cid not in desired_services) or (desired_services[cid]['service_name'] != old_svc):
                if old_svc:
                    execute_command(f"systemctl disable --now {old_svc} || true", f"Disable old compose service {old_svc}")
                    execute_command(f"rm -f /etc/systemd/system/{old_svc}.service", f"Remove old unit {old_svc}")
                    execute_command("systemctl daemon-reload", "Reload systemd after removal")
                compose_services.pop(cid, None)

        # Process compose entries
        for compose in config['docker_compose_files']:
            path = compose.get('path', '/root/docker-compose.yml')
            content = compose.get('content', '')
            start_flag = compose.get('start') or compose.get('start_on_deploy') or False
            start_on_boot = bool(compose.get('start_on_boot'))
            logger.info(f"Processing compose file: {path} (start_flag: {start_flag}, start_on_boot: {start_on_boot})")

            cid = compose.get('id') or f"path:{path}"
            old_hash = None
            if isinstance(compose_hashes, dict):
                old_hash = compose_hashes.get(cid)
            # Write file and compute new hash
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w') as f:
                f.write(content)
            new_hash = None
            try:
                import hashlib
                new_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()
                if isinstance(state, dict):
                    if 'compose_hashes' not in state:
                        state['compose_hashes'] = {}
                    state['compose_hashes'][cid] = new_hash
            except Exception as e:
                logger.error(f"Failed to hash compose content: {e}")

            logger.info(f"Wrote docker-compose file to {path}")

            should_restart = start_flag or start_on_boot or (cid in compose_services)
            if should_restart and old_hash and new_hash and old_hash != new_hash:
                compose_dir = os.path.dirname(path) or "/root"
                compose_file = os.path.basename(path)
                execute_command(
                    f"cd '{compose_dir}' && docker compose -f {compose_file} down || docker-compose -f {compose_file} down || true",
                    f"Stopping docker-compose before update: {path}"
                )

            if should_restart:
                execute_command("systemctl is-active docker || systemctl start docker", "Ensure docker is running")
                compose_dir = os.path.dirname(path) or "/root"
                compose_file = os.path.basename(path)
                success, output = execute_command(
                    f"cd '{compose_dir}' && docker compose -f {compose_file} up -d || docker-compose -f {compose_file} up -d",
                    f"Starting docker-compose: {path}"
                )
                results.append({'step': f'docker-compose-{path}', 'success': success, 'output': output})
                if not success:
                    failed_steps.append(f'docker-compose-{path}')
            else:
                results.append({'step': f'docker-compose-{path}', 'success': True, 'output': 'File written'})

            if start_on_boot:
                service_name = compose.get('service_name') or f"kvcloud-compose-{os.path.basename(path).replace('.', '-')}"
                service_path = f"/etc/systemd/system/{service_name}.service"
                compose_dir = os.path.dirname(path) or "/root"
                unit = (
                    "[Unit]\n"
                    f"Description=KVCloud Compose {path}\n"
                    "Requires=docker.service\n"
                    "After=docker.service network-online.target\n\n"
                    "[Service]\n"
                    "Type=oneshot\n"
                    "RemainAfterExit=yes\n"
                    f"WorkingDirectory={compose_dir}\n"
                    f"ExecStart=/usr/bin/env sh -c 'docker compose -f {path} up -d || docker-compose -f {path} up -d'\n"
                    f"ExecStop=/usr/bin/env sh -c 'docker compose -f {path} down || docker-compose -f {path} down'\n"
                    "TimeoutStartSec=300\n"
                    "TimeoutStopSec=120\n\n"
                    "[Install]\n"
                    "WantedBy=multi-user.target\n"
                )

                try:
                    with open(service_path, 'w') as f:
                        f.write(unit)
                    logger.info(f"Wrote systemd unit to {service_path}")

                    success, output = execute_command("systemctl daemon-reload", f"Reload systemd for {service_name}")
                    results.append({'step': f'systemd-reload-{service_name}', 'success': success, 'output': output})

                    success, output = execute_command(f"systemctl enable --now {service_name}", f"Enable compose service {service_name}")
                    results.append({'step': f'systemd-enable-{service_name}', 'success': success, 'output': output})

                    if not success:
                        failed_steps.append(f'systemd-enable-{service_name}')
                        logger.error(f"Failed to enable systemd service: {output}")
                    else:
                        cid = compose.get('id') or f"path:{path}"
                        compose_services[cid] = {'service_name': service_name}
                except Exception as e:
                    logger.error(f"Failed to create systemd unit: {e}")
                    results.append({'step': f'systemd-unit-{service_name}', 'success': False, 'output': str(e)})
                    failed_steps.append(f'systemd-unit-{service_name}')

        # Persist updated compose services mapping
        if isinstance(state, dict):
            try:
                state['compose_services'] = compose_services
                save_state(state)
            except Exception as e:
                logger.error(f"Failed to persist compose_services state: {e}")
    
    # 7. Set timezone
    if config.get('timezone'):
        success, output = execute_command(
            f"timedatectl set-timezone {config['timezone']}",
            f"Setting timezone to {config['timezone']}"
        )
        results.append({'step': 'timezone', 'success': success, 'output': output})
        if not success:
            failed_steps.append('timezone')
    
    # 8. Expand root filesystem (in case disk was resized)
    success, output = execute_command(
        "growpart /dev/sda 1 2>/dev/null || growpart /dev/vda 1 2>/dev/null || true",
        "Expanding partition to use available space"
    )
    results.append({'step': 'growpart', 'success': True, 'output': output or 'Partition expansion attempted'})
    
    # Resize filesystem
    success, output = execute_command(
        "resize2fs /dev/sda1 2>/dev/null || resize2fs /dev/vda1 2>/dev/null || xfs_growfs / 2>/dev/null || true",
        "Expanding filesystem to use partition space"
    )
    results.append({'step': 'resize_fs', 'success': True, 'output': output or 'Filesystem resize attempted'})
    
    return {
        'success': len(failed_steps) == 0,
        'failed_steps': failed_steps,
        'results': results
    }


def report_completion(config, provision_id, result):
    """Report provision completion to server."""
    try:
        url = f"{config['api_url']}/provision/agent/complete"
        headers = {
            'X-Agent-Key': config['api_key'],
            'Content-Type': 'application/json'
        }
        data = {
            'vmid': config['vmid'],
            'provision_id': provision_id,
            'success': result['success'],
            'failed_steps': result.get('failed_steps', []),
            'results': result.get('results', [])
        }
        
        response = requests.post(url, headers=headers, json=data, timeout=10)
        
        if response.status_code == 200:
            logger.info("✓ Provision completion reported to server")
            return True
        else:
            logger.error(f"Failed to report completion: {response.status_code}")
            return False
            
    except Exception as e:
        logger.error(f"Failed to report completion: {e}")
        return False


def wait_for_connectivity(config, max_wait=120):
    """Wait for network connectivity before polling API."""
    logger.info("Waiting for network connectivity...")
    start = time.time()
    while time.time() - start < max_wait:
        try:
            # Try to reach the API server
            response = requests.get(f"{config['api_url']}/health", timeout=5)
            if response.status_code in [200, 404]:  # 404 is OK, means server is reachable
                logger.info("✓ Network connectivity established")
                return True
        except:
            pass
        # Also check for default route as fallback
        result = subprocess.run("ip route | grep default", shell=True, capture_output=True)
        if result.returncode == 0:
            logger.info("✓ Default route present, assuming connectivity")
            return True
        time.sleep(5)
    logger.warning(f"Network connectivity not confirmed after {max_wait}s, proceeding anyway")
    return False


def main():
    """Main agent loop."""
    logger.info("KVCloud Agent starting...")
    
    # Load configuration
    config = load_config()
    logger.info(f"Loaded config for VM {config['vmid']} on node {config['node_id']}")
    
    # Wait for network before first poll
    wait_for_connectivity(config)
    
    # Main loop
    while True:
        try:
            # Check for pending provision
            provision_data = check_pending_provision(config)
            
            if provision_data:
                logger.info(f"Pending provision detected: {provision_data.get('provision_id')}")
                
                # Execute provisioning
                result = execute_provision(provision_data)
                
                # Report back to server
                report_completion(
                    config,
                    provision_data.get('provision_id'),
                    result
                )
                
                # Update state
                state = load_state()
                state['last_provision'] = datetime.now().isoformat()
                state['last_result'] = result
                save_state(state)
            
            # Sleep until next check
            time.sleep(POLL_INTERVAL)
            
        except KeyboardInterrupt:
            logger.info("Agent stopped by user")
            break
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}")
            time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    main()
