"""widget show_sources toggle (FR-C3) + bot retention_days (SAN-1127)

Revision ID: f2a3b4c5d6e7
Revises: 29b8ba503fc2
Create Date: 2026-10-07 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = '29b8ba503fc2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('widget_configs', sa.Column('show_sources', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('bots', sa.Column('retention_days', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('bots', 'retention_days')
    op.drop_column('widget_configs', 'show_sources')
