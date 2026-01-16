from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base


class VPSPlan(Base):
    __tablename__ = "vps_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(String(1024), nullable=True)

    # VM hardware specs
    cpu_cores = Column(Integer, nullable=False, default=1)
    cpu_sockets = Column(Integer, nullable=False, default=1)
    cpu_type = Column(String(50), nullable=False, default='host')  # host, qemu64, etc
    ram_mb = Column(Integer, nullable=False, default=512)
    disk_gb = Column(Integer, nullable=False, default=10)

    # Network and IP configuration
    number_of_ips = Column(Integer, nullable=False, default=1)
    ip_group_id = Column(Integer, nullable=True)

    # Storage options
    disk_type = Column(String(50), nullable=False, default='virtio')  # virtio, ide, scsi
    virtio = Column(Boolean, nullable=False, default=True)
    scsi = Column(Boolean, nullable=False, default=False)

    # OS and cloud-init
    os_template = Column(String(255), nullable=True)  # debian-12, ubuntu-22.04, etc
    iso_group_id = Column(Integer, nullable=True)

    # Console and access
    enable_vnc = Column(Boolean, nullable=False, default=False)
    enable_serial = Column(Boolean, nullable=False, default=False)

    # Pricing and limits
    price_per_month = Column(Integer, nullable=True)  # in cents
    max_instances_per_user = Column(Integer, nullable=True)  # null = unlimited
