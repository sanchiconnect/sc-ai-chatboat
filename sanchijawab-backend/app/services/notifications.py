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

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Bot, Conversation, Membership, Notification, User
from .email import send_email
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
        ))
    await session.commit()

    for m in memberships:
        if not m.email_notifications:
            continue
        user = await session.get(User, m.user_id)
        if user is None or not user.email:
            continue
        html = f'<p>{message}</p><p><a href="{link}">Open the Inbox</a></p>'
        await send_email(user.email, f"{bot.name}: a visitor needs a human", html)

    if bot.slack_webhook_url:
        await _post_slack(bot.slack_webhook_url, text=f"{message} {link}")
