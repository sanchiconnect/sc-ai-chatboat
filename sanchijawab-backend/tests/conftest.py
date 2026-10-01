"""Shared fixtures. These tests run against the REAL configured PostgreSQL
(from .env) — same stack every manual test in this project has used — not
mocks, per the project's whole "prove it, don't fabricate" approach.
`client` gives an in-process ASGI client, so no separate uvicorn process is
needed; the app's real startup/session/DB code runs exactly as it would
under uvicorn.
"""
from __future__ import annotations

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.db import engine
from app.main import app


@pytest_asyncio.fixture(autouse=True)
async def _dispose_engine_per_test():
    """Each test function gets a fresh asyncio event loop (pytest-asyncio's
    default), but the app's DB engine + pooled connections are created once
    at import time bound to whichever loop used them first. Without this,
    test 2 onward hits `RuntimeError: Event loop is closed` / "attached to
    a different loop" trying to reuse test 1's pooled connections."""
    yield
    await engine.dispose()


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
