"""Which links a crawl may follow: the seed site, its subdomains, and the related sites the owner listed."""
from __future__ import annotations

from app.services.crawler import _extract_internal_links, in_scope, parse_extra_domains


def test_parse_extra_domains_accepts_urls_and_lists():
    assert parse_extra_domains("livepitch.app, https://www.powerpitch.ai/about; sanchiapp.com") == {
        "livepitch.app", "powerpitch.ai", "sanchiapp.com",
    }
    assert parse_extra_domains("") == frozenset()
    assert parse_extra_domains("not-a-domain") == frozenset()  # no dot, ignored


def test_scope():
    extras = frozenset({"livepitch.app"})
    assert in_scope("example.com", "example.com", extras)
    assert in_scope("app.example.com", "example.com", extras)      # subdomain of the seed
    assert in_scope("livepitch.app", "example.com", extras)        # a listed related site
    assert in_scope("blog.livepitch.app", "example.com", extras)   # and its subdomains
    assert not in_scope("evil-example.com", "example.com", extras)  # lookalike is NOT a subdomain
    assert not in_scope("twitter.com", "example.com", extras)
    assert not in_scope("example.com.evil.io", "example.com", extras)


class Result:
    links = {
        "internal": [{"href": "/about"}],
        "external": [{"href": "https://app.example.com/start"}, {"href": "https://livepitch.app/"},
                     {"href": "https://twitter.com/x"}, {"href": "https://evil-example.com/"}],
    }


def test_links_to_subdomains_and_related_sites_are_followed_others_are_not():
    picked = _extract_internal_links(Result(), "https://example.com/", "example.com", set(), [], [], frozenset({"livepitch.app"}))
    assert sorted(picked) == ["https://app.example.com/start", "https://example.com/about", "https://livepitch.app/"]
    # without the related-site list, that site is not followed (the subdomain still is)
    picked2 = _extract_internal_links(Result(), "https://example.com/", "example.com", set(), [], [])
    assert "https://livepitch.app/" not in picked2 and "https://app.example.com/start" in picked2
