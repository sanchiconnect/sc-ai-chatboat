"""Data-subject rights and retention (SAN-1127, DPDP/GDPR): export and erase
everything stored about one visitor of a bot, and purge old conversations.
Child rows are deleted explicitly — the FKs have no ON DELETE CASCADE.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Conversation, Lead, Message, Notification


async def _delete_conversations(session: AsyncSession, conversation_ids: list[str]) -> int:
    if not conversation_ids:
        return 0
    await session.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
    await session.execute(delete(Lead).where(Lead.conversation_id.in_(conversation_ids)))
    await session.execute(delete(Notification).where(Notification.conversation_id.in_(conversation_ids)))
    await session.execute(delete(Conversation).where(Conversation.id.in_(conversation_ids)))
    return len(conversation_ids)


async def export_visitor(session: AsyncSession, *, bot_id: str, visitor_id: str) -> dict:
    convs = (
        await session.execute(
            select(Conversation)
            .where(Conversation.bot_id == bot_id, Conversation.visitor_id == visitor_id)
            .order_by(Conversation.started_at)
        )
    ).scalars().all()
    out = []
    for c in convs:
        messages = (
            await session.execute(select(Message).where(Message.conversation_id == c.id).order_by(Message.created_at))
        ).scalars().all()
        leads = (await session.execute(select(Lead).where(Lead.conversation_id == c.id))).scalars().all()
        out.append({
            "conversation_id": c.id, "started_at": c.started_at.isoformat(), "page_url": c.page_url,
            "language": c.language, "rating": c.rating,
            "messages": [
                {"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in messages
            ],
            "leads": [
                {"name": lead.name, "email": lead.email, "phone": lead.phone, "created_at": lead.created_at.isoformat()}
                for lead in leads
            ],
        })
    return {"visitor_id": visitor_id, "bot_id": bot_id, "conversations": out}


async def erase_visitor(session: AsyncSession, *, bot_id: str, visitor_id: str) -> int:
    ids = (
        await session.execute(
            select(Conversation.id).where(Conversation.bot_id == bot_id, Conversation.visitor_id == visitor_id)
        )
    ).scalars().all()
    return await _delete_conversations(session, list(ids))


async def purge_older_than(session: AsyncSession, *, bot_id: str, days: int) -> int:
    cutoff = datetime.utcnow() - timedelta(days=days)
    ids = (
        await session.execute(
            select(Conversation.id).where(Conversation.bot_id == bot_id, Conversation.started_at < cutoff)
        )
    ).scalars().all()
    return await _delete_conversations(session, list(ids))
