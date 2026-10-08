"""Bot actions with visitor confirmation (SAN-1801). Gemini and the customer's web address are faked; the database,
the signing and the confirm rules are real."""
from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db import SessionLocal
from app.models import ActionLog, Bot, BotAction, Conversation, PendingAction
from app.services import actions as svc
from app.services import llm, rag
from app.services.crypto import decrypt_secret

DEMO = {
    "name": "book_demo", "label": "Book a demo", "description": "Use when the visitor wants to book a product demo call.",
    "url": "https://93.184.216.34/demo",  # a public IP, so the address check passes offline
    "params": [{"name": "name", "description": "Visitor's name", "required": True},
               {"name": "email", "description": "Visitor's email", "required": True},
               {"name": "notes", "description": "Anything else", "required": False}],
}


class Calls(list):
    """Every call that would have reached the customer's address, plus knobs to change the fake reply."""

    def __init__(self):
        super().__init__()
        self.state = {"status": 200, "body": b'{"message": "Demo booked for Tuesday 4pm."}', "raise": None}


@pytest.fixture
def calls(monkeypatch):
    log = Calls()
    state = log.state

    async def fake_post(url, body, headers):
        log.append({"url": url, "body": json.loads(body), "raw": body, "headers": headers})
        if state["raise"]:
            raise state["raise"]
        return state["status"], state["body"]

    monkeypatch.setattr(svc, "_post", fake_post)
    return log


def fake_llm(monkeypatch, plan: dict, seen: dict | None = None):
    async def analyze(message, history, summary=""):
        return {"standalone_query": message, "language": "en", "is_conversational": False}

    async def planner(message, history, summary, actions):
        return plan

    async def stream(business, language, question, knowledge, *a, **k):
        if seen is not None:
            seen["knowledge"] = knowledge
        yield "OK."

    async def followups(q, a):
        return []

    monkeypatch.setattr(llm, "fast_analyze", analyze)
    monkeypatch.setattr(llm, "plan_action", planner)
    monkeypatch.setattr(llm, "stream_answer", stream)
    monkeypatch.setattr(llm, "suggest_follow_ups", followups)


async def _create(client: AsyncClient, owner: dict, bot: str, **over) -> dict:
    r = await client.post(f"/v1/bots/{bot}/actions", json={**DEMO, **over}, headers=owner["headers"])
    assert r.status_code == 200, r.text
    return r.json()


async def _conversation(bot_id: str, visitor: str = "v1") -> str:
    async with SessionLocal() as s:
        bot = await s.get(Bot, bot_id)
        conv = Conversation(tenant_id=bot.tenant_id, bot_id=bot_id, visitor_id=visitor)
        s.add(conv)
        await s.commit()
        return conv.id


async def _ask(bot_id: str, conv: str, message: str = "please book me a demo", visitor: str = "v1") -> list[dict]:
    async with SessionLocal() as s:
        tenant = (await s.get(Bot, bot_id)).tenant_id
        return [e async for e in rag.answer_stream(
            s, tenant_id=tenant, bot_id=bot_id, business_name="Shop", message=message, conversation_id=conv, visitor_id=visitor)]


# ─── definitions ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("over", [
    {"name": "Book Demo"}, {"name": "ab"}, {"description": "short"}, {"label": " "},
    {"url": "ftp://x.example/hook"}, {"url": "http://127.0.0.1:9000/hook"}, {"url": "http://169.254.169.254/latest"},
    {"params": [{"name": "e-mail"}]}, {"params": [{"name": "a"}, {"name": "a"}]}, {"params": [{"name": f"p{i}"} for i in range(9)]},
])
async def test_bad_definitions_are_rejected(client: AsyncClient, signed_up_owner: dict, bot: str, over):
    r = await client.post(f"/v1/bots/{bot}/actions", json={**DEMO, **over}, headers=signed_up_owner["headers"])
    assert r.status_code == 422, r.text


async def test_secret_is_shown_once_and_stored_encrypted(client: AsyncClient, signed_up_owner: dict, bot: str):
    made = await _create(client, signed_up_owner, bot)
    assert made["secret"].startswith("whsec_")
    listed = (await client.get(f"/v1/bots/{bot}/actions", headers=signed_up_owner["headers"])).json()
    assert "secret" not in listed[0] and listed[0]["signed"] is True
    async with SessionLocal() as s:
        row = await s.get(BotAction, made["action_id"])
        assert made["secret"] not in row.secret_enc and decrypt_secret(row.secret_enc) == made["secret"]
    rotated = (await client.post(f"/v1/actions/{made['action_id']}/rotate-secret", headers=signed_up_owner["headers"])).json()
    assert rotated["secret"] != made["secret"]
    assert (await client.post(f"/v1/bots/{bot}/actions", json=DEMO, headers=signed_up_owner["headers"])).status_code == 409  # same name


