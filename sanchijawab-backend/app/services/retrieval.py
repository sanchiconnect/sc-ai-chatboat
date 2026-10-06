"""Hybrid retrieval: pgvector cosine similarity + Postgres full-text search
(tsvector/ts_rank_cd), fused in a single SQL query against the same
`chunks` table — no separate vector store. Same fusion approach already
proven in app/poc/ask.py's hybrid_search() (additive vector+text score),
just filtered by tenant_id/bot_id/visibility instead of `site`.
"""
from __future__ import annotations

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Chunk, Document, Source
from .embeddings import embed_one
from .tracing import get_langfuse


async def hybrid_search(
    session: AsyncSession,
    *,
    tenant_id: str,
    bot_id: str,
    query: str,
    visibility: str = "customer",
    top_k: int = 6,
) -> list[dict]:
    with get_langfuse().start_as_current_observation(
        as_type="retriever", name="hybrid-search", input=query,
    ) as span:
        query_vector = embed_one(query)

        vector_score = (1 - Chunk.embedding.cosine_distance(query_vector)).label("vector_score")
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
            .limit(top_k)
        )
        rows = (await session.execute(stmt)).all()
        results = [
            {"chunk_id": chunk_id, "text": text, "url": url, "vector_score": vscore, "text_score": tscore}
            for chunk_id, text, url, vscore, tscore in rows
        ]
        span.update(
            output=[
                {"chunk_id": r["chunk_id"], "url": r["url"], "vector_score": r["vector_score"], "text_score": r["text_score"]}
                for r in results
            ],
            metadata={"top_k": top_k, "results_count": len(results)},
        )
        return results
