"""Visitor export/erase and retention purge (SAN-1127)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Bot, Conversation, Lead, Message


async def _seed(bot_id: str, visitor_id: str, *, started_at: datetime | None = None) -> str:
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        conv = Conversation(
            tenant_id=bot.tenant_id, bot_id=bot_id, visitor_id=visitor_id,
            started_at=started_at or datetime.utcnow(),
        )
        session.add(conv)
        await session.flush()
        session.add(Message(tenant_id=bot.tenant_id, conversation_id=conv.id, role="visitor", content="hello"))
        session.add(Lead(tenant_id=bot.tenant_id, conversation_id=conv.id, name="Asha", email="asha@example.com"))
        await session.commit()
        return conv.id


async def _exists(conv_id: str) -> bool:
    async with SessionLocal() as session:
        return (await session.execute(select(Conversation.id).where(Conversation.id == conv_id))).first() is not None


async def test_export_then_erase_one_visitor_only(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    target, other = f"v-{uuid.uuid4().hex[:8]}", f"v-{uuid.uuid4().hex[:8]}"
    target_conv = await _seed(bot, target)
    other_conv = await _seed(bot, other)

    exported = await client.get(f"/v1/bots/{bot}/visitors/{target}/export", headers=h)
    assert exported.status_code == 200
    data = exported.json()
    assert [c["conversation_id"] for c in data["conversations"]] == [target_conv]
    assert data["conversations"][0]["messages"][0]["content"] == "hello"
    assert data["conversations"][0]["leads"][0]["email"] == "asha@example.com"

    erased = await client.delete(f"/v1/bots/{bot}/visitors/{target}", headers=h)
    assert erased.json() == {"deleted_conversations": 1}
    assert not await _exists(target_conv)
    assert await _exists(other_conv)


async def test_retention_purge_deletes_only_old_conversations(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    old = await _seed(bot, "v-old", started_at=datetime.utcnow() - timedelta(days=100))
    recent = await _seed(bot, "v-new")

    resp = await client.delete(f"/v1/bots/{bot}/conversations", params={"older_than_days": 90}, headers=h)
    assert resp.json() == {"deleted_conversations": 1}
    assert not await _exists(old) and await _exists(recent)

    bad = await client.delete(f"/v1/bots/{bot}/conversations", params={"older_than_days": 0}, headers=h)
    assert bad.status_code == 400


async def test_privacy_endpoints_are_tenant_scoped(client: AsyncClient, signed_up_owner: dict, bot: str):
    other = await client.post(
        "/v1/auth/signup",
        json={"email": f"pytest_{uuid.uuid4().hex[:10]}@example.com", "password": "Passw0rd!23", "business_name": "X"},
    )
    oh = {"Authorization": f"Bearer {other.json()['access_token']}"}
    conv = await _seed(bot, "v-protected")

    for resp in (
        await client.get(f"/v1/bots/{bot}/visitors/v-protected/export", headers=oh),
        await client.delete(f"/v1/bots/{bot}/visitors/v-protected", headers=oh),
        await client.delete(f"/v1/bots/{bot}/conversations", params={"older_than_days": 1}, headers=oh),
    ):
        assert resp.status_code in {403, 404}
    assert await _exists(conv)
