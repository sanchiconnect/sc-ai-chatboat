"""Go-live preflight (SAN-1798): checks the things that are easy to get wrong when moving from a laptop to a real
deployment, and says in plain words what to fix. It only reads; it changes nothing.

    uv run python -m app.preflight            # checks the current .env / environment and database
    uv run python -m app.preflight --strict   # exit code 1 if anything needs fixing (for a deploy pipeline)

Run it on the real server, with the real .env, before opening the site to customers.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from urllib.parse import urlparse

from sqlalchemy import func, select

from .config import settings

OK, FIX, WARN = "ok", "FIX", "warn"


def check_settings() -> list[tuple[str, str, str]]:
    """Pure checks on configuration values (no database), so they can be unit tested."""
    r: list[tuple[str, str, str]] = []

    def add(status: str, name: str, detail: str = "") -> None:
        r.append((status, name, detail))

    secret = settings.jwt_secret
    if len(secret) < 32:
        add(FIX, "JWT_SECRET is strong", "Use a random value of at least 32 characters (python -c \"import secrets; print(secrets.token_urlsafe(48))\").")
    elif secret.lower() in {"changeme", "secret", "password"} or len(set(secret)) < 8:
        add(FIX, "JWT_SECRET is strong", "That value is guessable. Generate a random one.")
    else:
        add(OK, "JWT_SECRET is strong")

    add(OK, "PAYMENT_SECRET_KEY is set") if settings.payment_secret_key else add(FIX, "PAYMENT_SECRET_KEY is set", "Needed to store payment keys. Generate with Fernet and back it up.")
    add(OK, "Gemini key is set") if settings.cloud_api_key else add(FIX, "Gemini key is set", "CLOUD_API_KEY is empty, so the assistant cannot answer.")

    add(FIX, "Private-address crawling is off", "ALLOW_PRIVATE_URLS must be false in production.") if settings.allow_private_urls else add(OK, "Private-address crawling is off")
    add(FIX, "Rate limiting is on", "RATE_LIMIT_ENABLED must be true in production.") if not settings.rate_limit_enabled else add(OK, "Rate limiting is on")

    if not settings.superadmin_emails.strip():
        add(FIX, "A super admin email is set", "SUPERADMIN_EMAILS is empty, so nobody can open the Super Admin console.")
    else:
        add(OK, "A super admin email is set")

    for label, value in (("FRONTEND_URL", settings.frontend_url),):
        u = urlparse(value)
        if u.scheme != "https" or u.hostname in (None, "localhost", "127.0.0.1"):
            add(FIX, f"{label} is a real https address", f"Currently {value!r}. Emails link here, so it must be the public dashboard address.")
        else:
            add(OK, f"{label} is a real https address")

    if not settings.smtp_host:
        add(FIX, "Email sending is configured", "SMTP_HOST is empty: verification and invitation emails will not be sent.")
    else:
        add(OK, "Email sending is configured")
    if "sanchijawab.com" in settings.support_email and settings.smtp_host:
        add(WARN, "Support email is yours", f"SUPPORT_EMAIL is still the default {settings.support_email}. Set a mailbox you read (or change it in Super Admin > Settings).")

    if settings.payment_mode != "live":
        add(WARN, "Payments are in live mode", "PAYMENT_MODE is 'test'. Switch to 'live' once the real Razorpay/Stripe keys are entered.")
    else:
        add(OK, "Payments are in live mode")

    if settings.sentry_dsn:
        add(OK, "Error tracking (Sentry) is on")
    else:
        add(WARN, "Error tracking (Sentry) is on", "SENTRY_DSN is empty. The app works, but you will not be told about errors.")
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        add(WARN, "AI tracing (Langfuse) is on", "Optional: lets you inspect bad answers.")
    if settings.langfuse_environment == "development":
        add(WARN, "Langfuse environment is labelled", "LANGFUSE_ENVIRONMENT is 'development'; set 'production' so traces are not mixed with test traces.")

    if not settings.amazon_s3_bucket:
        add(WARN, "File storage is S3", "AMAZON_S3_BUCKET is empty: uploads are kept on the server disk (volume), which must be backed up.")
    return r


async def check_database() -> list[tuple[str, str, str]]:
    from .db import SessionLocal, engine
    from .models import Plan, User

    r: list[tuple[str, str, str]] = []
    try:
        async with SessionLocal() as s:
            await s.execute(select(1))
            plans = (await s.execute(select(Plan).where(Plan.is_active.is_(True)))).scalars().all()
            test_users = (await s.execute(
                select(func.count()).select_from(User).where(
                    (User.email.like("pytest\\_%@example.com", escape="\\")) | (User.email.like("%@example.com"))
                )
            )).scalar_one()
        r.append((OK, "Database is reachable", ""))
    except Exception as e:  # noqa: BLE001 - report any connection problem in plain words
        await engine.dispose()
        return [(FIX, "Database is reachable", f"Could not connect: {e.__class__.__name__}. Check DB_HOST/DB_PORT/DB_USER/DB_PASS.")]

    names = {p.name.lower() for p in plans}
    if any("test" in n for n in names):
        r.append((FIX, "No test plans are public", "A plan with 'test' in its name is visible to customers. Delete it in Super Admin > Billing."))
    else:
        r.append((OK, "No test plans are public", ""))
    purchasable = [p for p in plans if p.amount is not None]
    if not purchasable:
        r.append((FIX, "At least one plan can be bought", "No active plan has a price amount set, so nobody can pay. Set Growth's billable amount."))
    else:
        r.append((OK, "At least one plan can be bought", ""))
    unlimited = [p.name for p in purchasable if all(getattr(p, k) is None for k in ("max_messages_per_month", "max_pages", "max_files", "max_seats"))]
    if unlimited:
        r.append((WARN, "Paid plans have usage limits", f"No limits set on: {', '.join(unlimited)}. They are unlimited."))
    if test_users > 50:
        r.append((WARN, "Database is free of test accounts", f"{test_users} accounts at @example.com (automated tests and demos). Do not point the tests at the production database."))
    await engine.dispose()
    return r


def render(results: list[tuple[str, str, str]]) -> int:
    marks = {OK: "[ ok ]", FIX: "[FIX ]", WARN: "[warn]"}
    for status, name, detail in results:
        print(f"{marks[status]} {name}" + (f"\n         {detail}" if detail and status != OK else ""))
    fixes = sum(1 for s, *_ in results if s == FIX)
    warns = sum(1 for s, *_ in results if s == WARN)
    print(f"\n{fixes} thing(s) to fix, {warns} warning(s).")
    return fixes


async def main(strict: bool) -> int:
    results = check_settings() + await check_database()
    fixes = render(results)
    return 1 if (strict and fixes) else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--strict", action="store_true")
    sys.exit(asyncio.run(main(parser.parse_args().strict)))
