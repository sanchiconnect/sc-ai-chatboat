"""bot actions: bot_actions, pending_actions, action_logs (SAN-1801)

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-10-08 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a9b0c1d2e3f4'
down_revision: Union[str, None] = 'f8a9b0c1d2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'bot_actions',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=64), nullable=False),
        sa.Column('bot_id', sa.String(length=36), sa.ForeignKey('bots.id'), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('url', sa.String(length=1024), nullable=False),
        sa.Column('params_json', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('requires_confirmation', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('secret_enc', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_bot_actions_tenant_id', 'bot_actions', ['tenant_id'])
    op.create_index('ix_bot_actions_bot_id', 'bot_actions', ['bot_id'])
    op.create_table(
        'pending_actions',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=64), nullable=False),
        sa.Column('bot_id', sa.String(length=36), nullable=False),
        sa.Column('action_id', sa.String(length=36), nullable=False),
        sa.Column('conversation_id', sa.String(length=36), nullable=False),
        sa.Column('visitor_id', sa.String(length=64), nullable=False, server_default=''),
        sa.Column('params_json', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('status', sa.String(length=12), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_pending_actions_tenant_id', 'pending_actions', ['tenant_id'])
    op.create_index('ix_pending_actions_bot_id', 'pending_actions', ['bot_id'])
    op.create_index('ix_pending_actions_conversation_id', 'pending_actions', ['conversation_id'])
    op.create_table(
        'action_logs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=64), nullable=False),
        sa.Column('bot_id', sa.String(length=36), nullable=False),
        sa.Column('action_name', sa.String(length=64), nullable=False),
        sa.Column('conversation_id', sa.String(length=36), nullable=False, server_default=''),
        sa.Column('confirmed_by_visitor', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('ok', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('http_status', sa.Integer(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error', sa.String(length=300), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_action_logs_tenant_id', 'action_logs', ['tenant_id'])
    op.create_index('ix_action_logs_bot_id', 'action_logs', ['bot_id'])
    op.create_index('ix_action_logs_created_at', 'action_logs', ['created_at'])


def downgrade() -> None:
    op.drop_table('action_logs')
    op.drop_table('pending_actions')
    op.drop_table('bot_actions')
