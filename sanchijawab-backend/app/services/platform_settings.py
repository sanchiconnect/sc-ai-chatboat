"""Super-admin-editable platform settings (SAN-1778). Only the keys in
SETTINGS can be set; each has a default (from config/.env or a constant),
a parser that rejects bad input, and a label for the dashboard."""
from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings as env
from ..db import SessionLocal
from ..models import PlatformSetting


@dataclass(frozen=True)
class SettingDef:
    label: str
    help: str
    default: Callable[[], str]
    parse: Callable[[str], str]  # returns the normalised value or raises ValueError


def _trial_days(v: str) -> str:
    n = int(v)
    if not 1 <= n <= 90:
        raise ValueError("Trial length must be between 1 and 90 days")
    return str(n)


def _email(v: str) -> str:
    v = v.strip()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
        raise ValueError("Enter a valid email address")
    return v


def _model_tier(v: str) -> str:
    if v not in ("economy", "balanced", "quality"):
        raise ValueError("Must be economy, balanced or quality")
    return v


SETTINGS: dict[str, SettingDef] = {
    "trial_days": SettingDef(
        "Free trial length (days)", "Applies to workspaces created after the change.", lambda: "14", _trial_days
    ),
    "support_email": SettingDef(
        "Support email", "Receives the contact form and is named in security emails.", lambda: env.support_email, _email
    ),
    "default_model_tier": SettingDef(
        "Default answer quality for new bots", "economy, balanced or quality.", lambda: "balanced", _model_tier
    ),
}


async def get_setting(key: str, session: AsyncSession | None = None) -> str:
    async def _read(s: AsyncSession) -> str:
        row = (await s.execute(select(PlatformSetting).where(PlatformSetting.key == key))).scalar_one_or_none()
        return row.value if row and row.value else SETTINGS[key].default()

    if session is not None:
        return await _read(session)
    async with SessionLocal() as s:
        return await _read(s)


async def all_settings(session: AsyncSession) -> list[dict]:
    rows = {r.key: r for r in (await session.execute(select(PlatformSetting))).scalars().all()}
    return [
        {
            "key": key, "label": d.label, "help": d.help,
            "value": rows[key].value if key in rows and rows[key].value else d.default(),
            "is_default": key not in rows or not rows[key].value,
        }
        for key, d in SETTINGS.items()
    ]


async def set_setting(session: AsyncSession, key: str, raw: str, updated_by: str) -> None:
    d = SETTINGS[key]
    value = d.parse(raw)  # ValueError -> caller turns into 422
    row = await session.get(PlatformSetting, key)
    if row is None:
        row = PlatformSetting(key=key)
        session.add(row)
    row.value = value
    row.updated_by = updated_by
