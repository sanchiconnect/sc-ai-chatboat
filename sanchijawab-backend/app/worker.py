"""Background worker — claims ingest jobs via SELECT ... FOR UPDATE SKIP
LOCKED (Postgres), so multiple worker processes never claim the same job.
"""
from __future__ import annotations

import asyncio
import sys

from datetime import datetime, timedelta

from sqlalchemy import select, text

from .timeutil import utcnow
from .db import SessionLocal

# crawl4ai logs progress with unicode characters (arrows, checkmarks) via
# plain print() — on Windows, stdout defaults to the console's codepage
# (cp1252), which can't encode them, crashing a real crawl with
# UnicodeEncodeError (seen for real: job marked "failed" on an otherwise
# healthy page). Force UTF-8 so a crawl's own logging never takes it down.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")
from .models import Bot, IngestJob, Source
from .reembed import embed_missing
from .services import privacy
from .services.ingest import CrawlCancelled, ingest_file_source, ingest_website_source

POLL_SECONDS = 2
JOB_TIMEOUT_SECONDS = 3 * 3600  # no single crawl may hold the worker longer than this
RETENTION_CHECK_SECONDS = 3600
SCHEDULE_CHECK_SECONDS = 60  # scheduled re-scans don't need second-level precision


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
    job_id = job.id
    async with SessionLocal() as session:
        job = await session.get(IngestJob, job.id)
        source = None
        try:
            source = await session.get(Source, job.source_id)
            if source.type == "file":
                stats = await ingest_file_source(session, source)
            else:
                stats = await asyncio.wait_for(ingest_website_source(session, source, job=job), timeout=JOB_TIMEOUT_SECONDS)
            job.status = "done"
            job.error = None
            source.status = "indexed"
            if source.type == "website":
                # Scheduled re-scan (SAN-1088, FR-K10) — only pushed forward
                # on a real completed run, so a stopped or failed crawl gets
                # retried on the next schedule check instead of silently
                # going quiet for a full interval.
                source.next_scan_at = utcnow() + timedelta(days=source.rescan_interval_days)
            print(f"job {job.id}: {stats}")
        except CrawlCancelled as e:
            job.status = "cancelled"
            job.error = str(e)[:1024]
            if source is not None:
                source.status = "indexed" if source.status == "indexed" else "failed"
            print(f"job {job.id} cancelled: {e}")
        except asyncio.TimeoutError:
            # The crawl ran past its overall time limit. Every page read so far was already saved (pages are
            # stored as they arrive), so the job is closed out in a fresh session rather than left "running"
            # forever and blocking every site queued behind it.
            await session.rollback()
            async with SessionLocal() as fresh:
                stuck = await fresh.get(IngestJob, job_id)
                stuck.status = "failed"
                stuck.error = (
                    f"Stopped after {JOB_TIMEOUT_SECONDS // 3600} hours. The pages read so far are saved; "
                    "re-run it to continue (unchanged pages are skipped)."
                )
                src = await fresh.get(Source, stuck.source_id)
                if src is not None:
                    src.status = "indexed"
                await fresh.commit()
            print(f"job {job_id} timed out")
            return
        except Exception as e:
            job.status = "failed"
            job.error = str(e)[:1024]
            if source is not None:
                source.status = "failed"
            print(f"job {job.id} failed: {e}")
        await session.commit()


async def enqueue_due_rescans() -> None:
    """Scheduled re-scan (SAN-1088, FR-K10) — any website source whose
    next_scan_at has passed, with no job already in flight for it, gets a
    fresh queued job. next_scan_at is pushed forward immediately (not only
    on completion) so a slow scheduler tick can't enqueue the same source
    twice before the first run finishes."""
    async with SessionLocal() as session:
        due = (
            await session.execute(
                select(Source).where(
                    Source.type == "website",
                    Source.next_scan_at.is_not(None),
                    Source.next_scan_at <= utcnow(),
                )
            )
        ).scalars().all()
        for source in due:
            in_flight = (
                await session.execute(
                    select(IngestJob.id).where(
                        IngestJob.source_id == source.id, IngestJob.status.in_(["queued", "running"])
                    )
                )
            ).first()
            if in_flight:
                continue
            session.add(IngestJob(tenant_id=source.tenant_id, source_id=source.id, status="queued"))
            source.next_scan_at = utcnow() + timedelta(days=source.rescan_interval_days)
        if due:
            await session.commit()


async def close_stuck_jobs() -> int:
    """A job still "running" long after the time limit belongs to a worker that died (power cut, kill,
    restart mid-crawl). Left alone it shows a frozen progress badge forever; close it out as failed. The
    pages it had already read were saved as they arrived, so nothing is lost."""
    cutoff = utcnow() - timedelta(seconds=JOB_TIMEOUT_SECONDS + 600)
    async with SessionLocal() as session:
        stuck = (
            await session.execute(
                select(IngestJob).where(IngestJob.status == "running", IngestJob.created_at < cutoff)
            )
        ).scalars().all()
        for job in stuck:
            job.status = "failed"
            job.error = "The worker stopped while this was running. Pages read before then are saved; re-run to continue."
        if stuck:
            await session.commit()
    return len(stuck)


async def purge_expired_conversations() -> int:
    """Automatic retention (SAN-1127) — deletes conversations older than each
    bot's own retention_days. Bots with no retention set keep everything."""
    total = 0
    async with SessionLocal() as session:
        bots = (await session.execute(select(Bot).where(Bot.retention_days.is_not(None)))).scalars().all()
        for bot in bots:
            total += await privacy.purge_older_than(session, bot_id=bot.id, days=bot.retention_days)
        if total:
            await session.commit()
    return total


async def run_forever() -> None:
    print("Worker started, polling ingest_jobs ...")
    last_schedule_check = datetime.min
    last_retention_check = datetime.min
    while True:
        if (utcnow() - last_retention_check).total_seconds() >= RETENTION_CHECK_SECONDS:
            closed = await close_stuck_jobs()
            if closed:
                print(f"closed {closed} job(s) left running by a stopped worker")
            purged = await purge_expired_conversations()
            if purged:
                print(f"retention: deleted {purged} expired conversations")
            last_retention_check = utcnow()

        if (utcnow() - last_schedule_check).total_seconds() >= SCHEDULE_CHECK_SECONDS:
            await enqueue_due_rescans()
            last_schedule_check = utcnow()

        async with SessionLocal() as session:
            job = await claim_one_job(session)
        if job is None:
            # Nothing to crawl: use the quiet moment to give any passage that still lacks its search vector
            # one (after an upgrade or a restored database), a small batch at a time.
            try:
                if await embed_missing():
                    continue  # more may be waiting; check for jobs again, then carry on
            except Exception as e:  # noqa: BLE001 — never let this stop the worker
                print(f"embedding backlog: {e}")
            await asyncio.sleep(POLL_SECONDS)
            continue
        await process_job(job)


if __name__ == "__main__":
    asyncio.run(run_forever())
