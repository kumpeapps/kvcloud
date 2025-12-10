from sqlalchemy import Column, Integer, String, Text, Boolean, JSON
from app.core.database import Base


class CloudInitProfile(Base):
    """Comprehensive cloud-init profile with all configuration options."""
    __tablename__ = "cloud_init_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(String(1024), nullable=True)

    # Basic user configuration
    default_user = Column(String(255), nullable=True)  # Default username
    default_password = Column(String(255), nullable=True)  # Default password
    disable_root = Column(Boolean, default=False)  # Disable root login
    
    # Package management
    apt_update = Column(Boolean, default=True)  # Run apt update
    apt_upgrade = Column(Boolean, default=False)  # Run apt upgrade
    apt_reboot_if_required = Column(Boolean, default=False)  # Reboot after upgrade if needed
    packages = Column(JSON, nullable=True)  # List of packages to install: ["nginx", "docker.io"]
    package_update_frequency = Column(String(50), nullable=True)  # daily, weekly, monthly
    
    # Scripts and commands
    bootcmd = Column(JSON, nullable=True)  # Commands run early in boot (before network): ["echo boot"]
    runcmd = Column(JSON, nullable=True)  # Commands run after boot: ["systemctl start nginx"]
    
    # Cron jobs (recurring scripts)
    cron_jobs = Column(JSON, nullable=True)  # [{schedule: "0 2 * * *", command: "apt update"}]
    
    # File creation
    write_files = Column(JSON, nullable=True)  # [{path: "/etc/config", content: "...", permissions: "0644"}]
    
    # Docker configuration
    install_docker = Column(Boolean, default=False)  # Install Docker
    docker_compose_content = Column(Text, nullable=True)  # docker-compose.yml content
    docker_compose_path = Column(String(512), default="/root/docker-compose.yml")  # Where to place it
    start_docker_compose = Column(Boolean, default=False)  # Auto-start compose
    
    # Network configuration (templated)
    network_config_template = Column(Text, nullable=True)  # Network config with variables
    hostname_template = Column(String(255), nullable=True)  # Hostname with variables: "${vm_name}"
    
    # SSH configuration
    ssh_authorized_keys = Column(JSON, nullable=True)  # List of SSH keys (can use variables)
    ssh_pwauth = Column(Boolean, default=True)  # Allow SSH password auth
    
    # Timezone and locale
    timezone = Column(String(64), nullable=True)  # e.g., "America/New_York"
    locale = Column(String(64), nullable=True)  # e.g., "en_US.UTF-8"
    
    # Custom cloud-config sections (for advanced users)
    custom_cloud_config = Column(Text, nullable=True)  # Raw YAML to merge
    
    # Variable documentation (for UI display)
    available_variables = Column(JSON, nullable=True)  # List of available vars: ["vm_name", "vm_ip", "user_email"]

