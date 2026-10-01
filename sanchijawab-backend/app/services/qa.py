"""Manual Q&A pairs (FR-R2's "one-click Add answer") — turning an
unanswered/low-confidence question into real, retrievable knowledge, not
just a database row that sits unused (the same trap Bot/WidgetConfig were
in before they got wired into the actual answer path).
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import QAPair, Source
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
    qa = QAPair(tenant_id=tenant_id, bot_id=bot_id, question=question, answer=answer)
    session.add(qa)
    await session.flush()

    source = await _get_or_create_qa_source(session, bot_id=bot_id, tenant_id=tenant_id)
    text = f"Q: {question}\nA: {answer}"
    stats: dict = {"pages": 0, "chunks": 0, "skipped": 0}
    await store_document(session, source, None, f"qa:{qa.id}", chunk_text(text), stats)
    await session.commit()
    return qa
