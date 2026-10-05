"""bots: add widget_last_seen_at/host for the install-check feature (FR-I3)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bots', sa.Column('widget_last_seen_at', sa.DateTime(), nullable=True))
    op.add_column('bots', sa.Column('widget_last_seen_host', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('bots', 'widget_last_seen_host')
    op.drop_column('bots', 'widget_last_seen_at')
