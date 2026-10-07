"""Returning-visitor trigger type, A/B variants, and shown/clicked analytics."""
from __future__ import annotations

from httpx import AsyncClient


async def _setup(client: AsyncClient, owner: dict, bot: str) -> list[dict]:
    put = await client.put(
        f"/v1/bots/{bot}/widget-config",
        json={"triggers": [
            {"type": "visits", "value": 3, "message": "Welcome back!", "variant": "A"},
            {"type": "visits", "value": 3, "message": "Good to see you again", "variant": "B"},
        ]},
        headers=owner["headers"],
    )
    assert put.status_code == 200
    return put.json()["triggers"]


async def test_visits_and_variant_validation(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]

    async def put(t):
        return (await client.put(f"/v1/bots/{bot}/widget-config", json={"triggers": [t]}, headers=h)).status_code

    assert await put({"type": "visits", "value": 1, "message": "x"}) == 422
    assert await put({"type": "visits", "value": 51, "message": "x"}) == 422
    assert await put({"type": "time", "value": 5, "message": "x", "variant": "C"}) == 422
    assert await put({"type": "visits", "value": 2, "message": "x", "variant": "B"}) == 200


async def test_events_roll_up_per_variant(client: AsyncClient, signed_up_owner: dict, bot: str):
    triggers = await _setup(client, signed_up_owner, bot)
    a, b = triggers[0]["id"], triggers[1]["id"]

    for _ in range(4):
        await client.post(f"/public/w/{bot}/trigger-event", json={"trigger_id": a, "event": "shown", "visitor_id": "v"})
    await client.post(f"/public/w/{bot}/trigger-event", json={"trigger_id": a, "event": "clicked", "visitor_id": "v"})
    await client.post(f"/public/w/{bot}/trigger-event", json={"trigger_id": b, "event": "shown", "visitor_id": "v"})

    stats = {r["trigger_id"]: r for r in (await client.get(f"/v1/bots/{bot}/analytics/triggers", headers=signed_up_owner["headers"])).json()}
    assert (stats[a]["shown"], stats[a]["clicked"], stats[a]["click_rate"], stats[a]["variant"]) == (4, 1, 0.25, "A")
    assert (stats[b]["shown"], stats[b]["clicked"], stats[b]["click_rate"]) == (1, 0, 0.0)


async def test_event_endpoint_rejects_junk(client: AsyncClient, signed_up_owner: dict, bot: str):
    triggers = await _setup(client, signed_up_owner, bot)
    assert (await client.post(f"/public/w/{bot}/trigger-event", json={"trigger_id": triggers[0]["id"], "event": "hover"})).status_code == 422
    unknown = await client.post(f"/public/w/{bot}/trigger-event", json={"trigger_id": "nope", "event": "shown"})
    assert unknown.status_code == 200 and unknown.json() == {"recorded": False}
    assert (await client.post("/public/w/missing-bot/trigger-event", json={"trigger_id": "x", "event": "shown"})).status_code == 404


async def test_analytics_is_tenant_scoped(client: AsyncClient, signed_up_owner: dict, bot: str):
    import uuid

    other = await client.post(
        "/v1/auth/signup",
        json={"email": f"pytest_{uuid.uuid4().hex[:10]}@example.com", "password": "Passw0rd!23", "business_name": "X"},
    )
    oh = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert (await client.get(f"/v1/bots/{bot}/analytics/triggers", headers=oh)).status_code in {403, 404}
