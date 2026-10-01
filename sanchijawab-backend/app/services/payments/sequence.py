"""Race-safe invoice/order numbering — one row per prefix in
payment_order_sequences, incremented with a single atomic statement so
concurrent orders never collide on a number.

Modeled on a MySQL `INSERT ... VALUES (?, LAST_INSERT_ID(1)) ON DUPLICATE
KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)` pattern; this is the
Postgres-native equivalent — `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
takes a row lock on the conflicting row, so a concurrent caller blocks until
the first transaction commits rather than reading a stale value.
"""
from __future__ import annotations

import random
import string
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def _next_sequence_value(session: AsyncSession, prefix: str) -> int:
    row = (
        await session.execute(
            text(
                """
                INSERT INTO payment_order_sequences (prefix, last_value)
                VALUES (:prefix, 1)
                ON CONFLICT (prefix) DO UPDATE
                SET last_value = payment_order_sequences.last_value + 1
                RETURNING last_value
                """
            ),
            {"prefix": prefix},
        )
    ).first()
    return row[0]


async def next_invoice_number(session: AsyncSession, prefix: str = "INV") -> str:
    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_part = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
    seq = await _next_sequence_value(session, prefix)
    return f"{prefix}-{date_part}-{random_part}-{seq:05d}"
