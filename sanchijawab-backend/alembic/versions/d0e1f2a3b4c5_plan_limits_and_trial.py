"""plans: usage caps; workspaces: trial_ends_at + plan_id (SAN-1063/1119, FR-A4)

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-10-06 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('plans', sa.Column('max_messages_per_month', sa.Integer(), nullable=True))
    op.add_column('plans', sa.Column('max_pages', sa.Integer(), nullable=True))
    op.add_column('plans', sa.Column('max_files', sa.Integer(), nullable=True))
    op.add_column('plans', sa.Column('max_seats', sa.Integer(), nullable=True))

    op.add_column('workspaces', sa.Column('trial_ends_at', sa.DateTime(), nullable=True))
    op.add_column('workspaces', sa.Column('plan_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_workspaces_plan_id', 'workspaces', 'plans', ['plan_id'], ['id'])

    # Existing workspaces predate the trial concept — backfilling a 14-day
    # trial that already expired would lock everyone out the moment this
    # migration runs, which is obviously wrong. Give every existing
    # workspace a fresh 14-day window from today instead; it's a one-time
    # grace period, not a claim about when they actually signed up.
    op.execute(
        "UPDATE workspaces SET trial_ends_at = now() + interval '14 days' WHERE trial_ends_at IS NULL"
    )


def downgrade() -> None:
    op.drop_constraint('fk_workspaces_plan_id', 'workspaces', type_='foreignkey')
    op.drop_column('workspaces', 'plan_id')
    op.drop_column('workspaces', 'trial_ends_at')
    op.drop_column('plans', 'max_seats')
    op.drop_column('plans', 'max_files')
    op.drop_column('plans', 'max_pages')
    op.drop_column('plans', 'max_messages_per_month')
