"""add plans, requests, cloudinit

Revision ID: 7f1c9b2a0abc
Revises: 240d796b5e4c
Create Date: 2025-12-20
"""

from alembic import op
import sqlalchemy as sa


revision = '7f1c9b2a0abc'
down_revision = '240d796b5e4c'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table('cloud_license_plans'):
        op.create_table(
            'cloud_license_plans',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(length=255), nullable=False, unique=True),
            sa.Column('description', sa.String(length=1024)),
            sa.Column('max_vms', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('max_cpu_cores', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('max_ram_mb', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('max_disk_gb', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('max_snapshots', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('max_backups', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('max_isos', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('max_ips', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('allow_self_approval', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(timezone=True)),
        )

    if not insp.has_table('user_cloud_licenses'):
        op.create_table(
            'user_cloud_licenses',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('plan_id', sa.Integer(), nullable=False),
            sa.Column('overrides_json', sa.String(length=4000)),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        )

    if not insp.has_table('vps_plans'):
        op.create_table(
            'vps_plans',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(length=255), nullable=False, unique=True),
            sa.Column('description', sa.String(length=1024)),
            sa.Column('cpu_cores', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('ram_mb', sa.Integer(), nullable=False, server_default='512'),
            sa.Column('disk_gb', sa.Integer(), nullable=False, server_default='10'),
            sa.Column('virtio', sa.Boolean(), nullable=False, server_default=sa.text('true')),
            sa.Column('scsi', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('enable_vnc', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('ip_group_id', sa.Integer()),
            sa.Column('iso_group_id', sa.Integer()),
        )

    if not insp.has_table('ip_groups'):
        op.create_table(
            'ip_groups',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(length=255), nullable=False, unique=True),
            sa.Column('description', sa.String(length=1024)),
            sa.Column('ip_pool_id', sa.Integer()),
        )

    if not insp.has_table('iso_groups'):
        op.create_table(
            'iso_groups',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(length=255), nullable=False, unique=True),
            sa.Column('description', sa.String(length=1024)),
        )

    if not insp.has_table('recipes'):
        op.create_table(
            'recipes',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(length=255), nullable=False, unique=True),
            sa.Column('description', sa.String(length=1024)),
            sa.Column('content', sa.Text(), nullable=False),
        )

    if not insp.has_table('cloud_init_profiles'):
        op.create_table(
            'cloud_init_profiles',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(length=255), nullable=False, unique=True),
            sa.Column('description', sa.String(length=1024)),
            sa.Column('ciuser', sa.String(length=255)),
            sa.Column('cipassword', sa.String(length=255)),
            sa.Column('sshkeys', sa.Text()),
            sa.Column('userdata', sa.Text()),
            sa.Column('metadata', sa.Text()),
            sa.Column('network_config', sa.Text()),
        )

    if not insp.has_table('vm_requests'):
        op.create_table(
            'vm_requests',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('node_id', sa.Integer()),
            sa.Column('plan_id', sa.Integer(), nullable=False),
            sa.Column('cloud_init_profile_id', sa.Integer()),
            sa.Column('recipe_id', sa.Integer()),
            sa.Column('status', sa.String(length=32), nullable=False, server_default='pending'),
            sa.Column('notes', sa.String(length=1024)),
            sa.Column('auto_approve', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('approved_at', sa.DateTime(timezone=True)),
            sa.Column('fulfilled_at', sa.DateTime(timezone=True)),
        )


def downgrade():
    op.drop_table('vm_requests')
    op.drop_table('cloud_init_profiles')
    op.drop_table('recipes')
    op.drop_table('iso_groups')
    op.drop_table('ip_groups')
    op.drop_table('vps_plans')
    op.drop_table('user_cloud_licenses')
    op.drop_table('cloud_license_plans')
