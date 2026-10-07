"""Audit log of super admin actions and editable platform settings (SAN-1778)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db import SessionLocal
from app.models import PlatformSetting, User, Workspace


@pytest.fixture
async def staff(client: AsyncClient, signed_up_owner: dict):
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == signed_up_owner["email"]))).scalar_one()
        user.is_super_admin = True
        await session.commit()
    resp = await client.post("/v1/staff/login", json={"email": signed_up_owner["email"], "password": "Passw0rd!23"})
    resp.raise_for_status()
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture(autouse=True)
async def _restore_settings():
    """The suite runs against the developer's real DB, so put back whatever
    platform settings were saved before the test instead of wiping them."""
    async with SessionLocal() as session:
        before = {r.key: (r.value, r.updated_by) for r in (await session.execute(select(PlatformSetting))).scalars().all()}
    yield
    async with SessionLocal() as session:
        for row in (await session.execute(select(PlatformSetting))).scalars().all():
            await session.delete(row)
        await session.flush()
        for key, (value, updated_by) in before.items():
            session.add(PlatformSetting(key=key, value=value, updated_by=updated_by))
        await session.commit()


async def test_super_admin_writes_are_audited_without_bodies(client: AsyncClient, staff: dict, signed_up_owner: dict):
    slug = f"audit-{uuid.uuid4().hex[:6]}"
    await client.put(f"/v1/content/blog/{slug}", json={"title": "SECRET-BODY-TEXT"}, headers=staff)
    await client.delete(f"/v1/content/blog/{slug}", headers=staff)
    await client.get("/v1/content", headers=staff)  # reads are not audited

    log = (await client.get("/v1/staff/audit-log", headers=staff)).json()
    mine = [r for r in log if slug in r["path"]]
    assert [(r["method"], r["actor_email"]) for r in reversed(mine)] == [
        ("PUT", signed_up_owner["email"]), ("DELETE", signed_up_owner["email"]),
    ]
    assert not any(r["method"] == "GET" and r["path"] == "/v1/content" for r in log)
    assert "SECRET-BODY-TEXT" not in str(log)  # request bodies are never stored


async def test_failed_and_login_requests_are_not_audited(client: AsyncClient, staff: dict, signed_up_owner: dict):
    await client.put("/v1/content/poems/x", json={"title": "x"}, headers=staff)  # 404
    log = (await client.get("/v1/staff/audit-log", headers=staff)).json()
    assert not any("/poems/" in r["path"] for r in log)
    assert not any(r["path"] == "/v1/staff/login" for r in log)


async def test_audit_log_requires_staff(client: AsyncClient, signed_up_owner: dict):
    assert (await client.get("/v1/staff/audit-log", headers=signed_up_owner["headers"])).status_code == 401


async def test_settings_defaults_update_and_validation(client: AsyncClient, staff: dict):
    s = {r["key"]: r for r in (await client.get("/v1/staff/settings", headers=staff)).json()}
    assert s["trial_days"]["value"] == "14" and s["trial_days"]["is_default"]

    updated = await client.put("/v1/staff/settings/trial_days", json={"value": "30"}, headers=staff)
    assert {r["key"]: r["value"] for r in updated.json()}["trial_days"] == "30"

    assert (await client.put("/v1/staff/settings/trial_days", json={"value": "0"}, headers=staff)).status_code == 422
    assert (await client.put("/v1/staff/settings/trial_days", json={"value": "abc"}, headers=staff)).status_code == 422
    assert (await client.put("/v1/staff/settings/support_email", json={"value": "nope"}, headers=staff)).status_code == 422
    assert (await client.put("/v1/staff/settings/default_model_tier", json={"value": "ultra"}, headers=staff)).status_code == 422
    assert (await client.put("/v1/staff/settings/jwt_secret", json={"value": "x"}, headers=staff)).status_code == 404


async def test_new_trial_length_and_default_tier_apply(client: AsyncClient, staff: dict):
    await client.put("/v1/staff/settings/trial_days", json={"value": "30"}, headers=staff)
    await client.put("/v1/staff/settings/default_model_tier", json={"value": "economy"}, headers=staff)

    signup = await client.post(
        "/v1/auth/signup",
        json={"email": f"pytest_{uuid.uuid4().hex[:10]}@example.com", "password": "Passw0rd!23", "business_name": "T"},
    )
    data = signup.json()
    async with SessionLocal() as session:
        ws = await session.get(Workspace, data["workspace_id"])
        days = (ws.trial_ends_at - datetime.utcnow()) / timedelta(days=1)
    assert 29 < days <= 30

    h = {"Authorization": f"Bearer {data['access_token']}"}
    bot_id = (await client.post(f"/v1/workspaces/{data['workspace_id']}/bots", json={"name": "B"}, headers=h)).json()["bot_id"]
    assert (await client.get(f"/v1/bots/{bot_id}", headers=h)).json()["model_tier"] == "economy"
