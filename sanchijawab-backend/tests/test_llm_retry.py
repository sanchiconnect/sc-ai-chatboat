"""LLM call retry/backoff — added after a real transient Gemini
httpx.ReadTimeout was observed to crash a live chat request mid-stream
with no retry (see knowledge.md, 2026-09-30). No real network or DB here;
purely tests the retry/backoff logic in isolation by faking the genai client.
"""
from __future__ import annotations

import httpx

from app.services import llm


class _FakeStream:
    def __init__(self, chunks, fail_after: int | None = None):
        self._chunks = chunks
        self._fail_after = fail_after

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for i, text in enumerate(self._chunks):
            if self._fail_after is not None and i == self._fail_after:
                raise httpx.ConnectError("simulated transient network failure")
            yield type("Chunk", (), {"text": text})()


class _FakeModels:
    def __init__(self, plan):
        self._plan = list(plan)  # list of callables producing a result or raising
        self.calls = 0

    async def generate_content_stream(self, **kwargs):
        self.calls += 1
        step = self._plan.pop(0)
        return step()

    async def generate_content(self, **kwargs):
        self.calls += 1
        step = self._plan.pop(0)
        return step()


class _FakeAio:
    def __init__(self, models):
        self.models = models


class _FakeClient:
    def __init__(self, models):
        self.aio = _FakeAio(models)


async def test_stream_answer_retries_before_any_chunk_yielded(monkeypatch):
    def fail():
        raise httpx.ConnectError("down")

    def succeed():
        return _FakeStream(["Hello", " world"])

    fake = _FakeModels([fail, succeed])
    monkeypatch.setattr(llm, "_client", lambda: _FakeClient(fake))

    out = [chunk async for chunk in llm.stream_answer("Biz", "en", "hi", "some knowledge")]
    assert "".join(out) == "Hello world"
    assert fake.calls == 2  # one failed attempt, one successful retry


async def test_stream_answer_stops_cleanly_after_partial_content(monkeypatch):
    def partial_then_fail():
        return _FakeStream(["Partial answer", " more"], fail_after=1)

    fake = _FakeModels([partial_then_fail])
    monkeypatch.setattr(llm, "_client", lambda: _FakeClient(fake))

    out = [chunk async for chunk in llm.stream_answer("Biz", "en", "hi", "some knowledge")]
    joined = "".join(out)
    assert joined.startswith("Partial answer")
    assert "Connection interrupted" in joined
    assert fake.calls == 1  # did NOT retry after partial content was already sent


async def test_stream_answer_gives_up_after_max_attempts(monkeypatch):
    def fail():
        raise httpx.ConnectError("down")

    fake = _FakeModels([fail, fail, fail])
    monkeypatch.setattr(llm, "_client", lambda: _FakeClient(fake))

    out = [chunk async for chunk in llm.stream_answer("Biz", "en", "hi", "some knowledge")]
    assert "trouble connecting" in "".join(out)
    assert fake.calls == llm.MAX_ATTEMPTS


async def test_fast_analyze_falls_back_after_exhausting_retries(monkeypatch):
    def fail():
        raise httpx.ConnectError("down")

    fake = _FakeModels([fail, fail, fail])
    monkeypatch.setattr(llm, "_client", lambda: _FakeClient(fake))

    result = await llm.fast_analyze("What's up?", [])
    assert result == {
        "standalone_query": "What's up?", "language": "en", "handoff_requested": False, "is_conversational": False,
        "negative_sentiment": False,
    }
    assert fake.calls == llm.MAX_ATTEMPTS
