"""Rate limiting on anonymous endpoints (SAN-1126)."""
from __future__ import annotations

from httpx import AsyncClient

from app.config import settings


async def test_login_is_rate_limited_per_ip(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    body = {"email": "nobody@example.com", "password": "wrong-password"}

    codes = [(await client.post("/v1/auth/login", json=body)).status_code for _ in range(12)]

    assert 429 not in codes[:10]  # first 10 attempts are processed (rejected as bad creds, not throttled)
    assert codes[10] == 429 and codes[11] == 429


async def test_rate_limit_returns_retry_after(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    body = {"email": "nobody@example.com", "password": "wrong-password"}
    for _ in range(10):
        await client.post("/v1/auth/login", json=body)

    resp = await client.post("/v1/auth/login", json=body)
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) >= 1


async def test_different_clients_have_separate_limits(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    body = {"email": "nobody@example.com", "password": "wrong-password"}
    for _ in range(11):
        await client.post("/v1/auth/login", json=body, headers={"x-forwarded-for": "10.0.0.1"})

    other = await client.post("/v1/auth/login", json=body, headers={"x-forwarded-for": "10.0.0.2"})
    assert other.status_code != 429
