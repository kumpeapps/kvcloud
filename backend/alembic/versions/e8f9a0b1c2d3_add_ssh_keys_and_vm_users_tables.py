"""add_ssh_keys_and_vm_users_tables

Revision ID: e8f9a0b1c2d3
Revises: 4ee2311e7544
Create Date: 2025-12-21 03:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e8f9a0b1c2d3'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Create user_ssh_keys table
    if not insp.has_table('user_ssh_keys'):
        op.create_table(
            'user_ssh_keys',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('public_key', sa.Text(), nullable=False),
            sa.Column('fingerprint', sa.String(255), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.Index('ix_user_ssh_keys_user_id', 'user_id'),
        )

    # Create vm_users table
    if not insp.has_table('vm_users'):
        op.create_table(
            'vm_users',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('vm_id', sa.Integer(), nullable=False),
            sa.Column('node_id', sa.Integer(), nullable=False),
            sa.Column('username', sa.String(255), nullable=False),
            sa.Column('password', sa.String(255), nullable=True),
            sa.Column('shell', sa.String(255), nullable=False, server_default='/bin/bash'),
            sa.Column('sudo_access', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['node_id'], ['proxmox_clusters.id'], ondelete='CASCADE'),
            sa.Index('ix_vm_users_vm_id', 'vm_id'),
        )

    # Create vm_user_ssh_keys association table
    if not insp.has_table('vm_user_ssh_keys'):
        op.create_table(
            'vm_user_ssh_keys',
            sa.Column('vm_user_id', sa.Integer(), nullable=False),
            sa.Column('user_ssh_key_id', sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint('vm_user_id', 'user_ssh_key_id'),
            sa.ForeignKeyConstraint(['vm_user_id'], ['vm_users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_ssh_key_id'], ['user_ssh_keys.id'], ondelete='CASCADE'),
        )

    # Create vm_network_configs table
    if not insp.has_table('vm_network_configs'):
        op.create_table(
            'vm_network_configs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('vm_id', sa.Integer(), nullable=False, unique=True),
            sa.Column('node_id', sa.Integer(), nullable=False),
            sa.Column('ip_address', sa.String(45), nullable=True),
            sa.Column('ip_pool_id', sa.Integer(), nullable=True),
            sa.Column('gateway', sa.String(45), nullable=True),
            sa.Column('dns_servers', sa.String(255), nullable=True),
            sa.Column('hostname', sa.String(255), nullable=True),
            sa.Column('domain_search', sa.String(255), nullable=True),
            sa.Column('mac_address', sa.String(17), nullable=True),
            sa.Column('enable_dhcp', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['node_id'], ['proxmox_clusters.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['ip_pool_id'], ['ip_pools.id'], ondelete='SET NULL'),
            sa.Index('ix_vm_network_configs_vm_id', 'vm_id'),
        )


def downgrade() -> None:
    op.drop_table('vm_network_configs')
    op.drop_table('vm_user_ssh_keys')
    op.drop_table('vm_users')
    op.drop_table('user_ssh_keys')
