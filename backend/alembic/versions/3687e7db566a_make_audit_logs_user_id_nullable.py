"""make audit_logs user_id nullable

Revision ID: 3687e7db566a
Revises: c1d2e3f4g5h6
Create Date: 2026-01-11 02:27:36.968815

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3687e7db566a'
down_revision = 'c1d2e3f4g5h6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite requires batch_alter_table for column changes
    with op.batch_alter_table('audit_logs') as batch_op:
        batch_op.alter_column('user_id',
                   existing_type=sa.INTEGER(),
                   nullable=True)


def downgrade() -> None:
    # Downgrade by reverting to NOT NULL
    with op.batch_alter_table('audit_logs') as batch_op:
        batch_op.alter_column('user_id',
                   existing_type=sa.INTEGER(),
                   nullable=False)
