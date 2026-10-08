"""Agent-facing notifications for handoff events (SAN-1113, FR-H4):
in-app (always recorded) + email (opt-out per member) + an optional Slack
webhook (bot-level, same generic-webhook shape as crm.py's lead push).

Browser push is deliberately not implemented here — see SAN-1113's Linear
comment for why it's out of scope this pass (VAPID key infra + a service
worker in the admin frontend, neither of which exist yet, and delivery
can't be verified live outside a real browser).
"""
from __future__ import annotations

import logging
from datetime import datetime

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..timeutil import utcnow
from ..config import settings
from ..models import Bot, Conversation, Membership, Notification, User
from .email import send_email, send_notice_email
from .urlsafety import UnsafeURLError, assert_public_url

logger = logging.getLogger("sanchijawab.notifications")
SLACK_TIMEOUT_SECONDS = 8.0


async def _post_slack(webhook_url: str, *, text: str) -> bool:
    try:
        assert_public_url(webhook_url)
        async with httpx.AsyncClient(timeout=SLACK_TIMEOUT_SECONDS) as client:
            resp = await client.post(webhook_url, json={"text": text})
        if resp.status_code >= 400:
            logger.warning("Slack webhook returned %d", resp.status_code)
            return False
        return True
    except (httpx.HTTPError, UnsafeURLError) as e:
        logger.warning("Slack webhook failed: %s", e)
        return False


async def workspace_user_ids(session: AsyncSession, workspace_id: str, roles: tuple[str, ...]) -> list[str]:
    rows = (
        await session.execute(
            select(Membership.user_id).where(Membership.workspace_id == workspace_id, Membership.role.in_(roles))
        )
    ).scalars().all()
    return list(rows)


async def notify_users(
    session: AsyncSession, *, tenant_id: str, workspace_id: str, user_ids: list[str], kind: str, message: str,
    link_path: str, heading: str, button_label: str, bot_id: str | None = None, email: bool = True,
) -> None:
    """One in-app notification per recipient (+ an email unless they opted
    out). Never raises: a failed email must not break the action that
    triggered it. Commits the notification rows itself."""
    user_ids = list(dict.fromkeys(user_ids))
    if not user_ids:
        return
    for uid in user_ids:
        session.add(Notification(
            tenant_id=tenant_id, user_id=uid, workspace_id=workspace_id, bot_id=bot_id,
            kind=kind, message=message[:512], link=link_path,
        ))
    await session.commit()
    if not email:
        return
    link = f"{settings.frontend_url}{link_path}"
    for uid in user_ids:
        try:
            membership = (
                await session.execute(
                    select(Membership).where(Membership.workspace_id == workspace_id, Membership.user_id == uid)
                )
            ).scalar_one_or_none()
            if membership is not None and not membership.email_notifications:
                continue
            user = await session.get(User, uid)
            if user is None or not user.email or not user.password_hash:
                continue  # invited-but-not-joined people have no inbox to read yet
            await send_notice_email(
                user.email, subject=heading, heading=heading, message=message, button_label=button_label, link=link,
            )
        except Exception:
            logger.warning("notification email failed for user %s", uid, exc_info=True)


async def mark_handoff_notifications_read(session: AsyncSession, conversation_id: str) -> None:
    """A conversation that's been picked up or closed is no longer waiting,
    so its "needs a human" notifications are cleared for everyone."""
    await session.execute(
        update(Notification)
        .where(Notification.conversation_id == conversation_id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )


async def notify_handoff(session: AsyncSession, *, bot: Bot, conversation: Conversation) -> None:
    """Called once, right after a conversation is marked "waiting" — never
    blocks or fails the chat response itself: email/Slack delivery failures
    are logged and swallowed, same as crm.push_lead's own webhook calls."""
    memberships = (
        await session.execute(
            select(Membership).where(
                Membership.workspace_id == bot.workspace_id,
                Membership.role.in_(("owner", "admin", "agent")),
            )
        )
    ).scalars().all()
    if not memberships:
        return

    link = f"{settings.frontend_url}/dashboard/bots/{bot.id}/inbox"
    message = f"{bot.name} needs a human — a visitor is waiting in the Inbox."

    for m in memberships:
        session.add(Notification(
            tenant_id=bot.tenant_id, user_id=m.user_id, workspace_id=bot.workspace_id,
            bot_id=bot.id, conversation_id=conversation.id, kind="handoff", message=message,
            link=f"/dashboard/bots/{bot.id}/inbox",
        ))
    await session.commit()

    for m in memberships:
        if not m.email_notifications:
            continue
        user = await session.get(User, m.user_id)
        if user is None or not user.email:
            continue
        await send_notice_email(
            user.email, subject=f"{bot.name}: a visitor needs a human", heading="A visitor needs a human",
            message=message, button_label="Open the Inbox", link=link,
        )

    if bot.slack_webhook_url:
        await _post_slack(bot.slack_webhook_url, text=f"{message} {link}")
