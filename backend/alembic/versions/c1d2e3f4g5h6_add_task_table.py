"""add_task_table

Revision ID: c1d2e3f4g5h6
Revises: 7ac8633c32ee, 8f0d1d8f2add
Create Date: 2026-01-11 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1d2e3f4g5h6'
down_revision = ('7ac8633c32ee', '8f0d1d8f2add')
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Create tasks table
    if not insp.has_table('tasks'):
        op.create_table(
            'tasks',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('upid', sa.String(255), nullable=True),
            sa.Column('task_type', sa.String(50), nullable=False),
            sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('username', sa.String(255), nullable=False),
            sa.Column('resource_type', sa.String(50), nullable=True),
            sa.Column('resource_id', sa.String(255), nullable=True),
            sa.Column('resource_name', sa.String(255), nullable=True),
            sa.Column('operation', sa.String(255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('progress_details', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('duration_ms', sa.Float(), nullable=True),
            sa.Column('result', sa.JSON(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('error_details', sa.JSON(), nullable=True),
            sa.Column('node_id', sa.Integer(), nullable=True),
            sa.Column('cluster_id', sa.Integer(), nullable=True),
            sa.Column('parameters', sa.JSON(), nullable=True),
            sa.Column('ip_address', sa.String(45), nullable=True),
            sa.Column('tags', sa.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.Index('ix_upid', 'upid', unique=True),
            sa.Index('ix_task_type', 'task_type'),
            sa.Index('ix_status', 'status'),
            sa.Index('ix_user_id', 'user_id'),
            sa.Index('ix_resource_id', 'resource_id'),
            sa.Index('ix_user_tasks', 'user_id', 'created_at'),
            sa.Index('ix_status_created', 'status', 'created_at'),
            sa.Index('ix_resource_task', 'resource_type', 'resource_id'),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    
    # Drop tasks table
    if insp.has_table('tasks'):
        op.drop_table('tasks')
