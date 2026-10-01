"""Site crawler — breadth-first over same-domain internal links, starting
from the seed page, up to max_pages. Originally only looked one level deep
(links found on the seed page itself, never recursing into the pages that
were fetched) — real sites usually need several levels to reach most of
their content, so a 6- or even 40-page cap barely mattered: it could only
ever reach as many pages as the seed page happened to link to directly.
Sitemap/whole-domain *modes* and a scheduling/re-scan UI (FR-K1-K10) are
still separate, larger scope (SAN-1057/SAN-1082) — this is just "actually
reach `max_pages` worth of the site," not the full feature.
"""
from __future__ import annotations

import asyncio
import re
import sys
from urllib.parse import urljoin, urlparse

from crawl4ai import AsyncWebCrawler

from ..config import settings

# crawl4ai logs progress with unicode characters (arrows, diamonds) via
# plain print() — on Windows, stdout defaults to the console's codepage
# (cp1252), which can't encode them, crashing an otherwise-healthy crawl
# with UnicodeEncodeError. app/worker.py already does this for the normal
# `python -m app.worker` entry point, but that only protects *that*
# process's stdout — anything else that imports crawl_site (scripts, a
# future sync-ingestion path, tests) hits the same crash unprotected. Fix
# it here, at the actual point of use, so every caller is covered.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

SKIP_EXT = re.compile(r"\.(jpg|jpeg|png|gif|svg|webp|css|js|pdf|zip|mp4|ico)(\?|$)", re.I)
SKIP_PATH = re.compile(
    r"/(cart|checkout|login|signin|signup|account|wp-admin|wp-login|privacy|terms|"
    r"cookie|sitemap)(/|\.|$|\?)",
    re.I,
)


def site_of(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def _normalize(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def _extract_internal_links(result, base_url: str, site: str, visited: set[str]) -> list[str]:
    """All same-domain, not-yet-visited links found on this one page — no
    limit here; the BFS loop in crawl_site is what enforces max_pages across
    the whole crawl, not any single page's link count.
    """
    raw = []
    links = getattr(result, "links", None) or {}
    for item in links.get("internal", []):
        href = item.get("href") if isinstance(item, dict) else item
        if href:
            raw.append(href)

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
        if norm in visited:
            continue
        visited.add(norm)  # mark as queued immediately so two pages linking to the same URL don't both queue it
        picked.append(abs_url)
    return picked


async def crawl_site(seed_url: str, max_pages: int = 6) -> list[tuple[str, str]]:
    """Breadth-first same-domain crawl starting from seed_url, up to
    max_pages — each fetched page's own links feed the frontier, so the
    crawl can actually reach max_pages worth of content instead of being
    limited to however many links happen to be on the seed page alone.
    """
    site = site_of(seed_url)
    visited: set[str] = {_normalize(seed_url)}
    frontier: list[str] = [seed_url]
    pages: list[tuple[str, str]] = []

    async with AsyncWebCrawler() as crawler:
        while frontier and len(pages) < max_pages:
            url = frontier.pop(0)
            try:
                result = await crawler.arun(url=url)
            except Exception:
                continue
            pages.append((url, result.markdown or ""))

            if len(pages) < max_pages:
                new_links = _extract_internal_links(result, url, site, visited)
                frontier.extend(new_links)

            if frontier and len(pages) < max_pages:
                await asyncio.sleep(settings.crawl_delay_seconds)

    return pages
