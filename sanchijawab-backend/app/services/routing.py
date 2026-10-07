"""Handoff routing: business-hours gating + team assignment (SAN-1112, FR-H3).

Both are independent, best-effort refinements of the existing handoff flow
(rag.py deciding *whether* to hand off is unchanged) — this module only
decides *what the visitor hears* and *which team a conversation is tagged
with* once that decision has already been made.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import RoutingRule, Team

_WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def is_within_business_hours(business_hours_json: dict, now: datetime | None = None) -> bool:
    """Empty/unset config means "always available" — the default before
    FR-H3 existed, and still the right default for a bot whose owner never
    opts into configuring hours."""
    if not business_hours_json:
        return True

    tz_name = business_hours_json.get("timezone") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")

    local_now = (now or datetime.now(ZoneInfo("UTC"))).astimezone(tz)
    today_key = _WEEKDAY_KEYS[local_now.weekday()]
    windows = (business_hours_json.get("hours") or {}).get(today_key) or []
    local_time = local_now.time()

    for window in windows:
        try:
            start_str, end_str = window
            start = datetime.strptime(start_str, "%H:%M").time()
            end = datetime.strptime(end_str, "%H:%M").time()
        except (ValueError, TypeError):
            continue
        if start <= local_time <= end:
            return True
    return False


async def route_team(session: AsyncSession, *, bot_id: str, page_url: str, language: str) -> str | None:
    """First-match-wins against this bot's routing rules, ascending
    priority. A rule's page_pattern/language is a wildcard when blank."""
    rules = (
        await session.execute(
            select(RoutingRule).where(RoutingRule.bot_id == bot_id).order_by(RoutingRule.priority.asc())
        )
    ).scalars().all()

    page_url_low = (page_url or "").lower()
    for rule in rules:
        if rule.page_pattern and rule.page_pattern.lower() not in page_url_low:
            continue
        if rule.language and rule.language.lower() != (language or "").lower():
            continue
        team = await session.get(Team, rule.team_id)
        if team is not None:
            return team.id
    return None
