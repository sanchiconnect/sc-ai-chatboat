"""Site crawler supporting three modes (SAN-1082, FR-K1-K2):

- "single_page": fetch only the given URL, no link-following at all.
- "sitemap": read sitemap.xml (one level of sitemapindex nesting) for the
  URL list instead of discovering links by crawling.
- "whole_domain": breadth-first over same-domain internal links, starting
  from the seed page, up to max_pages — each fetched page's own links feed
  the frontier, so the crawl can actually reach max_pages worth of content
  instead of being limited to however many links happen to be on the seed
  page alone.

include_patterns/exclude_patterns are glob patterns (fnmatch, `*` wildcard)
matched against both the full URL and the URL path; exclude wins on overlap.

robots.txt is honored for every mode (SAN-1083, FR-K3-K4): disallowed URLs
are never fetched, and the crawl's own per-request delay is raised to match
the site's own `Crawl-delay` directive when it asks for more than our
default. When crawl4ai's real headless-browser render fails for a page
(timeout, crash, blocked resource), we fall back to a plain HTTP GET with
bare tag-stripped text rather than silently dropping the page — "some
content" beats "no content," even though the fallback can't see the page's
links (no structured DOM to pull them from), so it never expands the BFS
frontier the way a successful browser render does.

A scheduling/re-scan UI (FR-K8-K10) is still separate, larger scope
(SAN-1087/SAN-1088).
"""
from __future__ import annotations

import asyncio
import fnmatch
import re
import sys
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree

import httpx
from crawl4ai import AsyncWebCrawler
from crawl4ai.cache_context import CacheMode

from ..config import settings

CRAWLER_USER_AGENT = "SanchiJawabBot"

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


def _pattern_list(raw: str) -> list[str]:
    """include_patterns/exclude_patterns are stored as one string, newline-
    or comma-separated — split and drop blanks/whitespace."""
    if not raw:
        return []
    parts = re.split(r"[\n,]+", raw)
    return [p.strip() for p in parts if p.strip()]


def _matches_any(url: str, patterns: list[str]) -> bool:
    path = urlparse(url).path
    return any(fnmatch.fnmatch(url, pat) or fnmatch.fnmatch(path, pat) for pat in patterns)


def _allowed_by_patterns(url: str, include: list[str], exclude: list[str]) -> bool:
    if exclude and _matches_any(url, exclude):
        return False
    if include and not _matches_any(url, include):
        return False
    return True


