"""Removes throwaway test accounts from a DEVELOPMENT database.

The automated tests, load test and browser checks all sign up users at @example.com. This deletes every workspace whose
members ALL match the pattern (same code as Super Admin > delete workspace), then any matching user left with no
workspace. A workspace with even one real member, and any user outside the pattern, is never touched; neither are
workspaces with no members (such as the evaluation workspace). Dry run by default.

    uv run python -m app.cleanup_test_data            # shows what would be deleted
    uv run python -m app.cleanup_test_data --apply    # does it (take a backup first: scripts\\backup-db.ps1)

The pattern is a regular expression on the whole email (default: anything @example.com). The real super admin
(SUPERADMIN_EMAILS) is protected even if you widen the pattern. Never run this against a production database.
"""
from __future__ import annotations

import argparse
import asyncio
import collections

from sqlalchemy import text

from .config import settings
from .db import SessionLocal, engine
from .services.workspace_delete import delete_workspace

DEFAULT_PATTERN = r"@example\.com$"
# What the automated test suite creates, so the after-tests sweep never touches anything a person made by hand.
TEST_RUN_PATTERN = r"^(pytest|invitee)_[^@]*@example\.com$"

WORKSPACES_SQL = text(
    """
    select w.id, w.name
    from workspaces w
    join memberships m on m.workspace_id = w.id
    join users u on u.id = m.user_id
    group by w.id, w.name
    having bool_and(lower(u.email) ~ :rx and not (lower(u.email) = any(:protected)))
    """
)
LEFTOVER_USERS_SQL = text(
    """
    select u.id from users u
    where lower(u.email) ~ :rx and not (lower(u.email) = any(:protected))
      and not exists (select 1 from memberships m where m.user_id = u.id)
    """
)


def protected_emails() -> list[str]:
    return [e.strip().lower() for e in settings.superadmin_emails.split(",") if e.strip()]


async def run(apply: bool, pattern: str = DEFAULT_PATTERN, quiet: bool = False) -> tuple[int, int]:
    """Returns (workspaces deleted or that would be, stray users deleted or that would be)."""
    params = {"rx": pattern.lower(), "protected": protected_emails() or [""]}
    log = (lambda *a: None) if quiet else print
    async with SessionLocal() as s:
        targets = (await s.execute(WORKSPACES_SQL, params)).all()
        leftovers_now = (await s.execute(LEFTOVER_USERS_SQL, params)).scalars().all()
        users_total = (await s.execute(text("select count(*) from users"))).scalar_one()

    names = collections.Counter(name for _, name in targets)
    log(f"Test workspaces: {len(targets)}   (by name: {dict(names.most_common(6))})")
    log(f"Users in the database: {users_total}; workspace-less test users: {len(leftovers_now)}")
    if not apply:
        log("\nDry run only. Re-run with --apply to delete.")
        return len(targets), len(leftovers_now)

    for i, (wid, _name) in enumerate(targets, 1):
        async with SessionLocal() as s:
            await delete_workspace(s, wid, also_super_admin_users=True)
        if i % 100 == 0:
            log(f"  ... {i}/{len(targets)}")

    async with SessionLocal() as s:
        left = (await s.execute(LEFTOVER_USERS_SQL, params)).scalars().all()
        for uid in left:
            await s.execute(text("delete from users where id = :i"), {"i": uid})
        await s.commit()
        users_after = (await s.execute(text("select count(*) from users"))).scalar_one()
    log(f"\nDeleted {len(targets)} test workspaces and {len(left)} stray test users. Users now: {users_after}.")
    return len(targets), len(left)


async def main(apply: bool, pattern: str) -> None:
    try:
        await run(apply, pattern)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--pattern", default=DEFAULT_PATTERN, help="regular expression on the email (default: @example.com)")
    args = parser.parse_args()
    asyncio.run(main(args.apply, args.pattern))
