import asyncio
from types import SimpleNamespace

import cohere

from app.config import settings
from app.services import retrieval

CANDIDATES = [{"chunk_id": str(i), "text": f"t{i}", "url": "u"} for i in range(10)]


def test_rerank_reorders_and_truncates(monkeypatch):
    class FakeClient:
        def __init__(self, api_key):
            pass

        async def rerank(self, *, model, query, documents, top_n):
            assert len(documents) == 10 and top_n == 3
            return SimpleNamespace(results=[SimpleNamespace(index=i) for i in (7, 2, 5)])

    monkeypatch.setattr(settings, "cohere_api_key", "k")
    monkeypatch.setattr(cohere, "AsyncClient", FakeClient)
    out, reranked = asyncio.run(retrieval._rerank("q", CANDIDATES, 3))
    assert reranked and [c["chunk_id"] for c in out] == ["7", "2", "5"]


def test_rerank_failure_falls_back_to_fused_order(monkeypatch):
    class BrokenClient:
        def __init__(self, api_key):
            pass

        async def rerank(self, **kw):
            raise RuntimeError("boom")

    monkeypatch.setattr(settings, "cohere_api_key", "k")
    monkeypatch.setattr(cohere, "AsyncClient", BrokenClient)
    out, reranked = asyncio.run(retrieval._rerank("q", CANDIDATES, 3))
    assert not reranked and [c["chunk_id"] for c in out] == ["0", "1", "2"]
