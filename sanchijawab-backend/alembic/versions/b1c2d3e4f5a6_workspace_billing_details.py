"""workspace billing details + order phone

Revision ID: b1c2d3e4f5a6
Revises: a9b0c1d2e3f4
Create Date: 2026-10-08 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'a9b0c1d2e3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'workspace_billing_details',
        sa.Column('workspace_id', sa.String(36), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('tenant_id', sa.String(64), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False, server_default=''),
        sa.Column('gstin', sa.String(32), nullable=False, server_default=''),
        sa.Column('address', sa.String(512), nullable=False, server_default=''),
        sa.Column('city', sa.String(100), nullable=False, server_default=''),
        sa.Column('state', sa.String(100), nullable=False, server_default=''),
        sa.Column('country', sa.String(100), nullable=False, server_default='India'),
        sa.Column('pincode', sa.String(16), nullable=False, server_default=''),
        sa.Column('phone_country_code', sa.String(8), nullable=False, server_default='+91'),
        sa.Column('phone', sa.String(32), nullable=False, server_default=''),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.add_column('orders', sa.Column('customer_phone', sa.String(40), nullable=False, server_default=''))


def downgrade() -> None:
    op.drop_column('orders', 'customer_phone')
    op.drop_table('workspace_billing_details')
