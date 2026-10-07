"""Loads the reviewed-by-nobody legal drafts from specs/legal-drafts/ into the
content editor as UNPUBLISHED drafts (SAN-1133), so counsel can edit them in
Super Admin -> Website content. Never overwrites a page that already exists.

    uv run python -m app.seed_legal_drafts
"""
from __future__ import annotations

import asyncio
from datetime import date
from pathlib import Path

from sqlalchemy import select

from .db import SessionLocal, engine
from .models import ContentPage

DRAFTS = {
    "privacy": ("Privacy Policy", "privacy.txt"),
    "dpa": ("Data Processing Addendum", "dpa.txt"),
}
DIR = Path(__file__).resolve().parents[2] / "specs" / "legal-drafts"


async def main() -> None:
    async with SessionLocal() as session:
        for slug, (title, filename) in DRAFTS.items():
            exists = (
                await session.execute(select(ContentPage).where(ContentPage.kind == "legal", ContentPage.slug == slug))
            ).scalar_one_or_none()
            if exists:
                print(f"{slug}: already in the editor, left untouched")
                continue
            session.add(ContentPage(
                kind="legal", slug=slug, title=title, body=(DIR / filename).read_text(encoding="utf-8"),
                published=False, display_date=date.today().isoformat(), updated_by="draft (seed script)",
            ))
            print(f"{slug}: added as an unpublished draft")
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
