"""chunks.embedding_v2: Gemini embeddings (768-d); the old 384-d column becomes optional

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-10-08 21:00:00.000000

Both columns exist side by side on purpose: a server still running the previous version keeps working
(it reads and writes the old column) until it is restarted, and rollback is possible. Rows get their new
vector from `python -m app.reembed` (resumable) or when they are next crawled.
"""
from typing import Sequence, Union

from alembic import op
import pgvector.sqlalchemy
import sqlalchemy as sa

revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('chunks', sa.Column('embedding_v2', pgvector.sqlalchemy.vector.VECTOR(dim=768), nullable=True))
    op.alter_column('chunks', 'embedding', existing_type=pgvector.sqlalchemy.vector.VECTOR(dim=384), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM chunks WHERE embedding IS NULL")
    op.alter_column('chunks', 'embedding', existing_type=pgvector.sqlalchemy.vector.VECTOR(dim=384), nullable=False)
    op.drop_column('chunks', 'embedding_v2')
