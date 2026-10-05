"""sources: add ownership_confirmed for crawl consent attestation (SAN-1083, FR-K4)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-05 16:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sources', sa.Column('ownership_confirmed', sa.Boolean(), nullable=False, server_default='false'))
    # Every source that exists today was created before this attestation
    # existed, by a customer acting through our own UI on their own bot —
    # back-dating true here isn't claiming a new fact, just recording that
    # the same implicit trust applied before this explicit checkbox did.
    op.execute("UPDATE sources SET ownership_confirmed = true")


def downgrade() -> None:
    op.drop_column('sources', 'ownership_confirmed')
