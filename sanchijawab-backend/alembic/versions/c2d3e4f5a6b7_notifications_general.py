"""notifications for team / payment / lead events (bot + conversation optional, link added)

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-10-08 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('notifications', 'bot_id', existing_type=sa.String(36), nullable=True)
    op.alter_column('notifications', 'conversation_id', existing_type=sa.String(36), nullable=True)
    op.add_column('notifications', sa.Column('link', sa.String(255), nullable=False, server_default=''))


def downgrade() -> None:
    op.drop_column('notifications', 'link')
    op.execute("DELETE FROM notifications WHERE bot_id IS NULL OR conversation_id IS NULL")
    op.alter_column('notifications', 'conversation_id', existing_type=sa.String(36), nullable=False)
    op.alter_column('notifications', 'bot_id', existing_type=sa.String(36), nullable=False)
