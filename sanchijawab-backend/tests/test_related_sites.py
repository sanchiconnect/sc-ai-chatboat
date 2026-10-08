"""Related websites: found while crawling, offered to the owner, saved on the source."""
from __future__ import annotations

from httpx import AsyncClient

from app.services.crawler import _extract_internal_links, is_common_link_target


class Page:
    links = {"internal": [], "external": [
        {"href": "https://livepitch.app/"}, {"href": "https://livepitch.app/pricing"}, {"href": "https://twitter.com/acme"},
        {"href": "https://www.linkedin.com/company/acme"}, {"href": "https://partner.example/x"},
    ]}


def test_other_websites_are_counted_but_social_networks_are_not():
    seen: dict[str, int] = {}
    _extract_internal_links(Page(), "https://acme.test/", "acme.test", set(), [], [], frozenset(), seen)
    assert seen == {"livepitch.app": 2, "partner.example": 1}
    assert is_common_link_target("www.linkedin.com") and not is_common_link_target("livepitch.app")


async def test_related_sites_can_be_saved_on_a_source_and_listed(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    created = await client.post("/v1/sources", json={"bot_id": bot, "url": "https://example.com", "ownership_confirmed": True}, headers=h)
    assert created.status_code == 200
    source_id = created.json()["source_id"]

    saved = await client.patch(f"/v1/sources/{source_id}", json={"extra_domains": "https://www.Livepitch.app/x, powerpitch.ai"}, headers=h)
    assert saved.json()["extra_domains"] == "livepitch.app, powerpitch.ai"

    listed = (await client.get(f"/v1/bots/{bot}/sources", headers=h)).json()[0]
    assert listed["extra_domains"] == "livepitch.app, powerpitch.ai" and listed["related_sites"] == []
    assert listed["max_pages"] == 5000  # new sources read every page by default

    # a bare name with no dot is not a website: ignored, nothing stored
    bare = await client.patch(f"/v1/sources/{source_id}", json={"extra_domains": "localhost"}, headers=h)
    assert bare.status_code == 200 and bare.json()["extra_domains"] == ""
    # addresses that point inside a private network are refused outright (the same guard the main URL has)
    private = await client.patch(f"/v1/sources/{source_id}", json={"extra_domains": "127.0.0.1"}, headers=h)
    assert private.status_code == 422
