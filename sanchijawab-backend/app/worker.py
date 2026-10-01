"""Background worker — claims ingest jobs via SELECT ... FOR UPDATE SKIP
LOCKED (Postgres), so multiple worker processes never claim the same job.
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import text

from .db import SessionLocal

# crawl4ai logs progress with unicode characters (arrows, checkmarks) via
# plain print() — on Windows, stdout defaults to the console's codepage
# (cp1252), which can't encode them, crashing a real crawl with
# UnicodeEncodeError (seen for real: job marked "failed" on an otherwise
# healthy page). Force UTF-8 so a crawl's own logging never takes it down.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")
from .models import IngestJob, Source
from .services.ingest import ingest_file_source, ingest_website_source

POLL_SECONDS = 2


async def claim_one_job(session) -> IngestJob | None:
    result = await session.execute(
        text(
            "SELECT id FROM ingest_jobs WHERE status = 'queued' "
            "ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED"
        )
    )
    row = result.first()
    if row is None:
        return None

    job = await session.get(IngestJob, row.id)
    job.status = "running"
    await session.commit()
    return job


async def process_job(job: IngestJob) -> None:
    async with SessionLocal() as session:
        job = await session.get(IngestJob, job.id)
        source = None
        try:
            source = await session.get(Source, job.source_id)
            if source.type == "file":
                stats = await ingest_file_source(session, source)
            else:
                stats = await ingest_website_source(session, source)
            job.status = "done"
            job.error = None
            source.status = "indexed"
            print(f"job {job.id}: {stats}")
        except Exception as e:
            job.status = "failed"
            job.error = str(e)[:1024]
            if source is not None:
                source.status = "failed"
            print(f"job {job.id} failed: {e}")
        await session.commit()


async def run_forever() -> None:
    print("Worker started, polling ingest_jobs ...")
    while True:
        async with SessionLocal() as session:
            job = await claim_one_job(session)
        if job is None:
            await asyncio.sleep(POLL_SECONDS)
            continue
        await process_job(job)


if __name__ == "__main__":
    asyncio.run(run_forever())
