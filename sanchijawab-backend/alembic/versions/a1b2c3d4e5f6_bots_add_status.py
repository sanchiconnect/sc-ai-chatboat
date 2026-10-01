"""bots: add status column for super-admin moderation

Revision ID: a1b2c3d4e5f6
Revises: 595217e6e1dd
Create Date: 2026-10-01 16:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '595217e6e1dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'bots',
        sa.Column('status', sa.String(length=16), nullable=False, server_default='live'),
    )


def downgrade() -> None:
    op.drop_column('bots', 'status')
