"""The test-data cleanup tool deletes only what matches, and never touches anyone else."""
from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy import select

from app.cleanup_test_data import run
from app.db import SessionLocal
from app.models import User, Workspace
from app.services.workspace_delete import delete_workspace


async def _signup(client: AsyncClient, email: str) -> str:
    r = await client.post("/v1/auth/signup", json={"email": email, "password": "Passw0rd!23", "business_name": "CleanupCheck"})
    r.raise_for_status()
    return r.json()["workspace_id"]


async def test_cleanup_removes_matching_workspaces_and_spares_everyone_else(client: AsyncClient):
    tag = uuid.uuid4().hex[:8]
    doomed_email = f"pytest_{tag}@example.com"
    spared_email = f"keepme_{tag}@notexample.org"
    doomed_ws = await _signup(client, doomed_email)
    spared_ws = await _signup(client, spared_email)
    # A throwaway user promoted to super admin (what some tests do) must still be cleaned up.
    async with SessionLocal() as s:
        u = (await s.execute(select(User).where(User.email == doomed_email))).scalar_one()
        u.is_super_admin = True
        await s.commit()

    pattern = rf"^pytest_{tag}@example\.com$"
    try:
        assert await run(False, pattern, quiet=True) == (1, 0)
        async with SessionLocal() as s:  # a dry run deletes nothing
            assert await s.get(Workspace, doomed_ws) is not None

        assert await run(True, pattern, quiet=True) == (1, 0)
        async with SessionLocal() as s:
            assert await s.get(Workspace, doomed_ws) is None
            assert (await s.execute(select(User).where(User.email == doomed_email))).first() is None
            assert await s.get(Workspace, spared_ws) is not None
            assert (await s.execute(select(User).where(User.email == spared_email))).first() is not None
    finally:
        async with SessionLocal() as s:
            await delete_workspace(s, spared_ws)
