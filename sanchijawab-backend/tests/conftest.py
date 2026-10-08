"""Shared fixtures. These tests run against the REAL configured PostgreSQL
(from .env) — same stack every manual test in this project has used — not
mocks, per the project's whole "prove it, don't fabricate" approach.
`client` gives an in-process ASGI client, so no separate uvicorn process is
needed; the app's real startup/session/DB code runs exactly as it would
under uvicorn.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db import engine
from app.main import app
from app.services import ratelimit


@pytest_asyncio.fixture(autouse=True)
async def _dispose_engine_per_test():
    """Each test function gets a fresh asyncio event loop (pytest-asyncio's
    default), but the app's DB engine + pooled connections are created once
    at import time bound to whichever loop used them first. Without this,
    test 2 onward hits `RuntimeError: Event loop is closed` / "attached to
    a different loop" trying to reuse test 1's pooled connections."""
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
def _rate_limit_off(monkeypatch):
    """The suite signs up many users from one fake IP; the rate-limit tests
    turn this back on explicitly."""
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    # A developer's .env may set ALLOW_PRIVATE_URLS=true to crawl local sites;
    # tests must not depend on that.
    monkeypatch.setattr(settings, "allow_private_urls", False)
    ratelimit.reset()


@pytest.fixture(autouse=True)
def _no_real_web_search(monkeypatch):
    """The online fallback calls Google Search through Gemini. Tests must never do that by accident
    (it costs quota and makes results depend on the internet); the tests of the fallback itself
    install their own fake."""
    from app.services import llm

    async def _nothing(*args, **kwargs):
        return
        yield  # makes this an (empty) async generator

    monkeypatch.setattr(llm, "stream_web_answer", _nothing)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def signed_up_owner(client: AsyncClient):
    """A fresh user + workspace + bearer token, ready to use."""
    email = f"pytest_{uuid.uuid4().hex[:10]}@example.com"
    resp = await client.post(
        "/v1/auth/signup",
        json={"email": email, "password": "Passw0rd!23", "business_name": "PytestCo"},
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "email": email,
        "access_token": data["access_token"],
        "workspace_id": data["workspace_id"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


@pytest_asyncio.fixture
async def bot(client: AsyncClient, signed_up_owner: dict):
    resp = await client.post(
        f"/v1/workspaces/{signed_up_owner['workspace_id']}/bots",
        json={"name": "Pytest Bot"},
        headers=signed_up_owner["headers"],
    )
    resp.raise_for_status()
    return resp.json()["bot_id"]


def pytest_sessionfinish(session, exitstatus):
    """The suite signs up hundreds of throwaway users (some promoted to super admin to test the admin screens) and
    used to leave them all in the database. Remove what THIS suite creates (pytest_/invitee_ addresses only, never
    anything made by hand). Set KEEP_TEST_DATA=1 to keep them for debugging."""
    import asyncio
    import os

    if os.environ.get("KEEP_TEST_DATA"):
        return

    async def sweep():
        from app.cleanup_test_data import TEST_RUN_PATTERN, run
        from app.db import engine

        try:
            await run(True, TEST_RUN_PATTERN, quiet=True)
        finally:
            await engine.dispose()

    try:
        asyncio.run(sweep())
    except Exception as e:  # never turn a green test run red because the tidy-up failed
        print(f"\n(test-account cleanup skipped: {e.__class__.__name__}: {e})")
