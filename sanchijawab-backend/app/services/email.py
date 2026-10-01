"""Plain-SMTP email delivery — works with any provider (Amazon SES's SMTP
endpoint, SendGrid, Mailgun, a Gmail app password, ...) without a vendor
SDK. If SMTP isn't configured (local dev), sending is skipped with a loud
log line instead of silently no-op'ing or raising and breaking signup.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from ..config import settings

logger = logging.getLogger("sanchijawab.email")


def _send_sync(to: str, subject: str, html_body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content("This email requires an HTML-capable client to view.")
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
        server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


async def send_email(to: str, subject: str, html_body: str) -> bool:
    if not settings.smtp_host:
        logger.warning("SMTP not configured (SMTP_HOST unset) — skipping email to %s: %s", to, subject)
        return False
    try:
        await asyncio.to_thread(_send_sync, to, subject, html_body)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


async def send_verification_email(to: str, token: str) -> bool:
    link = f"{settings.frontend_url}/verify-email?token={token}"
    html = f"""
    <p>Welcome to SanchiJawab!</p>
    <p><a href="{link}">Click here to verify your email</a>, or paste this link in your browser:</p>
    <p>{link}</p>
    """
    return await send_email(to, "Verify your SanchiJawab account", html)


async def send_invite_email(to: str, token: str, workspace_name: str) -> bool:
    link = f"{settings.frontend_url}/accept-invite?token={token}"
    html = f"""
    <p>You've been invited to join <strong>{workspace_name}</strong> on SanchiJawab.</p>
    <p><a href="{link}">Click here to set your password and accept</a>, or paste this link in your browser:</p>
    <p>{link}</p>
    """
    return await send_email(to, f"You're invited to join {workspace_name} on SanchiJawab", html)
