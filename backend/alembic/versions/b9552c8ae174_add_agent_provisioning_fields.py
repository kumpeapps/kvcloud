"""add_agent_provisioning_fields

Revision ID: b9552c8ae174
Revises: a1b2c3d4e5f7
Create Date: 2025-12-23 02:26:32.249169

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = 'b9552c8ae174'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add agent provisioning fields to vm_assignments table (idempotent)."""
    
    # Add provision_pending column if it doesn't exist
    if not column_exists('vm_assignments', 'provision_pending'):
        op.add_column('vm_assignments', sa.Column('provision_pending', sa.Boolean(), nullable=True, server_default='0'))
    
    # Add pending_provision_config column if it doesn't exist
    if not column_exists('vm_assignments', 'pending_provision_config'):
        op.add_column('vm_assignments', sa.Column('pending_provision_config', sa.Text(), nullable=True))
    
    # Add agent_installed column if it doesn't exist
    if not column_exists('vm_assignments', 'agent_installed'):
        op.add_column('vm_assignments', sa.Column('agent_installed', sa.Boolean(), nullable=True, server_default='0'))
    
    # Add last_agent_checkin column if it doesn't exist
    if not column_exists('vm_assignments', 'last_agent_checkin'):
        op.add_column('vm_assignments', sa.Column('last_agent_checkin', sa.DateTime(timezone=True), nullable=True))
    
    # Create foreign key if it doesn't exist (database agnostic)
    bind = op.get_bind()
    inspector = inspect(bind)
    
    # Check if foreign key already exists
    fks = inspector.get_foreign_keys('vm_assignments')
    fk_exists = any(fk['referred_table'] == 'ip_pools' and 'ip_pool_id' in fk['constrained_columns'] for fk in fks)
    
    if not fk_exists:
        # Database-agnostic foreign key creation
        with op.batch_alter_table('vm_assignments', schema=None) as batch_op:
            batch_op.create_foreign_key(
                'fk_vm_assignments_ip_pool_id',
                'ip_pools',
                ['ip_pool_id'],
                ['id']
            )


def downgrade() -> None:
    """Remove agent provisioning fields from vm_assignments table (idempotent)."""
    
    # Drop foreign key if it exists
    bind = op.get_bind()
    inspector = inspect(bind)
    
    fks = inspector.get_foreign_keys('vm_assignments')
    fk_name = None
    for fk in fks:
        if fk['referred_table'] == 'ip_pools' and 'ip_pool_id' in fk['constrained_columns']:
            fk_name = fk.get('name', 'fk_vm_assignments_ip_pool_id')
            break
    
    if fk_name:
        with op.batch_alter_table('vm_assignments', schema=None) as batch_op:
            batch_op.drop_constraint(fk_name, type_='foreignkey')
    
    # Drop columns if they exist
    if column_exists('vm_assignments', 'last_agent_checkin'):
        op.drop_column('vm_assignments', 'last_agent_checkin')
    
    if column_exists('vm_assignments', 'agent_installed'):
        op.drop_column('vm_assignments', 'agent_installed')
    
    if column_exists('vm_assignments', 'pending_provision_config'):
        op.drop_column('vm_assignments', 'pending_provision_config')
    
    if column_exists('vm_assignments', 'provision_pending'):
        op.drop_column('vm_assignments', 'provision_pending')

