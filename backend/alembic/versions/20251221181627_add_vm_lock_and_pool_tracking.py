"""Add VM lock status, template tracking, and IP pool reference to vm_assignments."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251221181627'
down_revision = 'e8f9a0b1c2d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c['name'] for c in insp.get_columns('vm_assignments')}

    # Add new columns to vm_assignments table if missing
    if 'is_locked' not in existing_cols:
        op.add_column('vm_assignments', sa.Column('is_locked', sa.Boolean(), nullable=False, server_default='0'))
    if 'template_vmid' not in existing_cols:
        op.add_column('vm_assignments', sa.Column('template_vmid', sa.Integer(), nullable=True))
    if 'ip_pool_id' not in existing_cols:
        op.add_column('vm_assignments', sa.Column('ip_pool_id', sa.Integer(), nullable=True))

    # Create foreign key for ip_pool_id if not already present
    existing_fks = {fk['name'] for fk in insp.get_foreign_keys('vm_assignments') if fk.get('name')}
    # SQLite cannot ALTER TABLE to add constraints; skip FK creation in dev (SQLite).
    if bind.dialect.name != 'sqlite' and 'fk_vm_assignments_ip_pool_id' not in existing_fks:
        op.create_foreign_key(
            'fk_vm_assignments_ip_pool_id',
            'vm_assignments',
            'ip_pools',
            ['ip_pool_id'],
            ['id'],
            ondelete='SET NULL'
        )


def downgrade() -> None:
    # Remove foreign key
    op.drop_constraint('fk_vm_assignments_ip_pool_id', 'vm_assignments', type_='foreignkey')
    
    # Remove columns
    op.drop_column('vm_assignments', 'ip_pool_id')
    op.drop_column('vm_assignments', 'template_vmid')
    op.drop_column('vm_assignments', 'is_locked')