async def test_other_workspace_cannot_see_or_change_actions(client: AsyncClient, signed_up_owner: dict, bot: str):
    made = await _create(client, signed_up_owner, bot)
    other = await client.post("/v1/auth/signup", json={"email": f"pytest_{uuid.uuid4().hex[:10]}@example.com", "password": "Passw0rd!23", "business_name": "O"})
    oh = {"Authorization": f"Bearer {other.json()['access_token']}"}
    aid = made["action_id"]
    for resp in (
        await client.get(f"/v1/bots/{bot}/actions", headers=oh),
        await client.post(f"/v1/bots/{bot}/actions", json={**DEMO, "name": "other_one"}, headers=oh),
        await client.put(f"/v1/actions/{aid}", json=DEMO, headers=oh),
        await client.delete(f"/v1/actions/{aid}", headers=oh),
        await client.post(f"/v1/actions/{aid}/rotate-secret", headers=oh),
        await client.post(f"/v1/actions/{aid}/test", headers=oh),
        await client.get(f"/v1/bots/{bot}/actions/log", headers=oh),
    ):
        assert resp.status_code in {403, 404}


# ─── the call itself ────────────────────────────────────────────────────────────


async def test_call_is_signed_and_logged(client: AsyncClient, signed_up_owner: dict, bot: str, calls):
    made = await _create(client, signed_up_owner, bot)
    r = await client.post(f"/v1/actions/{made['action_id']}/test", headers=signed_up_owner["headers"])
    assert r.json() == {"ok": True, "message": "Demo booked for Tuesday 4pm.", "error": ""}

    sent = calls[0]
    assert sent["body"]["action"] == "book_demo" and sent["body"]["params"] == {"name": "test", "email": "test", "notes": "test"}
    ts = sent["headers"]["X-SanchiJawab-Timestamp"]
    expected = "sha256=" + hmac.new(made["secret"].encode(), ts.encode() + b"." + sent["raw"], hashlib.sha256).hexdigest()
    assert sent["headers"]["X-SanchiJawab-Signature"] == expected  # the customer can verify it with the secret they were shown

    log = (await client.get(f"/v1/bots/{bot}/actions/log", headers=signed_up_owner["headers"])).json()
    assert log[0]["action"] == "book_demo" and log[0]["ok"] is True and log[0]["http_status"] == 200


async def test_failures_are_reported_not_raised(client: AsyncClient, signed_up_owner: dict, bot: str, calls):
    made = await _create(client, signed_up_owner, bot)
    calls.state["status"] = 500
    r = (await client.post(f"/v1/actions/{made['action_id']}/test", headers=signed_up_owner["headers"])).json()
    assert r["ok"] is False and r["error"] == "HTTP 500"
    import httpx
    calls.state["raise"] = httpx.ConnectError("down")
    r = (await client.post(f"/v1/actions/{made['action_id']}/test", headers=signed_up_owner["headers"])).json()
    assert r["ok"] is False and r["error"] == "ConnectError"


async def test_private_address_is_blocked_again_at_call_time(client: AsyncClient, signed_up_owner: dict, bot: str, calls):
    made = await _create(client, signed_up_owner, bot)
    async with SessionLocal() as s:  # as if DNS for the saved address later started pointing inside the network
        row = await s.get(BotAction, made["action_id"])
        row.url = "http://169.254.169.254/latest/meta-data/"
        await s.commit()
    r = (await client.post(f"/v1/actions/{made['action_id']}/test", headers=signed_up_owner["headers"])).json()
    assert r["ok"] is False and "private or internal" in r["error"] and calls == []


# ─── proposal → confirm / cancel ────────────────────────────────────────────────────────


async def test_confirmation_flow_runs_the_call_once_with_the_stored_details(client: AsyncClient, signed_up_owner: dict, bot: str, calls, monkeypatch):
    await _create(client, signed_up_owner, bot)
    fake_llm(monkeypatch, {"action": "book_demo", "params": {"name": "Asha", "email": "asha@example.org", "evil": "x", "notes": ""}})
    conv = await _conversation(bot)

    events = await _ask(bot, conv)
    proposal = next(e for e in events if e["type"] == "action_proposal")
    assert proposal["label"] == "Book a demo"
    assert proposal["fields"] == [{"name": "Visitor's name", "value": "Asha"}, {"name": "Visitor's email", "value": "asha@example.org"}]
    assert calls == []  # proposing never calls the customer

    pid = proposal["pending_id"]
    ok = await client.post(f"/public/w/{bot}/actions/{pid}/confirm", json={"conversation_id": conv, "visitor_id": "v1"})
    assert ok.status_code == 200 and ok.json() == {"ok": True, "message": "Demo booked for Tuesday 4pm."}
    assert len(calls) == 1 and calls[0]["body"]["params"] == {"name": "Asha", "email": "asha@example.org"}
    assert calls[0]["body"]["confirmed_by_visitor"] is True and "evil" not in calls[0]["body"]["params"]

    again = await client.post(f"/public/w/{bot}/actions/{pid}/confirm", json={"conversation_id": conv, "visitor_id": "v1"})
    assert again.status_code == 409 and len(calls) == 1  # pressing Confirm twice runs it once


