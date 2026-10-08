"""Ingestion orchestrator: crawl/parse -> chunk -> embed -> store.

Chunk text, its pgvector embedding, and its generated tsvector all live
in the same `chunks` row/database — no separate vector store to keep in
sync. Function signature is the stable contract routers/worker call —
matches the migration brief's "keep function signatures the same so
rag.py and ingest.py don't need to change" intent, applied here since
these files are new.
"""
from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..timeutil import utcnow
from ..models import Chunk, Document, IngestJob, Source
from . import storage
from .chunker import chunk_text, clean_markdown
from .crawler import crawl_site, parse_extra_domains
from .plan_limits import remaining_page_allowance
from .embeddings import embed_documents
from .parser import TABULAR_EXTENSIONS, extension_of, parse_to_markdown
from .tabular import parse_tabular_to_chunks


async def store_document(
    session: AsyncSession, source: Source, doc: Document | None, url: str, pieces: list[str], stats: dict,
    raw_text: str | None = None, lock: asyncio.Lock | None = None,
) -> None:
    """Shared embed -> store step for website pages and files. `pieces` are
    already-chunked text (token-sized passages for prose, one row per chunk
    for spreadsheets — chunking strategy is decided by the caller).

    `raw_text` is the cleaned page text with its headings; it is kept on the document so the page can be
    re-cut with a better chunker later without crawling again (and shown in the dashboard's page viewer).

    `lock`: when several pages are being stored at once from one database session, every use of the session
    takes this lock; the (slow) call to the embedding service is made while it is NOT held, so pages embed
    in parallel. Nothing about the old version of a page is touched until its new vectors have arrived, so a
    failed embedding leaves the page exactly as it was (and it is retried on the next crawl).
    """
    guard = lock or contextlib.nullcontext()
    joined = "\n\n".join(pieces)
    stored_text = raw_text if raw_text is not None else joined
    content_hash = hashlib.sha256(joined.encode("utf-8")).hexdigest()

    async with guard:
        if doc and doc.disabled:
            # User explicitly took this page out of retrieval (SAN-1087, FR-K9)
            # — a re-crawl finding new content shouldn't silently override that.
            # Still refresh raw_text/hash so "view" shows the latest crawled
            # text and re-enabling later re-chunks from current content, not
            # stale content from before the disable.
            doc.content_hash = content_hash
            doc.raw_text = stored_text
            doc.chunker_version = 2
            doc.last_crawled_at = utcnow()
            stats["skipped"] += 1
            return

        if doc and doc.content_hash == content_hash:
            doc.last_crawled_at = utcnow()
            stats["skipped"] += 1
            return  # unchanged since last ingest — don't re-embed

        if not pieces:
            if doc is None:
                doc = Document(source_id=source.id, tenant_id=source.tenant_id, url=url)
                session.add(doc)
            else:
                await session.execute(delete(Chunk).where(Chunk.document_id == doc.id))
            doc.content_hash, doc.raw_text, doc.chunker_version = content_hash, stored_text, 2
            doc.status, doc.error, doc.last_crawled_at = "failed", "no extractable content", utcnow()
            return

    vectors = await asyncio.to_thread(embed_documents, pieces)  # slow network call, lock not held

    async with guard:
        if doc is None:
            doc = Document(source_id=source.id, tenant_id=source.tenant_id, url=url)
            session.add(doc)
            await session.flush()
        else:
            await session.execute(delete(Chunk).where(Chunk.document_id == doc.id))

        doc.content_hash = content_hash
        doc.raw_text = stored_text
        doc.chunker_version = 2
        doc.status = "indexed"
        doc.error = None
        doc.last_crawled_at = utcnow()

        for text, vector in zip(pieces, vectors):
            session.add(Chunk(
                tenant_id=source.tenant_id, bot_id=source.bot_id, document_id=doc.id,
                visibility=source.visibility, text=text, embedding_v2=vector,
            ))
            stats["chunks"] += 1
        stats["pages"] += 1


class CrawlCancelled(Exception):
    """Raised mid-crawl when a user hits "Stop" (SAN-1088, FR-K10) — distinct
    from a real failure so the worker can mark the job 'cancelled' instead
    of 'failed'."""


