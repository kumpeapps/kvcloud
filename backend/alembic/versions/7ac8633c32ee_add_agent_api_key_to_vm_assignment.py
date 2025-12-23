"""add_agent_api_key_to_vm_assignment

Revision ID: 7ac8633c32ee
Revises: b9552c8ae174
Create Date: 2025-12-23 03:55:45.352535

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7ac8633c32ee'
down_revision = 'b9552c8ae174'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add agent_api_key column to vm_assignments table
    op.add_column('vm_assignments', sa.Column('agent_api_key', sa.String(length=128), nullable=True))
    op.create_index('ix_vm_assignments_agent_api_key', 'vm_assignments', ['agent_api_key'], unique=False)


def downgrade() -> None:
    # Remove agent_api_key column
    op.drop_index('ix_vm_assignments_agent_api_key', table_name='vm_assignments')
    op.drop_column('vm_assignments', 'agent_api_key')
