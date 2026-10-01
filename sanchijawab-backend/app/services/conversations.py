"""Conversation/message persistence shared by the public widget chat
endpoint and the dashboard's Inbox (human handoff, FR-H1)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Conversation, Message


async def get_or_create_conversation(
    session: AsyncSession,
    *,
    conversation_id: str | None,
    tenant_id: str,
    bot_id: str,
    visitor_id: str | None,
    page_url: str,
    language: str,
) -> Conversation:
    if conversation_id:
        conv = await session.get(Conversation, conversation_id)
        if conv is not None and conv.bot_id == bot_id:
            return conv

    conv = Conversation(
        tenant_id=tenant_id,
        bot_id=bot_id,
        visitor_id=visitor_id or "unknown",
        page_url=page_url or "",
        language=language or "en",
    )
    session.add(conv)
    await session.flush()
    return conv


async def add_message(
    session: AsyncSession,
    *,
    conversation_id: str,
    tenant_id: str,
    role: str,
    content: str,
    sources: list | None = None,
    confidence: float | None = None,
) -> Message:
    msg = Message(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        role=role,
        content=content,
        sources_json=sources or [],
        confidence=confidence,
    )
    session.add(msg)
    await session.flush()
    return msg


async def list_messages(session: AsyncSession, *, conversation_id: str, after_id: str | None = None) -> list[Message]:
    stmt = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
    if after_id:
        after_msg = await session.get(Message, after_id)
        if after_msg is not None:
            stmt = stmt.where(Message.created_at > after_msg.created_at)
    return list((await session.execute(stmt)).scalars().all())
