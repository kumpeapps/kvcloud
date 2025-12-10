"""expand cloud_init_profiles for comprehensive configuration

Revision ID: f1g2h3i4j5k6
Revises: 7f1c9b2a0abc
Create Date: 2025-12-21 04:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'f1g2h3i4j5k6'
down_revision = '7f1c9b2a0abc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old columns if they exist (idempotent for dev reloads / SQLite)
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = {col['name'] for col in inspector.get_columns('cloud_init_profiles')}

    for col in ['ciuser', 'cipassword', 'sshkeys', 'userdata', 'meta_data', 'network_config']:
        if col in existing_cols:
            op.drop_column('cloud_init_profiles', col)

    # Helper to add columns only if missing (idempotent)
    def add_if_missing(name: str, column: sa.Column) -> None:
        if name not in existing_cols:
            op.add_column('cloud_init_profiles', column)

    # Add comprehensive configuration columns
    add_if_missing('default_user', sa.Column('default_user', sa.String(255), nullable=True))
    add_if_missing('default_password', sa.Column('default_password', sa.String(255), nullable=True))
    add_if_missing('disable_root', sa.Column('disable_root', sa.Boolean(), server_default=sa.text('0')))

    # Package management
    add_if_missing('apt_update', sa.Column('apt_update', sa.Boolean(), server_default=sa.text('1')))
    add_if_missing('apt_upgrade', sa.Column('apt_upgrade', sa.Boolean(), server_default=sa.text('0')))
    add_if_missing('apt_reboot_if_required', sa.Column('apt_reboot_if_required', sa.Boolean(), server_default=sa.text('0')))
    add_if_missing('packages', sa.Column('packages', sa.JSON(), nullable=True))
    add_if_missing('package_update_frequency', sa.Column('package_update_frequency', sa.String(50), nullable=True))

    # Scripts and commands
    add_if_missing('bootcmd', sa.Column('bootcmd', sa.JSON(), nullable=True))
    add_if_missing('runcmd', sa.Column('runcmd', sa.JSON(), nullable=True))
    add_if_missing('cron_jobs', sa.Column('cron_jobs', sa.JSON(), nullable=True))
    add_if_missing('write_files', sa.Column('write_files', sa.JSON(), nullable=True))

    # Docker configuration
    add_if_missing('install_docker', sa.Column('install_docker', sa.Boolean(), server_default=sa.text('0')))
    add_if_missing('docker_compose_content', sa.Column('docker_compose_content', sa.Text(), nullable=True))
    add_if_missing('docker_compose_path', sa.Column('docker_compose_path', sa.String(512), server_default='/root/docker-compose.yml'))
    add_if_missing('start_docker_compose', sa.Column('start_docker_compose', sa.Boolean(), server_default=sa.text('0')))

    # Network configuration
    add_if_missing('network_config_template', sa.Column('network_config_template', sa.Text(), nullable=True))
    add_if_missing('hostname_template', sa.Column('hostname_template', sa.String(255), nullable=True))

    # SSH configuration
    add_if_missing('ssh_authorized_keys', sa.Column('ssh_authorized_keys', sa.JSON(), nullable=True))
    add_if_missing('ssh_pwauth', sa.Column('ssh_pwauth', sa.Boolean(), server_default=sa.text('1')))

    # Timezone and locale
    add_if_missing('timezone', sa.Column('timezone', sa.String(64), nullable=True))
    add_if_missing('locale', sa.Column('locale', sa.String(64), nullable=True))

    # Custom cloud-config
    add_if_missing('custom_cloud_config', sa.Column('custom_cloud_config', sa.Text(), nullable=True))
    add_if_missing('available_variables', sa.Column('available_variables', sa.JSON(), nullable=True))


def downgrade() -> None:
    # Remove new columns
    op.drop_column('cloud_init_profiles', 'default_user')
    op.drop_column('cloud_init_profiles', 'default_password')
    op.drop_column('cloud_init_profiles', 'disable_root')
    op.drop_column('cloud_init_profiles', 'apt_update')
    op.drop_column('cloud_init_profiles', 'apt_upgrade')
    op.drop_column('cloud_init_profiles', 'apt_reboot_if_required')
    op.drop_column('cloud_init_profiles', 'packages')
    op.drop_column('cloud_init_profiles', 'package_update_frequency')
    op.drop_column('cloud_init_profiles', 'bootcmd')
    op.drop_column('cloud_init_profiles', 'runcmd')
    op.drop_column('cloud_init_profiles', 'cron_jobs')
    op.drop_column('cloud_init_profiles', 'write_files')
    op.drop_column('cloud_init_profiles', 'install_docker')
    op.drop_column('cloud_init_profiles', 'docker_compose_content')
    op.drop_column('cloud_init_profiles', 'docker_compose_path')
    op.drop_column('cloud_init_profiles', 'start_docker_compose')
    op.drop_column('cloud_init_profiles', 'network_config_template')
    op.drop_column('cloud_init_profiles', 'hostname_template')
    op.drop_column('cloud_init_profiles', 'ssh_authorized_keys')
    op.drop_column('cloud_init_profiles', 'ssh_pwauth')
    op.drop_column('cloud_init_profiles', 'timezone')
    op.drop_column('cloud_init_profiles', 'locale')
    op.drop_column('cloud_init_profiles', 'custom_cloud_config')
    op.drop_column('cloud_init_profiles', 'available_variables')
    
    # Restore old columns
    op.add_column('cloud_init_profiles', sa.Column('ciuser', sa.String(255), nullable=True))
    op.add_column('cloud_init_profiles', sa.Column('cipassword', sa.String(255), nullable=True))
    op.add_column('cloud_init_profiles', sa.Column('sshkeys', sa.Text(), nullable=True))
    op.add_column('cloud_init_profiles', sa.Column('userdata', sa.Text(), nullable=True))
    op.add_column('cloud_init_profiles', sa.Column('meta_data', sa.Text(), nullable=True))
    op.add_column('cloud_init_profiles', sa.Column('network_config', sa.Text(), nullable=True))
