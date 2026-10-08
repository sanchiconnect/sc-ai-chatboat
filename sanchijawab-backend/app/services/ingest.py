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
import hashlib
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..timeutil import utcnow
from ..models import Chunk, Document, IngestJob, Source
from . import storage
from .chunker import chunk_text
from .crawler import crawl_site
from .plan_limits import remaining_page_allowance
from .embeddings import embed_texts
from .parser import TABULAR_EXTENSIONS, extension_of, parse_to_markdown
from .tabular import parse_tabular_to_chunks


async def store_document(
    session: AsyncSession, source: Source, doc: Document | None, url: str, pieces: list[str], stats: dict
) -> None:
    """Shared embed -> store step for website pages and files. `pieces` are
    already-chunked text (word-count windows for prose, one row per chunk
    for spreadsheets — chunking strategy is decided by the caller)."""
    joined = "\n\n".join(pieces)
    content_hash = hashlib.sha256(joined.encode("utf-8")).hexdigest()

    if doc and doc.disabled:
        # User explicitly took this page out of retrieval (SAN-1087, FR-K9)
        # — a re-crawl finding new content shouldn't silently override that.
        # Still refresh raw_text/hash so "view" shows the latest crawled
        # text and re-enabling later re-chunks from current content, not
        # stale content from before the disable.
        doc.content_hash = content_hash
        doc.raw_text = joined
        doc.last_crawled_at = utcnow()
        stats["skipped"] += 1
        return

    if doc and doc.content_hash == content_hash:
        doc.last_crawled_at = utcnow()
        stats["skipped"] += 1
        return  # unchanged since last ingest — don't re-embed

    if doc is None:
        doc = Document(source_id=source.id, tenant_id=source.tenant_id, url=url)
        session.add(doc)
        await session.flush()
    else:
        await session.execute(delete(Chunk).where(Chunk.document_id == doc.id))

    doc.content_hash = content_hash
    doc.raw_text = joined
    doc.status = "indexed"
    doc.last_crawled_at = utcnow()

    if not pieces:
        doc.status = "failed"
        doc.error = "no extractable content"
        return

    # Embedding is CPU work; in a thread, so other pages keep downloading while this one is embedded.
    vectors = await asyncio.to_thread(embed_texts, pieces)
    for text, vector in zip(pieces, vectors):
        chunk = Chunk(
            tenant_id=source.tenant_id, bot_id=source.bot_id, document_id=doc.id,
            visibility=source.visibility, text=text, embedding=vector,
        )
        session.add(chunk)
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

    async def on_progress(done: int, total: int | None) -> None:
        # Live crawl progress (SAN-1087, FR-K8) — committed as it happens
        # (not batched with the final commit below) so a poller sees real
        # numbers while the crawl is still running, not just "running".
        if job is not None:
            job.pages_done = done
            job.pages_total = total
            await session.commit()
            # cancel_requested is set by a *different* request's session
            # (the "Stop" endpoint) — expire_on_commit=False means our own
            # commit above doesn't pick up someone else's write, so refresh
            # this one column explicitly before checking it.
            await session.refresh(job, attribute_names=["cancel_requested"])
            if job.cancel_requested:
                raise CrawlCancelled(f"Stopped after {done} page(s)")

    stats = {"pages": 0, "chunks": 0, "skipped": 0}

    async def on_page(url: str, markdown: str) -> None:
        # Each page is cleaned, embedded and saved the moment it is fetched, so the assistant can already
        # answer from the first pages while the rest of the site is still being read, and a stopped or
        # crashed crawl keeps everything it had read so far.
        doc = (
            await session.execute(
                select(Document).where(Document.source_id == source.id, Document.url == url)
            )
        ).scalar_one_or_none()
        await store_document(session, source, doc, url, chunk_text(markdown), stats)
        await session.commit()

    limit = max_pages or source.max_pages
    allowance = await remaining_page_allowance(session, source)
    if allowance is not None:
        limit = min(limit, allowance)  # never crawl past what the workspace's plan allows

    await crawl_site(
        source.url,
        max_pages=limit,
        mode=source.mode,
        include_patterns=source.include_patterns,
        exclude_patterns=source.exclude_patterns,
        on_progress=on_progress,
        on_page=on_page,
    )
    await session.commit()
    return stats


async def ingest_file_source(session: AsyncSession, source: Source) -> dict:
    """source.file_key must already be uploaded to S3 (done at upload time,
    not here) — this just fetches, parses, chunks, embeds, stores."""
    stats = {"pages": 0, "chunks": 0, "skipped": 0}
    filename = source.file_key.rsplit("/", 1)[-1]
    data = storage.download_bytes(source.file_key)

    if extension_of(filename) in TABULAR_EXTENSIONS:
        pieces = parse_tabular_to_chunks(filename, data)
    else:
        pieces = chunk_text(parse_to_markdown(filename, data))

    doc = (
        await session.execute(
            select(Document).where(Document.source_id == source.id, Document.url == filename)
        )
    ).scalar_one_or_none()
    await store_document(session, source, doc, filename, pieces, stats)

    await session.commit()
    return stats
