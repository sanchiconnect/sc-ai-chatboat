"""One place for "now in UTC".

`datetime.utcnow()` is deprecated (Python 3.12+ prints a DeprecationWarning every time it runs, which was
flooding the worker's terminal). The database columns store naive UTC datetimes, so this returns the same
thing the old call did, without the warning.
"""
from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
