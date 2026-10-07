"""Per-client sliding-window rate limiting (SAN-1126) for the endpoints an
anonymous caller can hit: login/signup (credential stuffing) and the public
widget routes (LLM cost abuse). In-process, so the limit is per backend
instance — enough for a single-instance MVP; swap the store for Redis if the
API is scaled horizontally.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from ..config import settings

_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, *, limit: int, window_seconds: int):
    """FastAPI dependency: at most `limit` calls per `window_seconds` per
    client IP (and per bot for the public widget routes)."""

    async def dependency(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        key = f"{name}:{_client_ip(request)}:{request.path_params.get('bot_id', '')}"
        now = time.monotonic()
        window = _hits[key]
        while window and now - window[0] > window_seconds:
            window.popleft()
        if len(window) >= limit:
            retry_after = max(1, int(window_seconds - (now - window[0])))
            raise HTTPException(429, "Too many requests — please slow down.", headers={"Retry-After": str(retry_after)})
        window.append(now)

    return dependency


def reset() -> None:
    _hits.clear()
