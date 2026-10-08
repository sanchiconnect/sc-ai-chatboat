"""The crawl reads several pages at once, saves each page as it goes, includes sitemap-only pages, and
never gets stuck on a single slow page. The browser is replaced by a fake so no network is used."""
from __future__ import annotations

import asyncio

import pytest

from app.services import crawler

LONG = "word " * 100


class FakeResult:
    def __init__(self, links):
        self.links = {"internal": [{"href": h} for h in links]}


class FakeBrowser:
    """Pretends a site: / links to /a and /b; /a links to /c. Tracks how many fetches overlapped."""

    SITE = {"https://t.test/": ["/a", "/b"], "https://t.test/a": ["/c"], "https://t.test/b": [], "https://t.test/c": []}

    def __init__(self):
        self.running = 0
        self.peak = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


@pytest.fixture
def fake_site(monkeypatch):
    browser = FakeBrowser()

    async def fetch(_crawler, url):
        browser.running += 1
        browser.peak = max(browser.peak, browser.running)
        await asyncio.sleep(0.05)
        browser.running -= 1
        if url == "https://t.test/slow":
            await asyncio.sleep(10)
        if url not in browser.SITE and not url.endswith(("/only-in-sitemap", "/slow")):
            return None, None
        return LONG + url, FakeResult(browser.SITE.get(url, []))

    async def robots(_seed):
        from urllib.robotparser import RobotFileParser

        parser = RobotFileParser()
        parser.parse([])
        return parser, 0.0

    async def sitemap(_seed, _max):
        return ["https://t.test/only-in-sitemap", "https://t.test/a"]

    monkeypatch.setattr(crawler, "AsyncWebCrawler", lambda: browser)
    monkeypatch.setattr(crawler, "_fetch_page", fetch)
    monkeypatch.setattr(crawler, "_load_robots", robots)
    monkeypatch.setattr(crawler, "_fetch_sitemap_urls", sitemap)
    monkeypatch.setattr(crawler.settings, "crawl_concurrency", 3)
    monkeypatch.setattr(crawler.settings, "crawl_delay_seconds", 0.0)
    return browser


async def test_pages_are_fetched_together_and_saved_as_they_arrive(fake_site):
    saved: list[str] = []

    async def on_page(url, text):
        saved.append(url)

    returned = await crawler.crawl_site("https://t.test/", max_pages=50, on_page=on_page)
    assert returned == []  # pages went to on_page, not into memory
    assert fake_site.peak > 1  # more than one page was in flight at once
    assert {"https://t.test/", "https://t.test/a", "https://t.test/b", "https://t.test/c"} <= set(saved)
    assert "https://t.test/only-in-sitemap" in saved  # a page nothing links to is still found via the sitemap
    assert len(saved) == len(set(saved))  # nothing fetched twice (/a is both linked and in the sitemap)


async def test_page_limit_is_respected(fake_site):
    saved: list[str] = []

    async def on_page(url, text):
        saved.append(url)

    await crawler.crawl_site("https://t.test/", max_pages=2, on_page=on_page)
    assert len(saved) == 2


async def test_progress_total_follows_what_is_known(fake_site):
    seen: list[tuple[int, int | None]] = []

    async def progress(done, total):
        seen.append((done, total))

    pages = await crawler.crawl_site("https://t.test/", max_pages=5000, on_progress=progress)
    assert len(pages) >= 4
    assert seen[-1][0] == len(pages)
    assert all(total is None or total <= 5000 for _, total in seen)
    assert seen[0][1] < 5000  # an honest estimate, not just "5000"


async def test_stopping_mid_crawl_stops_every_worker(fake_site):
    saved: list[str] = []

    async def on_page(url, text):
        saved.append(url)

    async def progress(done, total):
        if done >= 2:
            raise RuntimeError("Stop pressed")

    with pytest.raises(RuntimeError):
        await crawler.crawl_site("https://t.test/", max_pages=50, on_page=on_page, on_progress=progress)
    kept = len(saved)
    await asyncio.sleep(0.3)  # any worker left running would keep saving pages here
    assert len(saved) == kept and kept >= 2


async def test_one_slow_page_cannot_stall_the_crawl(fake_site, monkeypatch):
    monkeypatch.setattr(crawler, "PAGE_TIMEOUT_SECONDS", 0.2)

    async def no_plain_get(_url):
        return None

    monkeypatch.setattr(crawler, "_plain_get", no_plain_get)
    text, _ = await asyncio.wait_for(crawler._fetch_page_guarded(fake_site, "https://t.test/slow"), timeout=3)
    assert text is None
