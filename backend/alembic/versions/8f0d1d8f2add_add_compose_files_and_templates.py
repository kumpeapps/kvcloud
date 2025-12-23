"""add compose files and templates

Revision ID: 8f0d1d8f2add
Revises: 7ac8633c32ee
Create Date: 2025-12-22
"""
from alembic import op
import sqlalchemy as sa

revision = '8f0d1d8f2add'
down_revision = '7ac8633c32ee'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add docker_compose_files column to vm_assignments
    op.add_column('vm_assignments', sa.Column('docker_compose_files', sa.Text(), nullable=True))

    # Create compose_templates table
    op.create_table(
        'compose_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('variables', sa.Text(), nullable=True),  # JSON array of variable definitions
        sa.Column('auto_update', sa.Boolean(), server_default=sa.text('0'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.text('CURRENT_TIMESTAMP')),
    )


def downgrade() -> None:
    op.drop_table('compose_templates')
    op.drop_column('vm_assignments', 'docker_compose_files')
