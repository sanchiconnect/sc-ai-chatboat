"""FR-I2: per-bot domain allow-list, enforced via Origin/Referer headers on
the public widget endpoints."""
from __future__ import annotations

from httpx import AsyncClient


async def test_unrestricted_bot_accepts_any_origin(client: AsyncClient, bot: str):
    resp = await client.get(f"/public/w/{bot}/config", headers={"Origin": "https://anything.example"})
    assert resp.status_code == 200


async def test_restricted_bot_rejects_disallowed_origin(client: AsyncClient, signed_up_owner: dict, bot: str):
    patch = await client.patch(
        f"/v1/bots/{bot}", json={"allowed_domains": ["allowed.example"]}, headers=signed_up_owner["headers"]
    )
    assert patch.status_code == 200
    assert patch.json()["allowed_domains"] == ["allowed.example"]

    denied = await client.get(f"/public/w/{bot}/config", headers={"Origin": "https://evil.example"})
    assert denied.status_code == 403

    allowed = await client.get(f"/public/w/{bot}/config", headers={"Origin": "https://allowed.example"})
    assert allowed.status_code == 200

    subdomain = await client.get(f"/public/w/{bot}/config", headers={"Origin": "https://widget.allowed.example"})
    assert subdomain.status_code == 200


async def test_restricted_bot_rejects_missing_origin_header(client: AsyncClient, signed_up_owner: dict, bot: str):
    await client.patch(
        f"/v1/bots/{bot}", json={"allowed_domains": ["allowed.example"]}, headers=signed_up_owner["headers"]
    )
    resp = await client.get(f"/public/w/{bot}/config")  # no Origin, no Referer
    assert resp.status_code == 403


async def test_chat_endpoint_also_enforces_allowlist(client: AsyncClient, signed_up_owner: dict, bot: str):
    await client.patch(
        f"/v1/bots/{bot}", json={"allowed_domains": ["allowed.example"]}, headers=signed_up_owner["headers"]
    )
    resp = await client.post(
        f"/public/w/{bot}/chat",
        json={"message": "hi"},
        headers={"Origin": "https://evil.example"},
    )
    assert resp.status_code == 403
