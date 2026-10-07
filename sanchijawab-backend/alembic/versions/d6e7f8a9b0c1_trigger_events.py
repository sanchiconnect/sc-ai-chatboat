"""trigger_events for proactive-message A/B analytics

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-10-07 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, None] = 'c5d6e7f8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'trigger_events',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=64), nullable=False),
        sa.Column('bot_id', sa.String(length=36), nullable=False),
        sa.Column('trigger_id', sa.String(length=32), nullable=False),
        sa.Column('variant', sa.String(length=4), nullable=False, server_default=''),
        sa.Column('event', sa.String(length=8), nullable=False),
        sa.Column('visitor_id', sa.String(length=64), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_trigger_events_tenant_id', 'trigger_events', ['tenant_id'])
    op.create_index('ix_trigger_events_bot_id', 'trigger_events', ['bot_id'])
    op.create_index('ix_trigger_events_trigger_id', 'trigger_events', ['trigger_id'])
    op.create_index('ix_trigger_events_created_at', 'trigger_events', ['created_at'])


def downgrade() -> None:
    op.drop_table('trigger_events')
