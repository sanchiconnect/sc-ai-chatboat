"""Per-bot retention_days (SAN-1127), its worker purge, and the widget
show_sources toggle (FR-C3)."""
from __future__ import annotations

from datetime import datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app import worker
from app.db import SessionLocal
from app.models import Bot, Conversation
from tests.test_privacy import _exists, _seed


async def test_show_sources_defaults_on_and_reaches_public_config(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    assert (await client.get(f"/public/w/{bot}/config")).json()["show_sources"] is True

    updated = await client.put(f"/v1/bots/{bot}/widget-config", json={"show_sources": False}, headers=h)
    assert updated.json()["show_sources"] is False
    assert (await client.get(f"/public/w/{bot}/config")).json()["show_sources"] is False


async def test_retention_days_validation_and_clear(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    assert (await client.patch(f"/v1/bots/{bot}", json={"retention_days": 30}, headers=h)).json()["retention_days"] == 30
    assert (await client.patch(f"/v1/bots/{bot}", json={"retention_days": -1}, headers=h)).status_code == 400
    assert (await client.patch(f"/v1/bots/{bot}", json={"retention_days": 0}, headers=h)).json()["retention_days"] is None


async def test_worker_purges_only_bots_with_retention_set(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    old = datetime.utcnow() - timedelta(days=60)
    old_conv = await _seed(bot, "v-old", started_at=old)

    # No retention configured -> the worker keeps everything.
    await worker.purge_expired_conversations()
    assert await _exists(old_conv)

    await client.patch(f"/v1/bots/{bot}", json={"retention_days": 30}, headers=h)
    recent = await _seed(bot, "v-recent")
    await worker.purge_expired_conversations()

    assert not await _exists(old_conv)
    assert await _exists(recent)
    async with SessionLocal() as session:
        assert (await session.get(Bot, bot)).retention_days == 30
        left = (await session.execute(select(Conversation.id).where(Conversation.bot_id == bot))).scalars().all()
        assert left == [recent]
