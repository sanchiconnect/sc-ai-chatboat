"""Product catalogue and chat product cards (SAN-1800). Embeddings are real; Gemini is faked."""
from __future__ import annotations

import uuid

from httpx import AsyncClient

from app.db import SessionLocal
from app.models import Bot
from app.services import llm, products, rag

PRODUCTS = [
    {"name": "Aqua RO Water Purifier", "price": "₹12,999", "url": "https://shop.example/aqua",
     "description": "7-stage RO+UV purifier that removes dissolved salts and bacteria from tap water."},
    {"name": "Bathroom Deep Cleaning Service", "price": "₹1,499",
     "description": "Professional cleaning of tiles, taps and fittings."},
    {"name": "Leather Laptop Bag", "price": "₹3,499", "image_url": "https://shop.example/bag.jpg",
     "description": "Handmade genuine leather bag that fits a 15 inch laptop."},
]


async def _add_all(client: AsyncClient, owner: dict, bot: str) -> None:
    for p in PRODUCTS:
        r = await client.post(f"/v1/bots/{bot}/products", json=p, headers=owner["headers"])
        assert r.status_code == 200, r.text


async def test_crud_and_validation(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    created = (await client.post(f"/v1/bots/{bot}/products", json=PRODUCTS[0], headers=h)).json()
    assert created["name"] == "Aqua RO Water Purifier" and created["price"] == "₹12,999" and created["url"].startswith("https://")

    edited = await client.put(f"/v1/products/{created['product_id']}", json={**PRODUCTS[0], "price": "₹10,999"}, headers=h)
    assert edited.json()["price"] == "₹10,999"
    assert len((await client.get(f"/v1/bots/{bot}/products", headers=h)).json()) == 1

    # Links must be plain http(s): visitors click them.
    for field in ("url", "image_url"):
        bad = await client.post(f"/v1/bots/{bot}/products", json={"name": "x", field: "javascript:alert(1)"}, headers=h)
        assert bad.status_code == 422
    assert (await client.post(f"/v1/bots/{bot}/products", json={"name": "  "}, headers=h)).status_code == 422

    assert (await client.delete(f"/v1/products/{created['product_id']}", headers=h)).json() == {"deleted": True}
    assert (await client.get(f"/v1/bots/{bot}/products", headers=h)).json() == []


async def test_other_workspace_cannot_touch_products(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    pid = (await client.post(f"/v1/bots/{bot}/products", json=PRODUCTS[0], headers=h)).json()["product_id"]
    other = await client.post(
        "/v1/auth/signup",
        json={"email": f"pytest_{uuid.uuid4().hex[:10]}@example.com", "password": "Passw0rd!23", "business_name": "O"},
    )
    oh = {"Authorization": f"Bearer {other.json()['access_token']}"}
    for resp in (
        await client.get(f"/v1/bots/{bot}/products", headers=oh),
        await client.post(f"/v1/bots/{bot}/products", json=PRODUCTS[1], headers=oh),
        await client.put(f"/v1/products/{pid}", json=PRODUCTS[1], headers=oh),
        await client.delete(f"/v1/products/{pid}", headers=oh),
        await client.delete(f"/v1/bots/{bot}/products", headers=oh),
    ):
        assert resp.status_code in {403, 404}
    assert len((await client.get(f"/v1/bots/{bot}/products", headers=h)).json()) == 1


async def test_csv_import_reports_bad_rows(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    csv_text = (
        "name,price,description,image_url,url\n"
        "Red Mug,₹299,Ceramic mug,https://x.example/mug.jpg,https://x.example/mug\n"
        ",₹10,no name here,,\n"
        "Bad Link,₹5,desc,,javascript:alert(1)\n"
        "\n"
        "Blue Mug,₹349,,,\n"
    )
    r = await client.post(
        f"/v1/bots/{bot}/products/import", files={"file": ("p.csv", ("﻿" + csv_text).encode("utf-8"), "text/csv")}, headers=h
    )
    body = r.json()
    assert body["imported"] == 2 and body["problem_count"] == 2
    assert any("Row 3" in p for p in body["problems"]) and any("Row 4" in p for p in body["problems"])
    names = {p["name"] for p in (await client.get(f"/v1/bots/{bot}/products", headers=h)).json()}
    assert names == {"Red Mug", "Blue Mug"}

    no_header = await client.post(
        f"/v1/bots/{bot}/products/import", files={"file": ("p.csv", b"title,cost\nA,1\n", "text/csv")}, headers=h
    )
    assert no_header.status_code == 422 and "name" in no_header.json()["detail"]


async def test_search_finds_only_relevant_products(client: AsyncClient, signed_up_owner: dict, bot: str):
    await _add_all(client, signed_up_owner, bot)
    async with SessionLocal() as session:
        tenant = (await session.get(Bot, bot)).tenant_id

        async def names(q: str) -> list[str]:
            return [p["name"] for p in await products.search(session, tenant_id=tenant, bot_id=bot, query=q)]

        assert await names("do you sell water purifiers") == ["Aqua RO Water Purifier"]
        assert await names("I need something to carry my laptop") == ["Leather Laptop Bag"]
        assert await names("what is the weather on mars") == []
        assert await names("what are your opening hours") == []
        assert await names("   ") == []


async def test_chat_returns_cards_and_gives_the_model_the_products(client: AsyncClient, signed_up_owner: dict, bot: str, monkeypatch):
    await _add_all(client, signed_up_owner, bot)
    seen = {}

    async def fake_analyze(message, history, summary="", business=""):
        return {"standalone_query": message, "language": "en", "is_conversational": False}

    async def fake_stream(business, language, question, knowledge, *a, **k):
        seen["knowledge"] = knowledge
        yield "Yes, the Aqua RO Water Purifier is available."

    async def fake_followups(q, a):
        return []

    monkeypatch.setattr(llm, "fast_analyze", fake_analyze)
    monkeypatch.setattr(llm, "stream_answer", fake_stream)
    monkeypatch.setattr(llm, "suggest_follow_ups", fake_followups)

    async with SessionLocal() as session:
        tenant = (await session.get(Bot, bot)).tenant_id
        events = [e async for e in rag.answer_stream(session, tenant_id=tenant, bot_id=bot, business_name="Shop", message="do you sell water purifiers")]

    done = next(e for e in events if e["type"] == "done")
    assert [p["name"] for p in done["products"]] == ["Aqua RO Water Purifier"]
    assert "similarity" not in done["products"][0] and done["products"][0]["url"] == "https://shop.example/aqua"
    assert "Aqua RO Water Purifier" in seen["knowledge"] and "₹12,999" in seen["knowledge"]
    assert "Leather Laptop Bag" not in seen["knowledge"]


async def test_no_cards_when_the_bot_declines(client: AsyncClient, signed_up_owner: dict, bot: str, monkeypatch):
    await _add_all(client, signed_up_owner, bot)

    async def fake_analyze(message, history, summary="", business=""):
        return {"standalone_query": message, "language": "en", "is_conversational": False}

    async def fake_stream(*a, **k):
        yield "I don't have information about that yet."

    async def fake_followups(q, a):
        return []

    monkeypatch.setattr(llm, "fast_analyze", fake_analyze)
    monkeypatch.setattr(llm, "stream_answer", fake_stream)
    monkeypatch.setattr(llm, "suggest_follow_ups", fake_followups)
    async with SessionLocal() as session:
        tenant = (await session.get(Bot, bot)).tenant_id
        events = [e async for e in rag.answer_stream(session, tenant_id=tenant, bot_id=bot, business_name="Shop", message="do you sell water purifiers")]
    assert next(e for e in events if e["type"] == "done")["products"] == []


async def test_deleting_a_bot_removes_its_products(client: AsyncClient, signed_up_owner: dict, bot: str):
    await _add_all(client, signed_up_owner, bot)
    assert (await client.delete(f"/v1/bots/{bot}", headers=signed_up_owner["headers"])).status_code == 200