def _extract_internal_links(
    result, base_url: str, site: str, visited: set[str], include: list[str], exclude: list[str]
) -> list[str]:
    """All same-domain, not-yet-visited, pattern-allowed links found on this
    one page — no page-count limit here; the BFS loop in crawl_site is what
    enforces max_pages across the whole crawl, not any single page's link
    count.
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
        if not _allowed_by_patterns(abs_url, include, exclude):
            continue
        norm = _normalize(abs_url)
        if norm in visited:
            continue
        visited.add(norm)  # mark as queued immediately so two pages linking to the same URL don't both queue it
        picked.append(abs_url)
    return picked


async def _load_robots(seed_url: str) -> tuple[RobotFileParser, float]:
    """Fetch and parse robots.txt for the seed's origin. Fails open (allows
    everything, uses our own default delay) on a missing file or any fetch
    error — a flaky or absent robots.txt must never block a legitimate
    crawl, only a real Disallow rule should.
    """
    parsed = urlparse(seed_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    parser = RobotFileParser()
    parser.set_url(f"{origin}/robots.txt")
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(f"{origin}/robots.txt")
        parser.parse(resp.text.splitlines() if resp.status_code < 400 else [])
    except Exception:
        parser.parse([])
    robots_delay = parser.crawl_delay(CRAWLER_USER_AGENT) or 0
    return parser, max(settings.crawl_delay_seconds, float(robots_delay))


_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.I | re.S)


def _html_to_text_fallback(html: str) -> str:
    stripped = _SCRIPT_STYLE_RE.sub(" ", html)
    return re.sub(r"\s+", " ", _TAG_RE.sub(" ", stripped)).strip()


MIN_RENDERED_TEXT_CHARS = 200

# One stuck page must never stall a whole crawl (a page that never finishes loading used to hold the
# single worker, and every site queued behind it, for as long as the browser cared to wait).
PAGE_TIMEOUT_SECONDS = 75
SITEMAP_TIMEOUT_SECONDS = 60


async def _plain_get(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers={"User-Agent": CRAWLER_USER_AGENT}) as client:
            resp = await client.get(url)
        resp.raise_for_status()
        return _html_to_text_fallback(resp.text) or None
    except Exception:
        return None


async def _fetch_page_guarded(crawler: AsyncWebCrawler, url: str) -> tuple[str | None, object | None]:
    """_fetch_page with a hard time limit; on timeout, a plain HTTP GET is the last resort."""
    try:
        return await asyncio.wait_for(_fetch_page(crawler, url), timeout=PAGE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return await _plain_get(url), None
    except Exception:
        return None, None


async def _fetch_batch(crawler: AsyncWebCrawler, urls: list[str]) -> list[tuple[str | None, object | None]]:
    """Fetches several pages at the same time (results come back in the same order as `urls`)."""
    return list(await asyncio.gather(*(_fetch_page_guarded(crawler, u) for u in urls)))


async def _fetch_page(crawler: AsyncWebCrawler, url: str) -> tuple[str | None, object | None]:
    """Returns (text, result) — `result` is crawl4ai's own result object
    (carries structured links for BFS) when the real headless-browser
    render succeeded, or None when we had to fall back to a plain HTTP
    GET. A fallback page still gets indexed, just can't extend the BFS
    frontier (no structured link data to pull from raw HTML this way).

    A render that comes back suspiciously thin (found live against
    fifa.com: 1 character on the first attempt) usually means the page
    was still client-side hydrating when crawl4ai captured the DOM, not
    that the page is actually empty — one retry with a few extra seconds
    of wait (and cache bypassed, since a cached short result would
    otherwise just be replayed) recovered real content there, so it's
    worth the extra latency only on pages that actually need it.
    """
    try:
        # BYPASS: always read the live page. crawl4ai otherwise replays its own local copy, which made
        # scheduled re-scans keep returning the text from the first crawl and never see site updates.
        result = await crawler.arun(url=url, cache_mode=CacheMode.BYPASS)
        text = result.markdown or ""
        if len(text) < MIN_RENDERED_TEXT_CHARS:
            retry = await crawler.arun(url=url, cache_mode=CacheMode.BYPASS, delay_before_return_html=3.0)
            retry_text = retry.markdown or ""
            if len(retry_text) > len(text):
                return retry_text, retry
        return text, result
    except Exception:
        pass
    return await _plain_get(url), None


_SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


async def _fetch_sitemap_urls(seed_url: str, max_pages: int) -> list[str]:
    """Resolve a sitemap (the seed itself if it looks like one, else
    `<origin>/sitemap.xml`) into a flat list of page URLs. Sitemaps are
    plain XML with no JS to render, so a plain HTTP GET is enough — no
    need for crawl4ai's headless browser here. Handles one level of
    sitemapindex nesting (an index pointing at per-section sitemaps),
    which covers the vast majority of real sites.
    """
    parsed = urlparse(seed_url)
    sitemap_url = seed_url if seed_url.rstrip("/").endswith(".xml") else f"{parsed.scheme}://{parsed.netloc}/sitemap.xml"

    async def fetch_locs(url: str) -> tuple[list[str], bool]:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            root = ElementTree.fromstring(resp.content)
        locs = [el.text.strip() for el in root.iter(f"{_SITEMAP_NS}loc") if el.text]
        is_index = root.tag == f"{_SITEMAP_NS}sitemapindex"
        return locs, is_index

    try:
        locs, is_index = await fetch_locs(sitemap_url)
    except Exception:
        return []

    if not is_index:
        return locs[:max_pages]

    urls: list[str] = []
    for nested in locs:
        if len(urls) >= max_pages:
            break
        try:
            nested_locs, _ = await fetch_locs(nested)
        except Exception:
            continue
        urls.extend(nested_locs)
    return urls[:max_pages]


class RobotsDisallowedError(Exception):
    """Raised when the seed URL itself is blocked by the site's robots.txt
    — distinct from a disallowed *discovered* link, which is just silently
    skipped (the user picked the seed on purpose; a silent zero-page result
    would look like a bug rather than a policy decision)."""


async def crawl_site(
    seed_url: str,
    max_pages: int = 6,
    mode: str = "whole_domain",
    include_patterns: str = "",
    exclude_patterns: str = "",
    on_progress=None,
    on_page=None,
) -> list[tuple[str, str]]:
    """Crawl a site in one of three modes — see module docstring. Returns
    a list of (url, markdown) pairs, up to max_pages long.

    `on_progress`, when given, is awaited as `on_progress(pages_done, pages_total)` after every page so a
    caller can show live progress (SAN-1087, FR-K8). `pages_total` is the best current estimate (pages
    done + pages still waiting to be fetched), capped at max_pages.

    `on_page`, when given, is awaited as `on_page(url, markdown)` the moment a page has been fetched, so
    the caller can store it straight away. That keeps memory flat on big sites, makes a stopped or
    crashed crawl keep what it already read, and lets the assistant start answering from the first pages
    before the last one is done. In that case the returned list is empty.

    Speed: a pool of settings.crawl_concurrency workers each take the next waiting page the moment they
    finish one (no waiting for the slowest page of a batch). If the site's robots.txt asks for a crawl
    delay longer than ours, a single worker is used to respect it.
    """
    include = _pattern_list(include_patterns)
    exclude = _pattern_list(exclude_patterns)
    robots, delay = await _load_robots(seed_url)
    # A site that asks us to slow down gets one request at a time, never a burst.
    workers = 1 if delay > settings.crawl_delay_seconds else max(1, settings.crawl_concurrency)

    if not robots.can_fetch(CRAWLER_USER_AGENT, seed_url):
        raise RobotsDisallowedError(f"robots.txt disallows crawling {seed_url}")

    pages: list[tuple[str, str]] = []
    # Saving a page touches one database session, so saves take turns; fetching does not wait for them.
    save_lock = asyncio.Lock()

    async def keep(url: str, text: str) -> None:
        if on_page is not None:
            await on_page(url, text)
        else:
            pages.append((url, text))

    frontier: list[str] = []  # pages found by following links (the pages the site itself points visitors to)
    backlog: list[str] = []   # pages only the sitemap knows about
    follow_links = mode == "whole_domain"
    site = site_of(seed_url)
    visited: set[str] = {_normalize(seed_url)}

    if mode == "single_page":
        frontier, max_pages = [seed_url], 1
    elif mode == "sitemap":
        urls = await _fetch_sitemap_urls(seed_url, max_pages)
        urls = [u for u in urls if _allowed_by_patterns(u, include, exclude) and robots.can_fetch(CRAWLER_USER_AGENT, u)]
        frontier = (urls or [seed_url])[:max_pages]  # sitemap missing/empty: at least the seed page
    else:
        # "whole_domain": breadth-first from the seed; the sitemap then fills in pages nothing links to, so
        # "all pages" really means all pages.
        frontier = [seed_url]
        try:
            sitemap_urls = await asyncio.wait_for(_fetch_sitemap_urls(seed_url, max_pages), timeout=SITEMAP_TIMEOUT_SECONDS)
        except Exception:
            sitemap_urls = []
        for u in sitemap_urls:
            norm = _normalize(u)
            if (
                norm in visited or site_of(u) != site or SKIP_EXT.search(u) or SKIP_PATH.search(u)
                or not _allowed_by_patterns(u, include, exclude)
            ):
                continue
            visited.add(norm)
            backlog.append(u)

    state = {"done": 0, "in_flight": 0}

    def estimate() -> int:
        return max(1, min(max_pages, state["done"] + state["in_flight"] + len(frontier) + len(backlog)))

    async def report() -> None:
        if on_progress is not None:
            await on_progress(state["done"], estimate())

    def next_url() -> str | None:
        while frontier or backlog:
            candidate = frontier.pop(0) if frontier else backlog.pop(0)
            if robots.can_fetch(CRAWLER_USER_AGENT, candidate):
                return candidate
        return None

    async def worker(crawler: AsyncWebCrawler) -> None:
        while state["done"] < max_pages:
            if state["done"] + state["in_flight"] >= max_pages:
                # Enough pages are already on their way; only a failed fetch can free a slot.
                if state["in_flight"] == 0:
                    return
                await asyncio.sleep(0.05)
                continue
            url = next_url()
            if url is None:
                if state["in_flight"] == 0:
                    return  # nothing waiting and nothing running that could add more
                await asyncio.sleep(0.05)
                continue

            state["in_flight"] += 1
            try:
                text, result = await _fetch_page_guarded(crawler, url)
            finally:
                state["in_flight"] -= 1
            if text is None or state["done"] >= max_pages:
                continue
            async with save_lock:
                await keep(url, text)
                state["done"] += 1
                if follow_links and result is not None and state["done"] < max_pages:
                    frontier.extend(_extract_internal_links(result, url, site, visited, include, exclude))
                await report()
            await asyncio.sleep(delay)

    await report()
    async with AsyncWebCrawler() as crawler:
        tasks = [asyncio.create_task(worker(crawler)) for _ in range(workers)]
        try:
            await asyncio.gather(*tasks)
        except BaseException:
            # One worker failed or the crawl was stopped: stop the others too instead of leaving them running.
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
    return pages
