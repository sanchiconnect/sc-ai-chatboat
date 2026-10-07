"""content_pages: super-admin-editable legal pages and blog posts

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-10-07 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'content_pages',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('excerpt', sa.String(length=500), nullable=False, server_default=''),
        sa.Column('body', sa.Text(), nullable=False, server_default=''),
        sa.Column('read_minutes', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('published', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('display_date', sa.String(length=10), nullable=False, server_default=''),
        sa.Column('updated_by', sa.String(length=255), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('kind', 'slug', name='uq_content_kind_slug'),
    )
    op.create_index('ix_content_pages_kind', 'content_pages', ['kind'])


def downgrade() -> None:
    op.drop_index('ix_content_pages_kind', table_name='content_pages')
    op.drop_table('content_pages')
