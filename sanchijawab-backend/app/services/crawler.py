"""Site crawler — same approach as Phase 0's app/poc/crawl_to_pgvector.py
(seed page + a bounded set of same-domain internal links), unchanged,
just placed where the real ingestion pipeline can import it. Full
sitemap/whole-domain crawling with page caps and re-scans (FR-K1-K10) is
still separate, larger scope (SAN-1057), not this function.
"""
from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

from crawl4ai import AsyncWebCrawler

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


async def crawl_site(seed_url: str, max_pages: int = 6) -> list[tuple[str, str]]:
    """Returns [(url, markdown), ...] for the seed page plus a few internal links."""
    async with AsyncWebCrawler() as crawler:
        seed_result = await crawler.arun(url=seed_url)
        pages = [(seed_url, seed_result.markdown or "")]

        for link in _extract_internal_links(seed_result, seed_url, max_pages - 1):
            try:
                r = await crawler.arun(url=link)
                pages.append((link, r.markdown or ""))
            except Exception:
                continue
    return pages
