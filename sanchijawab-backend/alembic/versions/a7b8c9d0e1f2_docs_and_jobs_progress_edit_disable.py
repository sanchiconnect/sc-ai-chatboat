"""documents: raw_text + disabled; ingest_jobs: pages_done/pages_total (SAN-1087, FR-K8-K9)

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-05 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('raw_text', sa.Text(), nullable=False, server_default=''))
    op.add_column('documents', sa.Column('disabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('ingest_jobs', sa.Column('pages_done', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('ingest_jobs', sa.Column('pages_total', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('ingest_jobs', 'pages_total')
    op.drop_column('ingest_jobs', 'pages_done')
    op.drop_column('documents', 'disabled')
    op.drop_column('documents', 'raw_text')