async def ingest_website_source(
    session: AsyncSession, source: Source, max_pages: int | None = None, job: IngestJob | None = None
) -> dict:
    # Was silently hardcoded to 6 pages regardless of source.max_pages (DB
    # default 5000) or settings.max_pages_per_site — every crawl, including
    # "whole domain" ones, was actually only ever indexing 6 pages. That's
    # why real sites with more than a handful of pages produced incomplete
    # answers: the rest of the content was never crawled at all.

    # Pages arrive from several workers at once but share this one database session, so every use of it
    # (progress, saving a page) takes turns on this lock.
    db_lock = asyncio.Lock()

    async def on_progress(done: int, total: int | None) -> None:
        # Live crawl progress (SAN-1087, FR-K8) — committed as it happens
        # (not batched with the final commit below) so a poller sees real
        # numbers while the crawl is still running, not just "running".
        if job is not None:
            async with db_lock:
                job.pages_done = done
                job.pages_total = total
                await session.commit()
                # cancel_requested is set by a *different* request's session
                # (the "Stop" endpoint) — expire_on_commit=False means our own
                # commit above doesn't pick up someone else's write, so refresh
                # this one column explicitly before checking it.
                await session.refresh(job, attribute_names=["cancel_requested"])
                cancelled = job.cancel_requested
            if cancelled:
                raise CrawlCancelled(f"Stopped after {done} page(s)")

    stats = {"pages": 0, "chunks": 0, "skipped": 0, "failed": 0}
    consecutive_failures = 0

    async def on_page(url: str, markdown: str) -> None:
        # Each page is cleaned, embedded and saved the moment it is fetched, so the assistant can already
        # answer from the first pages while the rest of the site is still being read, and a stopped or
        # crashed crawl keeps everything it had read so far.
        nonlocal consecutive_failures
        cleaned = clean_markdown(markdown)
        pieces = chunk_text(cleaned)
        async with db_lock:
            doc = (
                await session.execute(
                    select(Document).where(Document.source_id == source.id, Document.url == url)
                )
            ).scalar_one_or_none()
        try:
            await store_document(session, source, doc, url, pieces, stats, raw_text=cleaned, lock=db_lock)
            async with db_lock:
                await session.commit()
            consecutive_failures = 0
        except RuntimeError as e:  # the embedding service did not answer
            # One page that could not be embedded is skipped (left as it was, retried next crawl); if the
            # service is really down, stop instead of silently skipping the whole site.
            async with db_lock:
                await session.rollback()
            stats["failed"] += 1
            consecutive_failures += 1
            logging.getLogger("sanchijawab.ingest").warning("page not stored (%s): %s", url, e)
            if consecutive_failures >= 5:
                raise

    limit = max_pages or source.max_pages
    allowance = await remaining_page_allowance(session, source)
    if allowance is not None:
        limit = min(limit, allowance)  # never crawl past what the workspace's plan allows

    discovered: dict[str, int] = {}
    try:
        await crawl_site(
            source.url,
            max_pages=limit,
            mode=source.mode,
            include_patterns=source.include_patterns,
            exclude_patterns=source.exclude_patterns,
            on_progress=on_progress,
            on_page=on_page,
            extra_domains=source.extra_domains,
            discovered=discovered,
        )
    finally:
        # Other websites this one links to, offered to the owner as "also read these?" (only sites linked from
        # at least two places, so one stray link doesn't make the list).
        already = parse_extra_domains(source.extra_domains)
        related = sorted(
            ((h, n) for h, n in discovered.items() if n >= 2 and h not in already and not any(h.endswith("." + a) for a in already)),
            key=lambda kv: -kv[1],
        )[:8]
        if related:
            source.stats_json = {**(source.stats_json or {}), "related_sites": [{"host": h, "links": n} for h, n in related]}
    await session.commit()
    return stats


async def ingest_file_source(session: AsyncSession, source: Source) -> dict:
    """source.file_key must already be uploaded to S3 (done at upload time,
    not here) — this just fetches, parses, chunks, embeds, stores."""
    stats = {"pages": 0, "chunks": 0, "skipped": 0}
    filename = source.file_key.rsplit("/", 1)[-1]
    # Download and parsing are blocking work; in threads, so the worker stays responsive (Stop, other jobs).
    data = await asyncio.to_thread(storage.download_bytes, source.file_key)

    cleaned: str | None = None
    if extension_of(filename) in TABULAR_EXTENSIONS:
        pieces = await asyncio.to_thread(parse_tabular_to_chunks, filename, data)
    else:
        markdown = await asyncio.to_thread(parse_to_markdown, filename, data)
        cleaned = await asyncio.to_thread(clean_markdown, markdown)
        pieces = await asyncio.to_thread(chunk_text, cleaned)

    doc = (
        await session.execute(
            select(Document).where(Document.source_id == source.id, Document.url == filename)
        )
    ).scalar_one_or_none()
    await store_document(session, source, doc, filename, pieces, stats, raw_text=cleaned)

    await session.commit()
    return stats
