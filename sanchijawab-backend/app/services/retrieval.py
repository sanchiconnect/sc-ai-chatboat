"""Hybrid retrieval: pgvector cosine similarity + Postgres full-text search
(tsvector/ts_rank_cd), fused in a single SQL query against the same
`chunks` table — no separate vector store. Same fusion approach already
proven in app/poc/ask.py's hybrid_search() (additive vector+text score),
just filtered by tenant_id/bot_id/visibility instead of `site`.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import case, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from ..config import settings
from ..models import Chunk, Document, Source
from .embeddings import embed_query
from .tracing import get_langfuse

log = logging.getLogger(__name__)


async def _rerank(query: str, candidates: list[dict], top_k: int) -> tuple[list[dict], bool]:
    """Cohere rerank of the fused candidates. Any failure falls back to the
    fused order truncated to top_k — rerank is an accuracy boost, never a
    reason for a chat request to fail."""
    try:
        import cohere

        client = cohere.AsyncClient(api_key=settings.cohere_api_key)
        resp = await client.rerank(
            model=settings.cohere_rerank_model,
            query=query,
            documents=[c["text"] for c in candidates],
            top_n=top_k,
        )
        return [candidates[r.index] for r in resp.results], True
    except Exception:
        log.warning("cohere rerank failed; using fused order", exc_info=True)
        return candidates[:top_k], False


async def hybrid_search(
    session: AsyncSession,
    *,
    tenant_id: str,
    bot_id: str,
    query: str,
    visibility: str = "customer",
    top_k: int = 8,
    rerank: bool = True,
) -> list[dict]:
    with get_langfuse().start_as_current_observation(
        as_type="retriever", name="hybrid-search", input=query,
    ) as span:
        # `rerank=False` is for the extra "same question without the company name" search: it needs no
        # paid reranker call of its own (Cohere trial keys allow only 10 calls a minute).
        rerank_enabled = bool(settings.cohere_api_key) and rerank
        # The question is embedded by Gemini (a network call, so it runs in a thread). If that is unavailable
        # the search carries on with keywords alone instead of failing the chat.
        query_vector = await asyncio.to_thread(embed_query, query)

        if query_vector is not None:
            # Passages not yet re-embedded have no vector (NULL): they simply score 0 on meaning and can
            # still be found by keywords.
            vector_score = func.coalesce(1 - Chunk.embedding_v2.cosine_distance(query_vector), 0.0).label("vector_score")
        else:
            vector_score = literal(0.0).label("vector_score")
        text_score = func.ts_rank_cd(Chunk.tsv, func.plainto_tsquery("english", query)).label("text_score")
        # Manual Q&A pairs override crawled/file content on conflict
        # (FR-K7) — a flat +1.0 outranks any possible vector+text
        # combination (each maxes out well under 1.0 on its own), so a QA
        # correction wins outright rather than just nudging the ranking;
        # that's the whole point of "override", not "slightly prefer".
        qa_boost = case((Source.type == "qa", 1.0), else_=0.0).label("qa_boost")

        stmt = (
            select(Chunk.id, Chunk.text, Document.url, vector_score, text_score)
            .join(Document, Chunk.document_id == Document.id)
            .join(Source, Document.source_id == Source.id)
            .where(Chunk.tenant_id == tenant_id, Chunk.bot_id == bot_id, Chunk.visibility == visibility)
            .order_by((vector_score + text_score + qa_boost).desc())
            .limit(settings.rerank_candidates if rerank_enabled else top_k)
        )
        rows = (await session.execute(stmt)).all()
        # The same passage often exists on several pages (menus, footers, repeated blocks). Keep the
        # best-ranked copy only, so duplicates don't use up the few slots the model gets to read.
        results = []
        seen_texts: set[str] = set()
        for chunk_id, text, url, vscore, tscore in rows:
            if text in seen_texts:
                continue
            seen_texts.add(text)
            results.append({"chunk_id": chunk_id, "text": text, "url": url, "vector_score": vscore, "text_score": tscore})
        reranked = False
        if rerank_enabled and len(results) > top_k:
            results, reranked = await _rerank(query, results, top_k)
        span.update(
            output=[
                {"chunk_id": r["chunk_id"], "url": r["url"], "vector_score": r["vector_score"], "text_score": r["text_score"]}
                for r in results
            ],
            metadata={"top_k": top_k, "results_count": len(results), "reranked": reranked},
        )
        return results
