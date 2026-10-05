"""ingest_jobs: add cancel_requested for manual stop (SAN-1088, FR-K10)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-05 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ingest_jobs', sa.Column('cancel_requested', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('ingest_jobs', 'cancel_requested')
