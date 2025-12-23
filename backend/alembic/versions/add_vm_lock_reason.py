"""Add lock_reason to vm_assignments.

Revision ID: a1b2c3d4e5f7
Revises: 20251221181627
Create Date: 2024-12-22 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f7'
down_revision = '20251221181627'
branch_labels = None
depends_on = None


def upgrade():
    # Check if column already exists
    inspector = sa.inspect(op.get_bind())
    columns = [c['name'] for c in inspector.get_columns('vm_assignments')]
    
    if 'lock_reason' not in columns:
        op.add_column('vm_assignments',
            sa.Column('lock_reason', sa.String(500), nullable=True)
        )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = [c['name'] for c in inspector.get_columns('vm_assignments')]
    
    if 'lock_reason' in columns:
        op.drop_column('vm_assignments', 'lock_reason')
