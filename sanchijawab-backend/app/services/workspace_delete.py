"""Deleting a whole workspace and everything in it. Shared by the Super Admin "delete workspace" action and the
test-data cleanup tool so there is exactly one cascade to keep correct.

There is no ON DELETE CASCADE on these foreign keys, so children go first, deepest first (Chunk before Document,
routing rules before teams, ...). Users whose only workspace this was are deleted too, except super admins.
"""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    ActionLog, ApiKey, Bot, BotAction, Chunk, Conversation, Document, IngestJob, Lead, Membership, Message, Notification, Order, Product,
    PendingAction, QAPair, RoutingRule, Source, Team, ToolConnection, User, WidgetConfig, Workspace,
)


async def delete_workspace(session: AsyncSession, workspace_id: str, *, also_super_admin_users: bool = False) -> bool:
    """Returns False if the workspace doesn't exist. Commits on success."""
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:
        return False

    bot_ids = (await session.execute(select(Bot.id).where(Bot.workspace_id == workspace_id))).scalars().all()
    source_ids = (await session.execute(select(Source.id).where(Source.bot_id.in_(bot_ids)))).scalars().all()
    conversation_ids = (
        await session.execute(select(Conversation.id).where(Conversation.bot_id.in_(bot_ids)))
    ).scalars().all()
    member_user_ids = (
        await session.execute(select(Membership.user_id).where(Membership.workspace_id == workspace_id))
    ).scalars().all()

    if conversation_ids:
        await session.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
        await session.execute(delete(Lead).where(Lead.conversation_id.in_(conversation_ids)))
        await session.execute(delete(Notification).where(Notification.conversation_id.in_(conversation_ids)))
    if bot_ids:
        await session.execute(delete(Chunk).where(Chunk.bot_id.in_(bot_ids)))
    if source_ids:
        await session.execute(delete(IngestJob).where(IngestJob.source_id.in_(source_ids)))
        await session.execute(delete(Document).where(Document.source_id.in_(source_ids)))
    if bot_ids:
        await session.execute(delete(Source).where(Source.bot_id.in_(bot_ids)))
        await session.execute(delete(Conversation).where(Conversation.bot_id.in_(bot_ids)))
        await session.execute(delete(QAPair).where(QAPair.bot_id.in_(bot_ids)))
        await session.execute(delete(WidgetConfig).where(WidgetConfig.bot_id.in_(bot_ids)))
        await session.execute(delete(Product).where(Product.bot_id.in_(bot_ids)))
        await session.execute(delete(PendingAction).where(PendingAction.bot_id.in_(bot_ids)))
        await session.execute(delete(ActionLog).where(ActionLog.bot_id.in_(bot_ids)))
        await session.execute(delete(BotAction).where(BotAction.bot_id.in_(bot_ids)))
        await session.execute(delete(ToolConnection).where(ToolConnection.bot_id.in_(bot_ids)))
        # routing_rules has a FK to teams, so it goes first.
        await session.execute(delete(RoutingRule).where(RoutingRule.bot_id.in_(bot_ids)))
        await session.execute(delete(Team).where(Team.bot_id.in_(bot_ids)))
    await session.execute(delete(Bot).where(Bot.workspace_id == workspace_id))
    await session.execute(delete(Order).where(Order.workspace_id == workspace_id))
    await session.execute(delete(ApiKey).where(ApiKey.workspace_id == workspace_id))
    await session.execute(delete(Membership).where(Membership.workspace_id == workspace_id))
    await session.delete(workspace)

    if member_user_ids:
        remaining = select(Membership.user_id).distinct()
        stmt = delete(User).where(User.id.in_(member_user_ids), User.id.notin_(remaining))
        if not also_super_admin_users:
            stmt = stmt.where(User.is_super_admin.is_(False))
        await session.execute(stmt)

    await session.commit()
    return True
