"""Public API keys, REST endpoints and the MCP server (SAN-1806)."""
from __future__ import annotations

import json
import uuid

import pytest
from httpx import AsyncClient

from app import public_api
from app.config import settings
from app.db import SessionLocal
from app.models import Bot, Conversation, Lead, Message


async def _make_key(client: AsyncClient, owner: dict) -> dict:
    r = await client.post(
        f"/v1/workspaces/{owner['workspace_id']}/api-keys", json={"name": "ci"}, headers=owner["headers"]
    )
    assert r.status_code == 200, r.text
    return r.json()


def _auth(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


async def _conversation(bot_id: str) -> str:
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        conv = Conversation(tenant_id=bot.tenant_id, bot_id=bot_id, visitor_id="v-api")
        session.add(conv)
        await session.flush()
        session.add(Message(tenant_id=bot.tenant_id, conversation_id=conv.id, role="visitor", content="hello there"))
        session.add(Lead(tenant_id=bot.tenant_id, conversation_id=conv.id, name="Asha", email="a@example.com"))
        await session.commit()
        return conv.id


@pytest.fixture
def fake_answer(monkeypatch):
    async def fake(session, **kw):
        yield {"type": "delta", "text": "We open at nine."}
        yield {"type": "done", "no_answer": False, "sources": [{"url": "https://x.example/hours"}], "follow_ups": []}

    monkeypatch.setattr(public_api, "answer_stream", fake)


async def test_key_is_shown_once_and_stored_hashed(client: AsyncClient, signed_up_owner: dict):
    made = await _make_key(client, signed_up_owner)
    assert made["key"].startswith("sj_live_")

    listed = (await client.get(f"/v1/workspaces/{signed_up_owner['workspace_id']}/api-keys", headers=signed_up_owner["headers"])).json()
    mine = next(k for k in listed if k["key_id"] == made["key_id"])
    assert "key" not in mine and mine["prefix"] == made["key"][:12] and not mine["revoked"]
    async with SessionLocal() as session:
        from app.models import ApiKey
        row = await session.get(ApiKey, made["key_id"])
        assert made["key"] not in (row.key_hash, row.key_prefix) and len(row.key_hash) == 64


async def test_auth_failures_and_revocation(client: AsyncClient, signed_up_owner: dict):
    assert (await client.get("/api/v1/bots")).status_code == 401
    assert (await client.get("/api/v1/bots", headers=_auth("sj_live_wrong"))).status_code == 401
    assert (await client.get("/api/v1/bots", headers=signed_up_owner["headers"])).status_code == 401  # a login token is not an API key

    made = await _make_key(client, signed_up_owner)
    assert (await client.get("/api/v1/bots", headers=_auth(made["key"]))).status_code == 200
    rev = await client.delete(
        f"/v1/workspaces/{signed_up_owner['workspace_id']}/api-keys/{made['key_id']}", headers=signed_up_owner["headers"]
    )
    assert rev.json() == {"revoked": True}
    assert (await client.get("/api/v1/bots", headers=_auth(made["key"]))).status_code == 401


async def test_rest_reads_are_scoped_to_the_keys_workspace(client: AsyncClient, signed_up_owner: dict, bot: str):
    key = (await _make_key(client, signed_up_owner))["key"]
    conv = await _conversation(bot)

    assert [b["bot_id"] for b in (await client.get("/api/v1/bots", headers=_auth(key))).json()] == [bot]
    convs = (await client.get(f"/api/v1/bots/{bot}/conversations", headers=_auth(key))).json()
    assert [c["conversation_id"] for c in convs] == [conv]
    detail = (await client.get(f"/api/v1/conversations/{conv}", headers=_auth(key))).json()
    assert detail["messages"][0]["content"] == "hello there"
    assert (await client.get(f"/api/v1/bots/{bot}/leads", headers=_auth(key))).json()[0]["email"] == "a@example.com"

    # A different workspace's key sees none of it.
    other = await client.post(
        "/v1/auth/signup",
        json={"email": f"pytest_{uuid.uuid4().hex[:10]}@example.com", "password": "Passw0rd!23", "business_name": "O"},
    )
    od = other.json()
    other_owner = {"workspace_id": od["workspace_id"], "headers": {"Authorization": f"Bearer {od['access_token']}"}}
    okey = (await _make_key(client, other_owner))["key"]
    assert (await client.get("/api/v1/bots", headers=_auth(okey))).json() == []
    for path in (f"/api/v1/bots/{bot}/conversations", f"/api/v1/conversations/{conv}", f"/api/v1/bots/{bot}/leads"):
        assert (await client.get(path, headers=_auth(okey))).status_code == 404


async def test_ask_endpoint(client: AsyncClient, signed_up_owner: dict, bot: str, fake_answer):
    key = (await _make_key(client, signed_up_owner))["key"]
    r = await client.post(f"/api/v1/bots/{bot}/ask", json={"question": "When do you open?"}, headers=_auth(key))
    assert r.json() == {"answer": "We open at nine.", "sources": ["https://x.example/hours"], "answered": True}
    assert (await client.post(f"/api/v1/bots/{bot}/ask", json={"question": " "}, headers=_auth(key))).status_code == 422


async def _rpc(client, key, method, params=None, rid=1):
    return await client.post("/mcp", json={"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}, headers=_auth(key))


async def test_mcp_protocol_and_tools(client: AsyncClient, signed_up_owner: dict, bot: str, fake_answer):
    key = (await _make_key(client, signed_up_owner))["key"]

    init = (await _rpc(client, key, "initialize")).json()["result"]
    assert init["serverInfo"]["name"] == "sanchijawab" and "tools" in init["capabilities"]
    note = await client.post("/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers=_auth(key))
    assert note.status_code == 202

    tools = (await _rpc(client, key, "tools/list")).json()["result"]["tools"]
    assert {t["name"] for t in tools} == {"list_bots", "ask_question", "list_conversations", "get_conversation", "list_leads"}

    listed = (await _rpc(client, key, "tools/call", {"name": "list_bots"})).json()["result"]
    assert json.loads(listed["content"][0]["text"])[0]["bot_id"] == bot

    asked = (await _rpc(client, key, "tools/call", {"name": "ask_question", "arguments": {"bot_id": bot, "question": "hours?"}})).json()["result"]
    assert json.loads(asked["content"][0]["text"])["answer"] == "We open at nine."

    bad_bot = (await _rpc(client, key, "tools/call", {"name": "list_leads", "arguments": {"bot_id": "nope"}})).json()["result"]
    assert bad_bot["isError"] is True
    assert (await _rpc(client, key, "tools/call", {"name": "nope"})).json()["error"]["code"] == -32602
    assert (await _rpc(client, key, "wat")).json()["error"]["code"] == -32601
    assert (await client.post("/mcp", content="not json", headers=_auth(key))).json()["error"]["code"] == -32700
    assert (await client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"})).status_code == 401  # no key


async def test_per_key_rate_limit(client: AsyncClient, signed_up_owner: dict, monkeypatch):
    key = (await _make_key(client, signed_up_owner))["key"]
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(public_api, "PER_KEY_LIMIT", 3)
    codes = [(await client.get("/api/v1/bots", headers=_auth(key))).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]
