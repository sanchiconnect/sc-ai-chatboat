"""Langfuse client — one place that touches credentials so instrumentation
call sites just import `get_langfuse()`. Built from `settings` (not read
from `os.environ` inside the Langfuse SDK itself) so it works regardless of
whether the process env actually has LANGFUSE_* set — pydantic-settings
loads .env into `settings` without mutating os.environ, and reading through
`settings` sidesteps that entirely.

Safe when unconfigured: passing empty/None keys makes the Langfuse client
fall back to its own no-op tracer (logs a warning, never raises), so local
dev without Langfuse credentials keeps working exactly as before.
"""
from __future__ import annotations

from functools import lru_cache

from langfuse import Langfuse

from ..config import settings


@lru_cache(maxsize=1)
def get_langfuse() -> Langfuse:
    return Langfuse(
        public_key=settings.langfuse_public_key or None,
        secret_key=settings.langfuse_secret_key or None,
        base_url=settings.langfuse_base_url or None,
        environment=settings.langfuse_environment or None,
    )
