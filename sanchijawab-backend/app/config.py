"""Settings for the Phase 1 backend — PostgreSQL+pgvector / Gemini / S3
stack. Local dev points at the docker-compose Postgres (pgvector/pgvector
image, host port 55432); production points at a Supabase Postgres project
by overriding DB_HOST/PORT/USER/PASS/NAME in .env — same driver
(asyncpg), same schema, no code change needed to switch.

Originally MySQL (app data) + Qdrant (vectors) — moved to a single
Postgres+pgvector database (2026-09-30) to avoid running two separate
database services in production; see knowledge.md for the reasoning.

SanchiJawab is standalone — not connected to SanchiSaas or its shared
sc_tenants registry. tenant_id is generated locally at signup (see
app/main.py's signup()) and is purely internal to this product.

Everything is read from environment variables (see .env.example). Nothing
here has a real-looking default for a secret; missing values fail loudly
when the thing that needs them is actually used, not at import time.
"""
from __future__ import annotations

from pathlib import Path
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the repo root (shared by api/worker/dashboard, per
# docker-compose.yml's env_file: .env), not inside this folder. A plain
# "env_file=\".env\"" is relative to the current *working directory*, not
# to this file — it silently finds nothing unless you happen to run
# Python from the repo root, or from inside a container where Docker
# Compose already injected the vars as real env vars. Resolve the path
# explicitly so it works no matter where this is invoked from.
_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ROOT_ENV, extra="ignore")

    # App data + vectors — one PostgreSQL database (pgvector extension).
    # Defaults match docker-compose.yml's local `db` service; production
    # overrides these with the Supabase project's connection details.
    db_host: str = "localhost"
    db_port: int = 55432
    db_user: str = "sanchijawab"
    db_pass: str = "sanchijawab"
    db_name: str = "sanchijawab"

    # Password hashing cost (each +1 doubles the time). 12 is the production-grade default; the test suite
    # lowers it so creating hundreds of throwaway users doesn't take minutes.
    bcrypt_rounds: int = 12

    # Embeddings
    embed_provider: str = "fastembed"
    embed_dim: int = 384  # legacy / products (local bge-small)
    embed_dim_v2: int = 768  # knowledge passages (Gemini embeddings), column chunks.embedding_v2
    # Per-IP rate limiting on login/signup and public widget routes (SAN-1126).
    rate_limit_enabled: bool = True
    # SSRF guard (app/services/urlsafety.py): crawl/webhook URLs must resolve
    # to public addresses. Turn on only to crawl local sites in development.
    allow_private_urls: bool = False

    # Optional rerank step (FR-C hybrid retrieval): retrieve 30, rerank to
    # top_k. Off when cohere_api_key is empty.
    cohere_api_key: str = ""
    cohere_rerank_model: str = "rerank-v3.5"
    rerank_candidates: int = 30

    # LLM — single key slot, same convention as app/poc/ask.py
    default_provider: str = "google"
    cloud_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    # Per-bot model choice (FR-C9, Should) — gemini_model above is the
    # "balanced" default; these two give Bot.model_tier something real to
    # switch between. Fast-tier calls (fast_analyze, suggest_follow_ups)
    # deliberately always use gemini_model regardless of a bot's own tier —
    # only the final streamed answer is worth paying more/less for.
    gemini_model_economy: str = "gemini-2.5-flash-lite"
    gemini_model_quality: str = "gemini-2.5-pro"

    # Crawling
    max_pages_per_site: int = 5000
    crawl_concurrency: int = 8  # pages fetched at the same time (1 if a site's robots.txt asks for a delay)
    crawl_delay_seconds: float = 0.2
    render_js: bool = False

    # File uploads
    max_file_mb: int = 50
    max_pdf_pages: int = 200

    # Storage — S3
    amazon_s3_endpoint: str = "https://s3.ap-south-1.amazonaws.com"
    amazon_region: str = "ap-south-1"
    amazon_access_key_id: str = ""
    amazon_secret_access_key: str = ""
    amazon_s3_bucket: str = ""

    jwt_secret: str = ""
    # Comma-separated emails auto-promoted to platform super-admin on
    # signup/login — bootstraps the role without a DB console, since there's
    # no super-admin invite flow (yet).
    superadmin_emails: str = ""

    # Payment gateway credentials are stored in the payment_gateways table
    # (not env vars) so a super admin can swap live/test keys per gateway
    # without a redeploy — see services/payments/gateways.py. This key
    # encrypts those secret columns at rest (Fernet, symmetric). Generate
    # with: python -c "from cryptography.fernet import Fernet;
    # print(Fernet.generate_key().decode())" — losing/rotating it makes
    # existing stored secrets unreadable, so back it up like a real secret.
    payment_secret_key: str = ""
    # 'test' | 'live' — global for now (no per-tenant override yet).
    payment_mode: str = "test"

    # Observability — Langfuse tracing (optional; empty keys mean the
    # Langfuse client is a safe no-op, see services/tracing.py).
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_base_url: str = "https://cloud.langfuse.com"
    # Lets traces be filtered/compared by deployment stage once this API runs
    # somewhere other than a laptop (lowercase alphanumeric + hyphens only,
    # per Langfuse's environment format).
    langfuse_environment: str = "development"

    # Observability — Sentry error tracking (optional; empty DSN makes the
    # SDK a safe no-op, same convention as the Langfuse client above).
    sentry_dsn: str = ""
    sentry_environment: str = "development"
    sentry_traces_sample_rate: float = 0.1
    sentry_release: str = ""

    # Email delivery (signup verification, team invitations) — plain SMTP,
    # works with any provider (SES SMTP endpoint, SendGrid, Mailgun, Gmail
    # app-password, etc.) without locking into a vendor SDK. If smtp_host
    # is empty, email sending is skipped (logged, not silently swallowed)
    # so local dev without credentials still works.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "SanchiJawab <no-reply@sanchijawab.com>"
    support_email: str = "support@sanchijawab.com"
    frontend_url: str = "http://localhost:3000"

    @property
    def postgres_url(self) -> str:
        # Credentials can contain URL-reserved characters (@, #, etc.) —
        # must be percent-encoded or they corrupt the DSN's parsing.
        user = quote_plus(self.db_user)
        password = quote_plus(self.db_pass)
        return f"postgresql+asyncpg://{user}:{password}@{self.db_host}:{self.db_port}/{self.db_name}"


settings = Settings()
