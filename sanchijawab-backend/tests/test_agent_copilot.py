"""Agent copilot: suggested reply drafts (Phase 3). Gemini is faked; retrieval is real."""
from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Bot, Conversation, Message
from app.services import llm


async def _conversation_with_visitor_message(bot_id: str, text: str | None) -> str:
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        conv = Conversation(tenant_id=bot.tenant_id, bot_id=bot_id, visitor_id="v-copilot")
        session.add(conv)
        await session.flush()
        if text:
            session.add(Message(tenant_id=bot.tenant_id, conversation_id=conv.id, role="visitor", content=text))
        await session.commit()
        return conv.id


async def test_suggestion_uses_knowledge_and_never_sends(client: AsyncClient, signed_up_owner: dict, bot: str, monkeypatch):
    h = signed_up_owner["headers"]
    secret = f"zorbitron-{uuid.uuid4().hex[:6]}"
    await client.post(
        f"/v1/bots/{bot}/qa-pairs", json={"question": f"What is {secret}?", "answer": f"{secret} ships in 3 days."}, headers=h
    )
    conv = await _conversation_with_visitor_message(bot, f"How long does {secret} take?")

    seen = {}

    async def fake_draft(business, transcript, knowledge):
        seen.update(business=business, transcript=transcript, knowledge=knowledge)
        return "It ships in 3 days."

    monkeypatch.setattr(llm, "draft_agent_reply", fake_draft)
    resp = await client.post(f"/v1/conversations/{conv}/suggest-reply", headers=h)

    assert resp.status_code == 200 and resp.json()["suggestion"] == "It ships in 3 days."
    assert secret in seen["knowledge"]  # the real retrieval found the bot's own answer
    assert seen["transcript"][-1]["role"] == "visitor"
    async with SessionLocal() as session:  # nothing was sent to the visitor
        n = (await session.execute(select(func.count()).select_from(Message).where(Message.conversation_id == conv))).scalar_one()
    assert n == 1


async def test_suggestion_edge_cases(client: AsyncClient, signed_up_owner: dict, bot: str, monkeypatch):
    h = signed_up_owner["headers"]
    empty = await _conversation_with_visitor_message(bot, None)
    assert (await client.post(f"/v1/conversations/{empty}/suggest-reply", headers=h)).status_code == 422
    assert (await client.post("/v1/conversations/nope/suggest-reply", headers=h)).status_code == 404

    async def boom(*a, **k):
        raise RuntimeError("gemini down")

    monkeypatch.setattr(llm, "draft_agent_reply", boom)
    conv = await _conversation_with_visitor_message(bot, "hello?")
    assert (await client.post(f"/v1/conversations/{conv}/suggest-reply", headers=h)).status_code == 503


async def test_other_workspace_cannot_get_suggestions(client: AsyncClient, signed_up_owner: dict, bot: str):
    other = await client.post(
        "/v1/auth/signup",
        json={"email": f"pytest_{uuid.uuid4().hex[:10]}@example.com", "password": "Passw0rd!23", "business_name": "X"},
    )
    oh = {"Authorization": f"Bearer {other.json()['access_token']}"}
    conv = await _conversation_with_visitor_message(bot, "hi")
    assert (await client.post(f"/v1/conversations/{conv}/suggest-reply", headers=oh)).status_code in {403, 404}
