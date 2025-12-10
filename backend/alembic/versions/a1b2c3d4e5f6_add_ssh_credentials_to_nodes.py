"""Add SSH credentials to nodes.

Revision ID: a1b2c3d4e5f6
Revises: f1g2h3i4j5k6
Create Date: 2025-12-21 23:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'f1g2h3i4j5k6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add SSH username and password columns to proxmox_nodes (idempotent)
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = {c['name'] for c in inspector.get_columns('proxmox_nodes')}

    if 'ssh_username' not in existing_cols:
        op.add_column('proxmox_nodes', sa.Column('ssh_username', sa.String(100), nullable=True))
        # Set default values for existing nodes
        op.execute("UPDATE proxmox_nodes SET ssh_username = 'root' WHERE ssh_username IS NULL")
        # Enforce NOT NULL unless using SQLite (SQLite has limited ALTER support)
        if bind.dialect.name != 'sqlite':
            op.alter_column('proxmox_nodes', 'ssh_username', nullable=False)

    if 'ssh_password' not in existing_cols:
        op.add_column('proxmox_nodes', sa.Column('ssh_password', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('proxmox_nodes', 'ssh_password')
    op.drop_column('proxmox_nodes', 'ssh_username')
