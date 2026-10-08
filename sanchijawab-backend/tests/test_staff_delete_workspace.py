"""Staff deleting a workspace must also remove its API keys (they reference the workspace)."""
from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy import select

from app.db import SessionLocal
from app.models import ApiKey, User, Workspace


async def test_staff_can_delete_a_workspace_that_has_api_keys(client: AsyncClient, signed_up_owner: dict):
    ws = signed_up_owner["workspace_id"]
    made = await client.post(f"/v1/workspaces/{ws}/api-keys", json={"name": "k"}, headers=signed_up_owner["headers"])
    assert made.status_code == 200

    admin_email = f"pytest_{uuid.uuid4().hex[:10]}@example.com"
    signup = await client.post("/v1/auth/signup", json={"email": admin_email, "password": "Passw0rd!23", "business_name": "Staff"})
    admin_ws = signup.json()["workspace_id"]
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == admin_email))).scalar_one()
        user.is_super_admin = True
        await session.commit()
    token = (await client.post("/v1/staff/login", json={"email": admin_email, "password": "Passw0rd!23"})).json()["access_token"]
    staff = {"Authorization": f"Bearer {token}"}

    assert (await client.delete(f"/v1/staff/workspaces/{ws}", headers=staff)).status_code == 200
    async with SessionLocal() as session:
        assert await session.get(Workspace, ws) is None
        assert (await session.execute(select(ApiKey).where(ApiKey.workspace_id == ws))).first() is None
    await client.delete(f"/v1/staff/workspaces/{admin_ws}", headers=staff)
