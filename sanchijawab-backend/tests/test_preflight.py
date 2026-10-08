"""Go-live preflight checks (SAN-1798)."""
from __future__ import annotations

import pytest

from app import preflight
from app.config import settings

GOOD = {
    "jwt_secret": "Zx9-" + "k3Lm8Qp2" * 5,
    "payment_secret_key": "fernet-key", "cloud_api_key": "gemini-key", "allow_private_urls": False,
    "rate_limit_enabled": True, "superadmin_emails": "boss@example.com", "frontend_url": "https://app.example.com",
    "smtp_host": "smtp.example.com", "payment_mode": "live", "sentry_dsn": "https://x@o.ingest.sentry.io/1",
    "langfuse_public_key": "pk", "langfuse_secret_key": "sk", "langfuse_environment": "production",
    "amazon_s3_bucket": "bucket", "support_email": "help@example.com",
}


def _statuses(monkeypatch, **overrides) -> dict[str, str]:
    for k, v in {**GOOD, **overrides}.items():
        monkeypatch.setattr(settings, k, v)
    return {name: status for status, name, _ in preflight.check_settings()}


def test_a_correct_production_setup_has_nothing_to_fix(monkeypatch):
    statuses = _statuses(monkeypatch)
    assert preflight.FIX not in statuses.values() and preflight.WARN not in statuses.values()


@pytest.mark.parametrize(
    "override, check",
    [
        ({"jwt_secret": "short"}, "JWT_SECRET is strong"),
        ({"jwt_secret": "a" * 40}, "JWT_SECRET is strong"),
        ({"payment_secret_key": ""}, "PAYMENT_SECRET_KEY is set"),
        ({"cloud_api_key": ""}, "Gemini key is set"),
        ({"allow_private_urls": True}, "Private-address crawling is off"),
        ({"rate_limit_enabled": False}, "Rate limiting is on"),
        ({"superadmin_emails": "  "}, "A super admin email is set"),
        ({"frontend_url": "http://localhost:3000"}, "FRONTEND_URL is a real https address"),
        ({"frontend_url": "http://app.example.com"}, "FRONTEND_URL is a real https address"),
        ({"smtp_host": ""}, "Email sending is configured"),
    ],
)
def test_each_unsafe_setting_is_flagged_as_something_to_fix(monkeypatch, override, check):
    assert _statuses(monkeypatch, **override)[check] == preflight.FIX


def test_optional_things_only_warn(monkeypatch):
    statuses = _statuses(monkeypatch, payment_mode="test", sentry_dsn="", amazon_s3_bucket="", langfuse_environment="development")
    assert statuses["Payments are in live mode"] == preflight.WARN
    assert statuses["Error tracking (Sentry) is on"] == preflight.WARN
    assert statuses["File storage is S3"] == preflight.WARN
    assert statuses["Langfuse environment is labelled"] == preflight.WARN


def test_render_counts_fixes(monkeypatch, capsys):
    _statuses(monkeypatch, jwt_secret="x")
    assert preflight.render(preflight.check_settings()) >= 1
    assert "thing(s) to fix" in capsys.readouterr().out
