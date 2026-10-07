"""Cross-tenant isolation (SAN-1125, FR-K13): a second workspace's owner must
never read or change the first workspace's bot data, and retrieval must never
return another tenant's chunks. Runs against the real DB like the rest of
the suite."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.db import SessionLocal
from app.models import Bot
from app.services import retrieval


@pytest.fixture
async def other_owner(client: AsyncClient):
    email = f"pytest_{uuid.uuid4().hex[:10]}@example.com"
    resp = await client.post(
        "/v1/auth/signup",
        json={"email": email, "password": "Passw0rd!23", "business_name": "OtherCo"},
    )
    resp.raise_for_status()
    data = resp.json()
    return {"workspace_id": data["workspace_id"], "headers": {"Authorization": f"Bearer {data['access_token']}"}}


async def test_other_workspace_cannot_touch_bot(client: AsyncClient, signed_up_owner: dict, bot: str, other_owner: dict):
    h = other_owner["headers"]
    forbidden = {403, 404}

    checks = [
        await client.get(f"/v1/bots/{bot}", headers=h),
        await client.patch(f"/v1/bots/{bot}", json={"persona": "hijacked"}, headers=h),
        await client.delete(f"/v1/bots/{bot}", headers=h),
        await client.get(f"/v1/bots/{bot}/widget-config", headers=h),
        await client.put(f"/v1/bots/{bot}/widget-config", json={"header": "hijacked"}, headers=h),
        await client.get(f"/v1/bots/{bot}/sources", headers=h),
        await client.get(f"/v1/bots/{bot}/conversations", headers=h),
        await client.get(f"/v1/bots/{bot}/leads", headers=h),
        await client.get(f"/v1/bots/{bot}/analytics/summary", headers=h),
        await client.get(f"/v1/bots/{bot}/qa-pairs", headers=h),
        await client.post(f"/v1/bots/{bot}/qa-pairs", json={"question": "q", "answer": "a"}, headers=h),
        await client.get(f"/v1/bots/{bot}/teams", headers=h),
        await client.get(f"/v1/bots/{bot}/routing-rules", headers=h),
        await client.get(f"/v1/workspaces/{signed_up_owner['workspace_id']}/bots", headers=h),
        await client.get(f"/v1/workspaces/{signed_up_owner['workspace_id']}/members", headers=h),
        await client.get(f"/v1/workspaces/{signed_up_owner['workspace_id']}/usage", headers=h),
    ]
    for resp in checks:
        assert resp.status_code in forbidden, f"{resp.request.method} {resp.request.url.path} -> {resp.status_code}"

    # And the owner's own bot is untouched by the attempts above.
    mine = await client.get(f"/v1/bots/{bot}", headers=signed_up_owner["headers"])
    assert mine.status_code == 200 and mine.json()["persona"] == ""


async def test_retrieval_is_scoped_to_tenant_and_bot(client: AsyncClient, signed_up_owner: dict, bot: str, other_owner: dict):
    secret = f"zebracorn-{uuid.uuid4().hex[:8]}"
    created = await client.post(
        f"/v1/bots/{bot}/qa-pairs",
        json={"question": f"What is {secret}?", "answer": f"{secret} is our private product."},
        headers=signed_up_owner["headers"],
    )
    created.raise_for_status()

    other_bot = (
        await client.post(
            f"/v1/workspaces/{other_owner['workspace_id']}/bots",
            json={"name": "Other Bot"},
            headers=other_owner["headers"],
        )
    ).json()["bot_id"]

    async with SessionLocal() as session:
        owner_bot = await session.get(Bot, bot)
        intruder_bot = await session.get(Bot, other_bot)

        own = await retrieval.hybrid_search(session, tenant_id=owner_bot.tenant_id, bot_id=bot, query=secret)
        assert any(secret in c["text"] for c in own)

        # Other tenant's bot searching the same words must come back empty of the secret.
        leaked = await retrieval.hybrid_search(
            session, tenant_id=intruder_bot.tenant_id, bot_id=other_bot, query=secret
        )
        assert not any(secret in c["text"] for c in leaked)

        # Even pointing at the victim's bot_id with the wrong tenant_id returns nothing.
        crossed = await retrieval.hybrid_search(
            session, tenant_id=intruder_bot.tenant_id, bot_id=bot, query=secret
        )
        assert crossed == []
