"""Phase 0 PoC, script 1 (SAN-1072): crawl a site -> chunk -> embed -> store in pgvector.

Crawls the seed URL plus a handful of internal links found on it (bounded,
same-domain only) so each site has enough real content depth for a
meaningful eval set — a single homepage is too thin for 30 genuine
questions on a small business site. Full sitemap/whole-domain crawling
with page caps and re-scans is real ingestion scope (SAN-1057), not this.

Usage:
    uv run python -m app.poc.crawl_to_pgvector https://example.com [max_pages]
"""
from __future__ import annotations

import asyncio
import re
import sys
from urllib.parse import urljoin, urlparse

from crawl4ai import AsyncWebCrawler

from .chunk import chunk_text
from .db import clear_url, get_connection, insert_chunk, site_of
from .embed import embed_texts

SKIP_EXT = re.compile(r"\.(jpg|jpeg|png|gif|svg|webp|css|js|pdf|zip|mp4|ico)(\?|$)", re.I)
SKIP_PATH = re.compile(
    r"/(cart|checkout|login|signin|signup|account|wp-admin|wp-login|privacy|terms|"
    r"cookie|sitemap)(/|\.|$|\?)",
    re.I,
)


def _normalize(url: str) -> str:
    """Strip trailing slash so /about-us/ and /about-us dedupe as one page."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def _extract_internal_links(result, base_url: str, limit: int) -> list[str]:
    site = site_of(base_url)
    base_norm = _normalize(base_url)
    raw = []
    links = getattr(result, "links", None) or {}
    for item in links.get("internal", []):
        href = item.get("href") if isinstance(item, dict) else item
        if href:
            raw.append(href)

    seen: set[str] = {base_norm}
    picked: list[str] = []
    for href in raw:
        abs_url = urljoin(base_url, href).split("#")[0]
        parsed = urlparse(abs_url)
        if parsed.scheme not in ("http", "https"):
            continue
        if site_of(abs_url) != site:
            continue
        if SKIP_EXT.search(abs_url) or SKIP_PATH.search(abs_url):
            continue
        norm = _normalize(abs_url)
        if norm in seen:
            continue
        seen.add(norm)
        picked.append(abs_url)
        if len(picked) >= limit:
            break
    return picked


async def crawl_one(crawler: AsyncWebCrawler, url: str):
    return await crawler.arun(url=url)


async def main(seed_url: str, max_pages: int = 6) -> None:
    async with AsyncWebCrawler() as crawler:
        print(f"Crawling {seed_url} ...")
        seed_result = await crawl_one(crawler, seed_url)
        pages = [(seed_url, seed_result.markdown or "")]

        extra_links = _extract_internal_links(seed_result, seed_url, max_pages - 1)
        for link in extra_links:
            print(f"Crawling {link} ...")
            try:
                r = await crawl_one(crawler, link)
                pages.append((link, r.markdown or ""))
            except Exception as e:
                print(f"  skipped ({e})")

    conn = await get_connection()
    try:
        total_chunks = 0
        for url, markdown in pages:
            words = len(markdown.split())
            chunks = chunk_text(markdown)
            if not chunks:
                print(f"  {url}: 0 words, skipping")
                continue
            embeddings = embed_texts(chunks)
            await clear_url(conn, url)
            for i, (text, vector) in enumerate(zip(chunks, embeddings)):
                await insert_chunk(conn, url, i, text, vector)
            print(f"  {url}: {words} words -> {len(chunks)} chunks")
            total_chunks += len(chunks)
        print(f"Stored {total_chunks} chunks across {len(pages)} pages for site={site_of(seed_url)}.")
    finally:
        await conn.close()


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        print("Usage: python -m app.poc.crawl_to_pgvector <url> [max_pages]")
        sys.exit(1)
    n = int(sys.argv[2]) if len(sys.argv) == 3 else 6
    asyncio.run(main(sys.argv[1], n))
