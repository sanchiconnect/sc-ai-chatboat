"""Manual Q&A pairs (FR-R2's "one-click Add answer", FR-K7's override-on-
conflict, FR-R3's in-transcript correction) — turning an unanswered/
low-confidence/wrong-but-answered question into real, retrievable
knowledge, not just a database row that sits unused (the same trap
Bot/WidgetConfig were in before they got wired into the actual answer
path).
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Document, QAPair, Source
from .chunker import chunk_text
from .ingest import store_document


async def _get_or_create_qa_source(session: AsyncSession, *, bot_id: str, tenant_id: str) -> Source:
    source = (
        await session.execute(
            select(Source).where(Source.bot_id == bot_id, Source.type == "qa")
        )
    ).scalar_one_or_none()
    if source is None:
        source = Source(tenant_id=tenant_id, bot_id=bot_id, type="qa", visibility="customer")
        session.add(source)
        await session.flush()
    return source


async def create_qa_pair(session: AsyncSession, *, bot_id: str, tenant_id: str, question: str, answer: str) -> QAPair:
    """Override-on-conflict (SAN-1086/FR-K7, and what SAN-1116/FR-R3's
    in-transcript correction actually depends on): a second call for a
    question that already has a pair updates it in place — same QAPair
    row, same Document, re-embedded — rather than adding a competing
    duplicate that'd sit alongside the old (possibly wrong) answer at
    retrieval time with no precedence between them. Matched on exact
    question text (trimmed, case-insensitive); not fuzzy-matched on
    purpose — a near-miss creating a second pair is a smaller problem
    than silently merging two actually-different questions.
    """
    source = await _get_or_create_qa_source(session, bot_id=bot_id, tenant_id=tenant_id)
    text = f"Q: {question}\nA: {answer}"
    stats: dict = {"pages": 0, "chunks": 0, "skipped": 0}

    existing = (
        await session.execute(
            select(QAPair).where(QAPair.bot_id == bot_id, func.lower(QAPair.question) == question.strip().lower())
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.answer = answer
        doc = (
            await session.execute(
                select(Document).where(Document.source_id == source.id, Document.url == f"qa:{existing.id}")
            )
        ).scalar_one_or_none()
        await store_document(session, source, doc, f"qa:{existing.id}", chunk_text(text), stats)
        await session.commit()
        return existing

    qa = QAPair(tenant_id=tenant_id, bot_id=bot_id, question=question, answer=answer)
    session.add(qa)
    await session.flush()
    await store_document(session, source, None, f"qa:{qa.id}", chunk_text(text), stats)
    await session.commit()
    return qa
