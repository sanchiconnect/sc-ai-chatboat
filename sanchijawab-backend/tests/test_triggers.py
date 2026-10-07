"""Proactive widget triggers config (Phase 2)."""
from __future__ import annotations

from httpx import AsyncClient


async def test_triggers_roundtrip_to_public_config(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    assert (await client.get(f"/public/w/{bot}/config")).json()["triggers"] == []

    put = await client.put(
        f"/v1/bots/{bot}/widget-config",
        json={"triggers": [
            {"type": "time", "value": 15, "message": " Need help with pricing? ", "page_pattern": "/pricing"},
            {"type": "exit", "value": 99, "message": "Before you go - any questions?"},
        ]},
        headers=h,
    )
    assert put.status_code == 200
    saved = (await client.get(f"/public/w/{bot}/config")).json()["triggers"]
    assert [t["type"] for t in saved] == ["time", "exit"]
    assert saved[0]["message"] == "Need help with pricing?" and saved[0]["id"]
    assert saved[1]["value"] == 0  # exit intent has no number

    # Omitting triggers leaves them alone; an empty list clears them.
    await client.put(f"/v1/bots/{bot}/widget-config", json={"header": "x"}, headers=h)
    assert len((await client.get(f"/public/w/{bot}/config")).json()["triggers"]) == 2
    await client.put(f"/v1/bots/{bot}/widget-config", json={"triggers": []}, headers=h)
    assert (await client.get(f"/public/w/{bot}/config")).json()["triggers"] == []


async def test_trigger_validation(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]

    async def put(*triggers):
        return (await client.put(f"/v1/bots/{bot}/widget-config", json={"triggers": list(triggers)}, headers=h)).status_code

    assert await put({"type": "popup", "message": "x"}) == 422
    assert await put({"type": "time", "value": 0, "message": "x"}) == 422
    assert await put({"type": "scroll", "value": 3, "message": "x"}) == 422
    assert await put({"type": "time", "value": 5, "message": ""}) == 422
    assert await put({"type": "time", "value": 5, "message": "x" * 141}) == 422
    assert await put(*[{"type": "exit", "message": "hi"}] * 6) == 422
    assert await put({"type": "scroll", "value": 50, "message": "ok"}) == 200
