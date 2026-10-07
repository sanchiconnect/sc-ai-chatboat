"""Super-admin-only editing of plan limits and marketing content."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db import SessionLocal
from app.models import ContentPage, Plan, User


@pytest.fixture
async def superadmin(client: AsyncClient, signed_up_owner: dict):
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == signed_up_owner["email"]))).scalar_one()
        user.is_super_admin = True
        await session.commit()
    return signed_up_owner["headers"]


@pytest.fixture
async def staff(client: AsyncClient, superadmin: dict, signed_up_owner: dict):
    """A platform-staff session (separate token from the customer one)."""
    resp = await client.post("/v1/staff/login", json={"email": signed_up_owner["email"], "password": "Passw0rd!23"})
    resp.raise_for_status()
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def plan_id(client: AsyncClient, superadmin: dict):
    resp = await client.post("/v1/plans", json={"name": f"T-{uuid.uuid4().hex[:6]}"}, headers=superadmin)
    resp.raise_for_status()
    yield resp.json()["plan_id"]
    async with SessionLocal() as session:
        plan = await session.get(Plan, resp.json()["plan_id"])
        if plan:
            await session.delete(plan)
            await session.commit()


async def test_super_admin_sets_and_clears_plan_limits(client: AsyncClient, superadmin: dict, plan_id: str):
    set_ = await client.patch(
        f"/v1/plans/{plan_id}", json={"limits": {"max_pages": 500, "max_seats": 3}}, headers=superadmin
    )
    assert set_.json()["limits"] == {
        "max_messages_per_month": None, "max_pages": 500, "max_files": None, "max_seats": 3,
    }
    cleared = await client.patch(f"/v1/plans/{plan_id}", json={"limits": {"max_pages": None}}, headers=superadmin)
    assert cleared.json()["limits"]["max_pages"] is None and cleared.json()["limits"]["max_seats"] == 3

    assert (await client.patch(f"/v1/plans/{plan_id}", json={"limits": {"bogus": 1}}, headers=superadmin)).status_code == 422
    assert (await client.patch(f"/v1/plans/{plan_id}", json={"limits": {"max_pages": -5}}, headers=superadmin)).status_code == 422


async def test_ordinary_owner_cannot_edit_plans_or_content(client: AsyncClient, signed_up_owner: dict):
    h = signed_up_owner["headers"]  # a normal workspace owner, not a super admin
    assert (await client.post("/v1/plans", json={"name": "x"}, headers=h)).status_code in {401, 403}
    put = await client.put("/v1/content/legal/privacy", json={"title": "Hacked"}, headers=h)
    assert put.status_code in {401, 403}
    assert (await client.get("/v1/content", headers=h)).status_code in {401, 403}


async def test_content_draft_publish_and_delete(client: AsyncClient, staff: dict):
    slug = f"test-{uuid.uuid4().hex[:8]}"
    try:
        draft = await client.put(
            f"/v1/content/blog/{slug}",
            json={"title": "Hello", "excerpt": "e", "body": "Para one.\n\nPara two.", "date": "2026-10-07"},
            headers=staff,
        )
        assert draft.status_code == 200 and draft.json()["published"] is False
        # Drafts are invisible to the public.
        assert (await client.get(f"/public/content/blog/{slug}")).status_code == 404
        assert slug not in [c["slug"] for c in (await client.get("/public/content/blog")).json()]

        await client.put(
            f"/v1/content/blog/{slug}",
            json={"title": "Hello", "body": "Para one.\n\nPara two.", "published": True, "date": "2026-10-07"},
            headers=staff,
        )
        public = await client.get(f"/public/content/blog/{slug}")
        assert public.status_code == 200 and public.json()["body"].startswith("Para one.")
        listed = (await client.get("/public/content/blog")).json()
        assert slug in [c["slug"] for c in listed] and "body" not in listed[0]
    finally:
        await client.delete(f"/v1/content/blog/{slug}", headers=staff)
    assert (await client.get(f"/public/content/blog/{slug}")).status_code == 404


async def test_content_validation(client: AsyncClient, staff: dict):
    assert (await client.put("/v1/content/blog/Bad Slug", json={"title": "x"}, headers=staff)).status_code == 422
    assert (await client.put("/v1/content/poems/x", json={"title": "x"}, headers=staff)).status_code == 404
    assert (await client.put("/v1/content/blog/ok", json={"title": " "}, headers=staff)).status_code == 422
    assert (await client.put("/v1/content/blog/ok", json={"title": "t", "date": "7 Oct"}, headers=staff)).status_code == 422
    async with SessionLocal() as session:
        assert (await session.execute(select(ContentPage).where(ContentPage.slug == "ok"))).first() is None