async def test_wrong_conversation_wrong_visitor_cancel_and_expiry_never_run_it(client: AsyncClient, signed_up_owner: dict, bot: str, calls, monkeypatch):
    await _create(client, signed_up_owner, bot)
    fake_llm(monkeypatch, {"action": "book_demo", "params": {"name": "Asha", "email": "a@example.org"}})
    conv, other_conv = await _conversation(bot), await _conversation(bot, "v2")

    async def new_pending() -> str:
        return next(e for e in await _ask(bot, conv) if e["type"] == "action_proposal")["pending_id"]

    pid = await new_pending()
    assert (await client.post(f"/public/w/{bot}/actions/{pid}/confirm", json={"conversation_id": other_conv, "visitor_id": "v1"})).status_code == 409
    assert (await client.post(f"/public/w/{bot}/actions/{pid}/confirm", json={"conversation_id": conv, "visitor_id": "someone-else"})).status_code == 409
    assert (await client.post(f"/public/w/missing/actions/{pid}/confirm", json={"conversation_id": conv, "visitor_id": "v1"})).status_code == 404

    cancelled = await client.post(f"/public/w/{bot}/actions/{pid}/cancel", json={"conversation_id": conv, "visitor_id": "v1"})
    assert cancelled.json() == {"cancelled": True}
    assert (await client.post(f"/public/w/{bot}/actions/{pid}/confirm", json={"conversation_id": conv, "visitor_id": "v1"})).status_code == 409

    pid2 = await new_pending()
    async with SessionLocal() as s:
        p = await s.get(PendingAction, pid2)
        p.expires_at = datetime.utcnow() - timedelta(minutes=1)
        await s.commit()
    assert (await client.post(f"/public/w/{bot}/actions/{pid2}/confirm", json={"conversation_id": conv, "visitor_id": "v1"})).status_code == 409
    assert calls == []


# ─── what the model may and may not do ────────────────────────────────────────────────────


async def test_missing_details_are_asked_for_not_guessed(client: AsyncClient, signed_up_owner: dict, bot: str, calls, monkeypatch):
    await _create(client, signed_up_owner, bot)
    seen: dict = {}
    fake_llm(monkeypatch, {"action": "book_demo", "params": {"name": "Asha"}}, seen)
    events = await _ask(bot, await _conversation(bot))
    assert not any(e["type"] == "action_proposal" for e in events) and calls == []
    assert "Visitor's email" in seen["knowledge"] and "Never make up values" in seen["knowledge"]


async def test_unknown_or_disabled_actions_and_garbage_plans_are_ignored(client: AsyncClient, signed_up_owner: dict, bot: str, calls, monkeypatch):
    made = await _create(client, signed_up_owner, bot)
    conv = await _conversation(bot)
    for plan in ({"action": "delete_everything", "params": {}}, {"action": None}, "nonsense", {}):
        fake_llm(monkeypatch, plan)
        assert not any(e["type"] == "action_proposal" for e in await _ask(bot, conv))
    await client.put(f"/v1/actions/{made['action_id']}", json={**DEMO, "enabled": False}, headers=signed_up_owner["headers"])
    fake_llm(monkeypatch, {"action": "book_demo", "params": {"name": "A", "email": "a@b.co"}})
    assert not any(e["type"] == "action_proposal" for e in await _ask(bot, conv))
    assert calls == []


async def test_read_only_actions_run_immediately_and_feed_the_answer(client: AsyncClient, signed_up_owner: dict, bot: str, calls, monkeypatch):
    await _create(
        client, signed_up_owner, bot, name="order_status", label="Check order", requires_confirmation=False,
        description="Use when the visitor asks where their order is.", params=[{"name": "order_number", "description": "Order number"}],
    )
    calls.state["body"] = b'{"message": "Order 1234 shipped yesterday."}'
    seen: dict = {}
    fake_llm(monkeypatch, {"action": "order_status", "params": {"order_number": "1234"}}, seen)
    events = await _ask(bot, await _conversation(bot), "where is order 1234?")
    assert not any(e["type"] == "action_proposal" for e in events)
    assert len(calls) == 1 and calls[0]["body"]["confirmed_by_visitor"] is False
    assert "Order 1234 shipped yesterday." in seen["knowledge"]
    async with SessionLocal() as s:
        assert (await s.execute(select(ActionLog).where(ActionLog.bot_id == bot))).scalars().first().ok is True


async def test_reply_text_is_plain_text_only():
    assert svc._message_from(b'{"message": "<img src=x onerror=alert(1)> hi"}') == "<img src=x onerror=alert(1)> hi"  # rendered as text by the widget
    assert svc._message_from(b"plain reply") == "plain reply"
    assert len(svc._message_from(b"x" * 5000)) == 500
