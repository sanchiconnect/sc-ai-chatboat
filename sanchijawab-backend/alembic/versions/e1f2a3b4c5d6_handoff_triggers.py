"""bots.handoff_keywords + conversations.consecutive_low_confidence (SAN-1111, FR-H2)

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-10-06 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bots', sa.Column('handoff_keywords', sa.Text(), nullable=False, server_default=''))
    op.add_column('conversations', sa.Column('consecutive_low_confidence', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('conversations', 'consecutive_low_confidence')
    op.drop_column('bots', 'handoff_keywords')
