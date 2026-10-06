"""Trial expiry + plan usage-cap enforcement (SAN-1063/1119, FR-A4).

A workspace is "on trial" exactly when plan_id is still null and
trial_ends_at hasn't passed; once an order is paid, plan_id is set and
trial_ends_at is simply never consulted again. A plan with a null limit
field means unlimited for that dimension — same convention as Plan.amount
(null = not a real number yet / not capped).

Each check counts live usage directly rather than maintaining a running
counter, trading a bit of query cost for never drifting out of sync with
reality (no risk of a counter surviving a deleted bot/source/member and
staying wrong forever).
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Bot, Conversation, Document, Membership, Message, Plan, Source, Workspace

TRIAL_DAYS = 14


async def start_trial(workspace: Workspace) -> None:
    """Called once, at signup."""
    workspace.trial_ends_at = datetime.utcnow() + timedelta(days=TRIAL_DAYS)


async def _get_plan(session: AsyncSession, workspace: Workspace) -> Plan | None:
    return await session.get(Plan, workspace.plan_id) if workspace.plan_id else None


async def enforce_trial_or_plan(session: AsyncSession, workspace: Workspace) -> None:
    """Blocks everything plan-gated once a trial-only workspace's 14 days
    are up. A workspace with a paid plan (plan_id set) never hits this,
    regardless of trial_ends_at."""
    if workspace.plan_id is not None:
        return
    if workspace.trial_ends_at and workspace.trial_ends_at < datetime.utcnow():
        raise HTTPException(402, "Your 14-day trial has ended — upgrade to a paid plan to continue.")


async def enforce_message_limit(session: AsyncSession, workspace: Workspace) -> None:
    plan = await _get_plan(session, workspace)
    if plan is None or plan.max_messages_per_month is None:
        return
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = (
        await session.execute(
            select(func.count())
            .select_from(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .join(Bot, Conversation.bot_id == Bot.id)
            .where(Bot.workspace_id == workspace.id, Message.role == "bot", Message.created_at >= month_start)
        )
    ).scalar_one()
    if count >= plan.max_messages_per_month:
        raise HTTPException(402, f"This workspace has reached its plan's monthly message limit ({plan.max_messages_per_month}).")


async def enforce_page_limit(session: AsyncSession, workspace: Workspace) -> None:
    """Checked at source-creation time, not per-page during a crawl — a
    crawl's final page count isn't known until it finishes, so this is an
    honest approximation (blocks *starting* a new source once already at
    the cap) rather than a hard per-page gate mid-crawl."""
    plan = await _get_plan(session, workspace)
    if plan is None or plan.max_pages is None:
        return
    count = (
        await session.execute(
            select(func.count())
            .select_from(Document)
            .join(Source, Document.source_id == Source.id)
            .join(Bot, Source.bot_id == Bot.id)
            .where(Bot.workspace_id == workspace.id)
        )
    ).scalar_one()
    if count >= plan.max_pages:
        raise HTTPException(402, f"This workspace has reached its plan's page limit ({plan.max_pages}).")


async def enforce_file_limit(session: AsyncSession, workspace: Workspace) -> None:
    plan = await _get_plan(session, workspace)
    if plan is None or plan.max_files is None:
        return
    count = (
        await session.execute(
            select(func.count())
            .select_from(Source)
            .join(Bot, Source.bot_id == Bot.id)
            .where(Bot.workspace_id == workspace.id, Source.type == "file")
        )
    ).scalar_one()
    if count >= plan.max_files:
        raise HTTPException(402, f"This workspace has reached its plan's file limit ({plan.max_files}).")


async def enforce_seat_limit(session: AsyncSession, workspace: Workspace) -> None:
    plan = await _get_plan(session, workspace)
    if plan is None or plan.max_seats is None:
        return
    count = (
        await session.execute(select(func.count()).select_from(Membership).where(Membership.workspace_id == workspace.id))
    ).scalar_one()
    if count >= plan.max_seats:
        raise HTTPException(402, f"This workspace has reached its plan's seat limit ({plan.max_seats}).")


async def get_usage_summary(session: AsyncSession, workspace: Workspace) -> dict:
    """Powers the dashboard's usage-vs-cap display."""
    plan = await _get_plan(session, workspace)
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    messages_used = (
        await session.execute(
            select(func.count())
            .select_from(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .join(Bot, Conversation.bot_id == Bot.id)
            .where(Bot.workspace_id == workspace.id, Message.role == "bot", Message.created_at >= month_start)
        )
    ).scalar_one()
    pages_used = (
        await session.execute(
            select(func.count())
            .select_from(Document)
            .join(Source, Document.source_id == Source.id)
            .join(Bot, Source.bot_id == Bot.id)
            .where(Bot.workspace_id == workspace.id)
        )
    ).scalar_one()
    files_used = (
        await session.execute(
            select(func.count())
            .select_from(Source)
            .join(Bot, Source.bot_id == Bot.id)
            .where(Bot.workspace_id == workspace.id, Source.type == "file")
        )
    ).scalar_one()
    seats_used = (
        await session.execute(select(func.count()).select_from(Membership).where(Membership.workspace_id == workspace.id))
    ).scalar_one()

    return {
        "on_trial": workspace.plan_id is None,
        "trial_ends_at": workspace.trial_ends_at.isoformat() if workspace.trial_ends_at else None,
        "plan_id": workspace.plan_id,
        "plan_name": plan.name if plan else None,
        "messages": {"used": messages_used, "limit": plan.max_messages_per_month if plan else None},
        "pages": {"used": pages_used, "limit": plan.max_pages if plan else None},
        "files": {"used": files_used, "limit": plan.max_files if plan else None},
        "seats": {"used": seats_used, "limit": plan.max_seats if plan else None},
    }
