"""Gives every passage that has no Gemini vector yet its vector (chunks.embedding_v2), using the passage text
already stored. Needed once after switching the search model, and safe to run again at any time: it only touches
passages that still have no vector, so an interrupted run simply resumes.

    uv run python -m app.reembed                 # all bots
    uv run python -m app.reembed --bot eval-     # only bots whose name contains "eval-"

It uses the embedding service in batches of 50 (about 25 passages a second) and prints progress.
"""
from __future__ import annotations

import argparse
import asyncio
import time

from sqlalchemy import select, update

from .db import SessionLocal, engine
from .models import Bot, Chunk
from .services.embeddings import embed_documents

BATCH = 50


async def embed_missing(limit: int = BATCH) -> int:
    """Embeds up to `limit` passages that have no Gemini vector yet (any bot) and returns how many it did.
    The worker calls this whenever it is idle, so a database restored from an older version, a deployment
    that has just been upgraded, or passages written by an older server all heal themselves without anyone
    having to run a command."""
    async with SessionLocal() as s:
        rows = (
            await s.execute(
                select(Chunk.id, Chunk.text).where(Chunk.embedding_v2.is_(None)).order_by(Chunk.id).limit(limit)
            )
        ).all()
        if not rows:
            return 0
        vectors = await asyncio.to_thread(embed_documents, [r.text for r in rows])
        for row, vec in zip(rows, vectors):
            await s.execute(update(Chunk).where(Chunk.id == row.id).values(embedding_v2=vec))
        await s.commit()
        return len(rows)


async def run(bot_filter: str = "") -> None:
    async with SessionLocal() as s:
        bots = (await s.execute(select(Bot).order_by(Bot.name))).scalars().all()
    bots = [b for b in bots if bot_filter.lower() in b.name.lower()]
    t0 = time.perf_counter()
    total_done = 0
    for bot in bots:
        done = 0
        while True:
            async with SessionLocal() as s:
                rows = (
                    await s.execute(
                        select(Chunk.id, Chunk.text)
                        .where(Chunk.bot_id == bot.id, Chunk.embedding_v2.is_(None))
                        .order_by(Chunk.id).limit(BATCH)
                    )
                ).all()
                if not rows:
                    break
                vectors = await asyncio.to_thread(embed_documents, [r.text for r in rows])
                for row, vec in zip(rows, vectors):
                    await s.execute(update(Chunk).where(Chunk.id == row.id).values(embedding_v2=vec))
                await s.commit()
            done += len(rows)
            total_done += len(rows)
            print(f"{bot.name[:34]:34s} {done:6d} passages   ({total_done / max(time.perf_counter() - t0, 1):.0f}/s overall)", flush=True)
        if done == 0:
            print(f"{bot.name[:34]:34s} already complete")
    print(f"\nDone: {total_done} passages in {time.perf_counter() - t0:.0f}s.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bot", default="", help="only bots whose name contains this text")
    args = parser.parse_args()

    async def _main() -> None:
        try:
            await run(args.bot)
        finally:
            await engine.dispose()

    asyncio.run(_main())
