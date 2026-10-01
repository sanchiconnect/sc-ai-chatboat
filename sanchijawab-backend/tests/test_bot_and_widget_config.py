"""Bot settings (persona/instructions/allowed_domains) and widget
customiser config — the DB-only CRUD paths, no LLM calls involved."""
from __future__ import annotations

from httpx import AsyncClient


async def test_get_bot_returns_defaults(client: AsyncClient, signed_up_owner: dict, bot: str):
    resp = await client.get(f"/v1/bots/{bot}", headers=signed_up_owner["headers"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Pytest Bot"
    assert data["persona"] == ""
    assert data["allowed_domains"] == []


async def test_update_bot_persona_and_instructions(client: AsyncClient, signed_up_owner: dict, bot: str):
    resp = await client.patch(
        f"/v1/bots/{bot}",
        json={"persona": "Friendly and concise", "instructions": "Always mention business hours."},
        headers=signed_up_owner["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["persona"] == "Friendly and concise"
    assert data["instructions"] == "Always mention business hours."


async def test_widget_config_defaults_then_update(client: AsyncClient, signed_up_owner: dict, bot: str):
    initial = await client.get(f"/v1/bots/{bot}/widget-config", headers=signed_up_owner["headers"])
    assert initial.status_code == 200
    assert initial.json()["primary_color"] == "#3D46C9"

    updated = await client.put(
        f"/v1/bots/{bot}/widget-config",
        json={"primary_color": "#FF6B00", "header": "Zynthex Support", "welcome": "Welcome!"},
        headers=signed_up_owner["headers"],
    )
    assert updated.status_code == 200
    assert updated.json()["primary_color"] == "#FF6B00"
    assert updated.json()["texts"]["header"] == "Zynthex Support"


async def test_public_config_reflects_saved_widget_settings(client: AsyncClient, signed_up_owner: dict, bot: str):
    await client.put(
        f"/v1/bots/{bot}/widget-config",
        json={"primary_color": "#059669", "header": "Custom Header", "welcome": "Hi there!"},
        headers=signed_up_owner["headers"],
    )
    public = await client.get(f"/public/w/{bot}/config")
    assert public.status_code == 200
    data = public.json()
    assert data["primary_color"] == "#059669"
    assert data["business_name"] == "Custom Header"
    assert data["welcome_message"] == "Hi there!"


async def test_bot_not_found_returns_404(client: AsyncClient, signed_up_owner: dict):
    resp = await client.get("/v1/bots/00000000-0000-0000-0000-000000000000", headers=signed_up_owner["headers"])
    assert resp.status_code == 404


async def test_unauthenticated_request_is_rejected(client: AsyncClient, bot: str):
    resp = await client.get(f"/v1/bots/{bot}")
    assert resp.status_code == 401
