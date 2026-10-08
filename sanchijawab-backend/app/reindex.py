"""Rebuilds the stored chunks and embeddings of existing website pages and files with the current
chunker (cleaned text, sized to the embedding model's window). Needed once, because everything indexed
before that fix was cut into pieces far longer than the model reads.

It works from the text already stored on each document, so it needs no internet and no re-upload.
Spreadsheets, Q&A answers and disabled pages are left alone. Dry run unless --apply.

    uv run python -m app.reindex                      # report only
    uv run python -m app.reindex --apply              # rebuild every bot
    uv run python -m app.reindex --apply --bot eval-  # only bots whose name contains "eval-"

Take a backup first:  scripts\\backup-db.ps1
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
from datetime import datetime

from sqlalchemy import delete, select

from .timeutil import utcnow
from .db import SessionLocal, engine
from .models import Bot, Chunk, Document, Source
from .services.chunker import chunk_text
from .services.embeddings import embed_texts
from .services.parser import TABULAR_EXTENSIONS, extension_of

OLD_OVERLAP_WORDS = 30  # what the old word-window chunker repeated between neighbouring pieces


def original_text(raw_text: str) -> str:
    """The old pipeline stored the pieces joined by blank lines, each repeating the last 30 words of the
    one before. Undo that to get the page text back (pieces never contained blank lines themselves)."""
    pieces = [p for p in raw_text.split("\n\n") if p.strip()]
    if not pieces:
        return ""
    words = pieces[0].split()
    for piece in pieces[1:]:
        words.extend(piece.split()[OLD_OVERLAP_WORDS:])
    return " ".join(words)


async def run(apply: bool, bot_filter: str = "") -> None:
    async with SessionLocal() as s:
        bots = (await s.execute(select(Bot).order_by(Bot.name))).scalars().all()
    bots = [b for b in bots if bot_filter.lower() in b.name.lower()]
    grand = {"docs": 0, "old": 0, "new": 0}

    for bot in bots:
        async with SessionLocal() as s:
            rows = (
                await s.execute(
                    select(Document, Source)
                    .join(Source, Document.source_id == Source.id)
                    .where(Source.bot_id == bot.id, Source.type.in_(("website", "file")), Document.status == "indexed")
                )
            ).all()
            done = old_total = new_total = 0
            for doc, source in rows:
                if doc.disabled or not doc.raw_text or extension_of(doc.url) in TABULAR_EXTENSIONS:
                    continue
                pieces = chunk_text(original_text(doc.raw_text))
                old_count = len((await s.execute(select(Chunk.id).where(Chunk.document_id == doc.id))).scalars().all())
                old_total += old_count
                new_total += len(pieces)
                done += 1
                if not apply or not pieces:
                    continue
                vectors = embed_texts(pieces)
                await s.execute(delete(Chunk).where(Chunk.document_id == doc.id))
                for text, vector in zip(pieces, vectors):
                    s.add(Chunk(tenant_id=source.tenant_id, bot_id=source.bot_id, document_id=doc.id,
                                visibility=source.visibility, text=text, embedding=vector))
                joined = "\n\n".join(pieces)
                doc.raw_text = joined
                doc.content_hash = hashlib.sha256(joined.encode("utf-8")).hexdigest()
                doc.last_crawled_at = doc.last_crawled_at or utcnow()
            if apply:
                await s.commit()
        grand["docs"] += done
        grand["old"] += old_total
        grand["new"] += new_total
        print(f"{bot.name[:34]:34s} documents={done:4d}  chunks {old_total:5d} -> {new_total:5d}{'' if apply else '  (dry run)'}", flush=True)

    print(f"\nTotal: {grand['docs']} documents, chunks {grand['old']} -> {grand['new']}."
          + ("" if apply else "  Dry run only; add --apply to rebuild."))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--bot", default="", help="only bots whose name contains this text")
    args = parser.parse_args()

    async def _main() -> None:
        try:
            await run(args.apply, args.bot)
        finally:
            await engine.dispose()

    asyncio.run(_main())
