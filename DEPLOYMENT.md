# Deploying SanchiJawab

For whoever runs this in a real environment. For local development use `RUNNING_LOCALLY.md`. The list of
accounts and decisions you need to line up first is in `HANDOVER.md`.

## What runs

| Part | What it is | Port | Notes |
|---|---|---|---|
| `db` | PostgreSQL 16 with the **pgvector** extension | 5432 | Holds everything: accounts, conversations, knowledge and its embeddings. Use a managed Postgres if you prefer, but it must support `pgvector`. |
| `migrate` | one-shot job: `alembic upgrade head` | – | Creates/updates tables. Runs before `api`/`worker` on every deploy. |
| `api` | FastAPI backend | 8000 | Public: the chat widget and dashboard both call it. Health check: `GET /health`. |
| `worker` | background worker | – | Crawls websites, parses files, scheduled re-scans, retention clean-up. Run exactly the same image/env as `api`. |
| `admin` | Next.js dashboard + marketing website + super-admin console | 3000 | Public. |
| `widget` | nginx serving `widget.js` | 80 | Public. This is the file customers' websites load, so put it on a CDN if possible. |

There is no Redis requirement: the code lists Celery/Redis as dependencies but does not use them.

## First deployment (single server with Docker)

1. Install Docker with the compose plugin.
2. `cp .env.example .env` and fill it in (see "Settings" below). Generate the secrets:
   ```
   python -c "import secrets; print(secrets.token_urlsafe(48))"                                 # JWT_SECRET
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"    # PAYMENT_SECRET_KEY
   ```
   **Back up `PAYMENT_SECRET_KEY`.** Losing it makes stored payment-gateway keys unreadable.
3. Set the three public URLs in `.env` to the real addresses (they are baked into the dashboard image):
   `PUBLIC_API_URL`, `PUBLIC_WIDGET_URL`, `PUBLIC_SITE_URL`, and `FRONTEND_URL` (used in emails).
4. `docker compose up -d --build` (the first build is slow: the backend image contains a browser and ML libraries).
5. Put HTTPS in front of ports 8000, 3000 and 5500 with your usual reverse proxy / load balancer, on the three
   hostnames you chose above. The app does not terminate TLS itself.
6. Sign up in the dashboard with an email listed in `SUPERADMIN_EMAILS`: that account becomes the platform super admin
   (sign in at `/staff/login` for the Super Admin console).

To use a managed database instead of the `db` container, delete the `db` service and the two `depends_on: db` entries in
`docker-compose.yml`, and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` in `.env`. Run `CREATE EXTENSION vector;`
once if the provider doesn't enable it for you.

## Updating

```
git pull
docker compose up -d --build        # migrations run automatically via the `migrate` job
```

## Settings (`.env`)

Required to start: `JWT_SECRET` (16+ characters, the API refuses to run without it), `CLOUD_API_KEY` (Google Gemini key),
the `DB_*` values, `SUPERADMIN_EMAILS`, `PAYMENT_SECRET_KEY`, and the public URLs above.

Needed for specific features: SMTP settings (signup verification, invitations, transcripts, handoff emails),
`AMAZON_*` (file storage; without it uploads use the `appdata` volume), Razorpay/Stripe keys (entered in the Super Admin
console, not in `.env`; `PAYMENT_MODE=live` only once real keys are in), `LANGFUSE_*` (AI tracing, optional),
`SENTRY_DSN` (error tracking, optional), `COHERE_API_KEY` (optional answer re-ranking).

Never set in production: `ALLOW_PRIVATE_URLS=true` (it removes protection against the crawler or webhooks reaching internal
addresses), `RATE_LIMIT_ENABLED=false`.

## Before going live: checklist

- [ ] HTTPS on all three public hostnames; `PUBLIC_*` URLs use `https://`.
- [ ] `.env` is not in git or in an image, and secrets live in the host's secret manager.
- [ ] Regular database backups, and one restore has been tried.
- [ ] SMTP works: sign up with a real address and receive the verification email; check SPF/DKIM so it isn't marked spam.
- [ ] Super Admin console → Billing: add the Razorpay/Stripe keys, set Growth's price (so it can be bought) and its usage limits,
      delete the "Growth Test" plan, then switch `PAYMENT_MODE=live`.
- [ ] Super Admin console → Website content: review, fill in and publish the Privacy Policy and DPA drafts (they contain
      `[BRACKETS]` that need your company details and a lawyer's review).
- [ ] Super Admin console → Settings: trial length, support email.
- [ ] Run the load test and the quality evaluation against the real deployment (below).
- [ ] Add the repository secret `CLOUD_API_KEY` on GitHub if you want the weekly quality check to run.

## Checking it works

```
cd sanchijawab-backend
uv run pytest -q                      # 70+ automated tests (need a database)
uv run python -m app.loadtest         # throughput/latency of the main endpoints, no AI cost
uv run python -m app.eval.run         # 150-question quality evaluation; compares to the saved baseline (spends Gemini calls)
```

Reference numbers measured on a laptop with one process: about 100-150 requests per second on dashboard endpoints, 35-48
per second on document retrieval; answers took 11 s median, 17 s p95 end to end. The saved evaluation baseline is in
`sanchijawab-backend/app/eval/baseline.json`.

## Known limits

- Rate limiting is per backend process. If you run several `api` containers, put a shared limiter (for example at the load
  balancer) in front, or move the limiter to Redis.
- A Content-Security-Policy header is not set yet; it needs to be written against the real URLs and Razorpay's checkout script.
- The WordPress, Shopify, Webflow and Google Tag Manager installers are not built. Customers paste the snippet from the
  dashboard's Install page into any site.
