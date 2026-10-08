"""Knowledge first, the web second; plus the retrieval fix for questions that include the business name."""
from __future__ import annotations

from app import models
from app.db import SessionLocal
from app.services import llm, rag
from app.services.rag import GENERIC_DECLINE, _brand_words, _is_decline, _merge_chunks, _without_brand

import pytest


def test_decline_detection_catches_common_phrasings():
    assert _is_decline('I don\'t have any information about an "Associate Director Tech" at SanchiConnect.')
    assert _is_decline("I couldn't find that in our pages.")
    assert _is_decline("Sorry, I'm unable to find details on that.")
    assert not _is_decline("Our office is open Monday to Saturday, 9am to 6pm.")


def test_brand_name_is_dropped_from_the_search_but_the_rest_stays():
    brand = _brand_words("SanchiConnect", "eval-sanchiconnect.com")
    assert brand == {"sanchiconnect"}
    assert _without_brand("Associate Director Tech sanchiconnect", brand) == "Associate Director Tech"
    assert _without_brand("Who is the CEO?", brand) == "Who is the CEO?"


def test_merge_interleaves_without_repeats():
    a = [{"chunk_id": "1"}, {"chunk_id": "2"}, {"chunk_id": "3"}]
    b = [{"chunk_id": "9"}, {"chunk_id": "2"}]
    assert [c["chunk_id"] for c in _merge_chunks(a, b)] == ["9", "1", "2", "3"]


async def _make_bot(session, *, web_fallback: bool):
    ws = models.Workspace(tenant_id="t-web", name="WebFallbackTest")
    session.add(ws)
    await session.flush()
    bot = models.Bot(tenant_id="t-web", workspace_id=ws.id, name="Acme", web_fallback=web_fallback)
    session.add(bot)
    await session.flush()
    return bot


async def _run(session, bot, message="who runs acme?"):
    return [e async for e in rag.answer_stream(session, tenant_id=bot.tenant_id, bot_id=bot.id, business_name="Acme", message=message)]


async def test_no_knowledge_goes_online_when_allowed(monkeypatch):
    async def fake_web(business, language, question, persona="", instructions="", summary="", model_tier="balanced", sources_out=None):
        sources_out.append({"url": "https://example.org/acme", "title": "Acme"})
        yield "Acme is run by Jane Doe."

    monkeypatch.setattr(llm, "stream_web_answer", fake_web)
    async with SessionLocal() as session:
        bot = await _make_bot(session, web_fallback=True)
        events = await _run(session, bot)
        text = "".join(e.get("text", "") for e in events if e["type"] == "delta")
        done = next(e for e in events if e["type"] == "done")
        assert "found online" in text and "Jane Doe" in text
        assert done["web"] is True and done["no_answer"] is False
        assert done["sources"] == [{"url": "https://example.org/acme", "chunk_id": ""}]
        await session.rollback()


async def test_no_knowledge_stays_put_when_online_is_off(monkeypatch):
    async def boom(*a, **k):  # must never be called
        raise AssertionError("web search used although the bot has it switched off")
        yield

    monkeypatch.setattr(llm, "stream_web_answer", boom)
    async with SessionLocal() as session:
        bot = await _make_bot(session, web_fallback=False)
        events = await _run(session, bot)
        text = "".join(e.get("text", "") for e in events if e["type"] == "delta")
        assert text == GENERIC_DECLINE
        assert next(e for e in events if e["type"] == "done")["no_answer"] is True
        await session.rollback()


async def test_web_with_nothing_useful_falls_back_to_the_plain_decline(monkeypatch):
    async def empty_web(*a, **k):
        return
        yield

    monkeypatch.setattr(llm, "stream_web_answer", empty_web)
    async with SessionLocal() as session:
        bot = await _make_bot(session, web_fallback=True)
        events = await _run(session, bot)
        assert "".join(e.get("text", "") for e in events if e["type"] == "delta") == GENERIC_DECLINE
        await session.rollback()
