"""One-off: prove the Phase 1 stack (PostgreSQL+pgvector + Gemini) actually
works end to end — create workspace/bot/source, ingest a real site,
ask a real question, confirm a grounded streamed answer with sources.

Not a pytest test (needs a real network crawl + real Gemini call) — a
manual verification script, same role app/poc/ scripts played for Phase 0.

Usage: uv run python -m app.verify_stack
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from .db import SessionLocal, engine
from .models import Bot, Source, Workspace
from .services.ingest import ingest_website_source
from .services.rag import answer_stream

TENANT_ID = "verify-tenant"
SEED_URL = "https://sanchiconnect.com/"


async def main() -> None:
    async with SessionLocal() as session:
        ws = (
            await session.execute(select(Workspace).where(Workspace.tenant_id == TENANT_ID))
        ).scalar_one_or_none()
        if ws is None:
            ws = Workspace(tenant_id=TENANT_ID, name="Verify Workspace")
            session.add(ws)
            await session.flush()

        bot = (
            await session.execute(select(Bot).where(Bot.workspace_id == ws.id))
        ).scalar_one_or_none()
        if bot is None:
            bot = Bot(tenant_id=TENANT_ID, workspace_id=ws.id, name="Verify Bot")
            session.add(bot)
            await session.flush()

        source = (
            await session.execute(select(Source).where(Source.bot_id == bot.id, Source.url == SEED_URL))
        ).scalar_one_or_none()
        if source is None:
            source = Source(tenant_id=TENANT_ID, bot_id=bot.id, type="website", url=SEED_URL)
            session.add(source)
            await session.flush()

        await session.commit()

        print(f"Ingesting {SEED_URL} ...")
        stats = await ingest_website_source(session, source)
        print(f"Ingest stats: {stats}")

        question = "What does SanchiConnect do?"
        print(f"\nQ: {question}")
        print("A: ", end="", flush=True)
        sources = []
        async for event in answer_stream(
            session, tenant_id=TENANT_ID, bot_id=bot.id, business_name="SanchiConnect", message=question,
        ):
            if event["type"] == "delta":
                print(event["text"], end="", flush=True)
            elif event["type"] == "done":
                sources = event["sources"]
                print(f"\n\nno_answer={event['no_answer']}  sources={sources}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
