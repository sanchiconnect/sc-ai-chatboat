"""sources: backfill crawl mode now that it's actually honored (SAN-1082)

The `mode` column has existed since the initial schema with a default of
'single_page', but nothing ever read it — every source was always crawled
as a breadth-first whole-domain walk regardless of this value. Every
existing row therefore holds the unused default, 'single_page', while its
*actual* historical crawl behavior was whole-domain. Now that crawl_site()
honors `mode` for real (see app/services/crawler.py), leaving these rows
as-is would silently shrink any re-crawled source down to a single page.
Backfill them to the value that matches what they've actually been doing,
and flip the column default to match so any row created outside the API
(scripts, etc.) doesn't regress either.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-10-05 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE sources SET mode = 'whole_domain' WHERE mode = 'single_page'")
    op.alter_column('sources', 'mode', server_default='whole_domain')


def downgrade() -> None:
    op.alter_column('sources', 'mode', server_default='single_page')
    # Not reversing the data backfill — there's no way to tell which rows
    # were genuinely meant to be single_page vs. just holding the old
    # unused default, and reverting to 'single_page' would reintroduce the
    # exact regression this migration exists to avoid.
