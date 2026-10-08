"""products catalogue with embeddings (SAN-1800)

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-10-08 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = 'f8a9b0c1d2e3'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'products',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=64), nullable=False),
        sa.Column('bot_id', sa.String(length=36), sa.ForeignKey('bots.id'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('price_text', sa.String(length=50), nullable=False, server_default=''),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('image_url', sa.String(length=1024), nullable=False, server_default=''),
        sa.Column('product_url', sa.String(length=1024), nullable=False, server_default=''),
        sa.Column('embedding', Vector(384), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_products_tenant_id', 'products', ['tenant_id'])
    op.create_index('ix_products_bot_id', 'products', ['bot_id'])


def downgrade() -> None:
    op.drop_table('products')
