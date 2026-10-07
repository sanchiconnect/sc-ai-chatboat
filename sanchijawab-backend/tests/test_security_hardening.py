"""SAN-1126 hardening: SSRF guard, contact-form HTML escaping, JWT secret."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import settings
from app.services import auth
from app.services.urlsafety import UnsafeURLError, assert_public_url


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8000/admin",
        "http://127.0.0.1/",
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata service
        "http://10.0.0.5/internal",
        "http://192.168.1.1/",
        "http://[::1]/",
        "file:///etc/passwd",
        "ftp://example.com/x",
    ],
)
def test_internal_and_non_http_urls_are_rejected(url: str):
    with pytest.raises(UnsafeURLError):
        assert_public_url(url)


def test_private_urls_allowed_only_with_dev_flag(monkeypatch):
    monkeypatch.setattr(settings, "allow_private_urls", True)
    assert_public_url("http://localhost:3000/")  # no raise


async def test_create_source_rejects_internal_url(client: AsyncClient, signed_up_owner: dict, bot: str):
    resp = await client.post(
        "/v1/sources",
        json={"bot_id": bot, "url": "http://169.254.169.254/latest/meta-data/", "ownership_confirmed": True},
        headers=signed_up_owner["headers"],
    )
    assert resp.status_code == 422
    assert "private or internal" in resp.json()["detail"]


async def test_bot_webhooks_reject_internal_urls(client: AsyncClient, signed_up_owner: dict, bot: str):
    h = signed_up_owner["headers"]
    for field in ("crm_webhook_url", "slack_webhook_url"):
        resp = await client.patch(f"/v1/bots/{bot}", json={field: "http://127.0.0.1:8000/hook"}, headers=h)
        assert resp.status_code == 422


async def test_contact_form_escapes_html(client: AsyncClient, monkeypatch):
    sent = {}

    async def fake_send(to, subject, html):
        sent.update(subject=subject, html=html)
        return True

    import app.main as main

    monkeypatch.setattr(main, "send_email", fake_send)
    resp = await client.post(
        "/public/contact",
        json={
            "name": 'Eve\r\nBcc: x@evil.com <script>alert(1)</script>',
            "email": "eve@example.com",
            "message": '<a href="http://evil.example">click</a>',
        },
    )
    assert resp.status_code == 200
    assert "<script>" not in sent["html"] and "<a href" not in sent["html"]
    assert "&lt;script&gt;" in sent["html"]
    assert "\n" not in sent["subject"] and "\r" not in sent["subject"]


def test_short_or_empty_jwt_secret_is_refused(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "")
    with pytest.raises(RuntimeError):
        auth.create_access_token("u", "t")
    monkeypatch.setattr(settings, "jwt_secret", "short")
    with pytest.raises(RuntimeError):
        auth.create_access_token("u", "t")
