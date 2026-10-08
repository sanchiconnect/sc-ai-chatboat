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
from html import escape

from ..config import settings

logger = logging.getLogger("sanchijawab.email")


def _send_sync(to: str, subject: str, html_body: str, text_body: str = "") -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content(text_body or "This email requires an HTML-capable client to view.")
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
        server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


async def send_email(to: str, subject: str, html_body: str, text_body: str = "") -> bool:
    if not settings.smtp_host:
        logger.warning("SMTP not configured (SMTP_HOST unset) — skipping email to %s: %s", to, subject)
        return False
    try:
        await asyncio.to_thread(_send_sync, to, subject, html_body, text_body)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


def _layout(*, heading: str, intro_html: str, button_label: str, link: str, footnote: str) -> str:
    """One branded, table-based layout for every transactional email (tables
    + inline styles because that's what mail clients reliably render). The
    button is a real link; the raw URL is repeated below it as a fallback."""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5fb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5fb;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e1ef;border-radius:16px;">
    <tr><td style="padding:28px 32px 8px 32px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:34px;height:34px;background:#3d46c9;border-radius:9px;color:#ffffff;font-weight:700;font-size:17px;text-align:center;line-height:34px;">S</td>
        <td style="padding-left:10px;font-size:16px;font-weight:700;color:#1c1a2e;">SanchiJawab</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:12px 32px 4px 32px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
      <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1c1a2e;">{heading}</h1>
      <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#4a4760;">{intro_html}</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#3d46c9;border-radius:10px;">
        <a href="{link}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">{button_label}</a>
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:22px 32px 28px 32px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
      <p style="margin:0 0 6px 0;font-size:12.5px;color:#6b6880;">Button not working? Copy this link into your browser:</p>
      <p style="margin:0 0 18px 0;font-size:12.5px;line-height:1.5;word-break:break-all;"><a href="{link}" style="color:#2c33a0;">{link}</a></p>
      <p style="margin:0;font-size:12.5px;line-height:1.5;color:#6b6880;border-top:1px solid #e3e1ef;padding-top:14px;">{footnote}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>"""


async def send_notice_email(to: str, *, subject: str, heading: str, message: str, button_label: str, link: str) -> bool:
    """A "something happened" email in the same branded layout. `message` is
    plain text (escaped here); `link` is a full URL."""
    html = _layout(
        heading=escape(heading),
        intro_html=escape(message),
        button_label=escape(button_label),
        link=link,
        footnote="You're getting this because of your role in a SanchiJawab workspace. You can turn off email notifications on your Profile page.",
    )
    return await send_email(to, subject, html, f"{heading}\n\n{message}\n\n{button_label}: {link}")


async def send_verification_email(to: str, token: str) -> bool:
    link = f"{settings.frontend_url}/verify-email?token={token}"
    html = _layout(
        heading="Confirm your email address",
        intro_html="Welcome to SanchiJawab! Please confirm this is your email so we can finish setting up your account.",
        button_label="Verify my email",
        link=link,
        footnote="If you didn't create a SanchiJawab account, you can safely ignore this email.",
    )
    text = f"Welcome to SanchiJawab!\n\nConfirm your email by opening this link:\n{link}\n\nIf you didn't sign up, ignore this email."
    return await send_email(to, "Verify your SanchiJawab account", html, text)


async def send_invite_email(to: str, token: str, workspace_name: str) -> bool:
    link = f"{settings.frontend_url}/accept-invite?token={token}"
    safe_name = escape(workspace_name)  # workspace names are user-typed; never trust them in HTML
    html = _layout(
        heading=f"You're invited to join {safe_name}",
        intro_html=f"You've been invited to collaborate on <strong>{safe_name}</strong> on SanchiJawab. Set your password to accept the invitation and get started.",
        button_label="Accept invitation",
        link=link,
        footnote="This invitation was sent to you by a workspace admin. If you weren't expecting it, you can ignore this email.",
    )
    text = f"You've been invited to join {workspace_name} on SanchiJawab.\n\nAccept the invitation and set your password:\n{link}\n\nIf you weren't expecting this, ignore this email."
    return await send_email(to, f"You're invited to join {workspace_name} on SanchiJawab", html, text)
