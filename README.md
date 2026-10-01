# SanchiJawab

AI chatbot that learns a business's website and files, then answers visitors through an embeddable widget — with citations, lead capture, and human handoff. See `knowledge.md` for what's actually built vs. still planned, `specs/` for the BRD-derived requirements, and `RUNNING_LOCALLY.md` for a copy-paste day-to-day quick start once you've done the one-time setup below.

This repo has three parts, all tracked in this one repo (not separate clones):

- **`sanchijawab-backend/`** — FastAPI API + worker (Python, managed with `uv`)
- **`sanchijawab-admin/`** — Next.js dashboard (business owners manage their bot here)
- **`sanchijawab-widget/`** — the embeddable chat script customers paste into their site

Backend data lives on PostgreSQL + pgvector (app data and vectors, one database — no separate vector store) + Google Gemini + Amazon S3. Local dev uses the `db` service in `docker-compose.yml` (a `pgvector/pgvector` image); production points the same `DB_*` variables at a Supabase project instead — same driver, no code change. (Was MySQL + Qdrant Cloud until 2026-09-30 — see `knowledge.md` for why that changed.) Separately, `sanchijawab-backend/app/poc/` is a self-contained Phase 0 proof-of-concept that uses its own tables (`poc_chunks`) in the same local Postgres instance and doesn't touch the app's schema — the two don't interact.

## Prerequisites

- **Python 3.12** — the backend is pinned to it (`fastembed`'s `onnxruntime` dependency has no 3.13 wheels yet)
- **[uv](https://docs.astral.sh/uv/)** — Python dependency/venv manager
- **Node 18+** and npm
- **Docker Desktop** — for local Postgres+pgvector and Redis
- Real credentials for Google Gemini and Amazon S3 — see `.env.example`

## 1. Configure

```bash
cp .env.example .env
```

Fill in `.env` at the **repo root** (not inside `sanchijawab-backend/` — it's shared config for all three components, matching `docker-compose.yml`'s `env_file: .env`):

| Variable block | What it's for |
|---|---|
| `DB_*` | PostgreSQL. Defaults match the local `db` docker-compose service out of the box — for production, replace with a Supabase project's connection details (Project Settings → Database) |
| `CLOUD_API_KEY` / `GEMINI_MODEL` | Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `AMAZON_*` | An S3 bucket + IAM access key (read/write on that bucket) |
| `JWT_SECRET` | Any long random string |

## 2. Start local infrastructure

```bash
docker compose up -d db redis
```

## 3. Backend

```bash
cd sanchijawab-backend
uv sync
uv run python -m playwright install chromium   # needed for the crawler

# creates the schema on Postgres (creates the `vector` extension too)
uv run alembic upgrade head

# terminal 1
uv run uvicorn app.main:app --reload --port 8000
# terminal 2 — claims ingestion jobs (crawl -> chunk -> embed -> store)
uv run python -m app.worker
```

Check it's alive: `curl http://localhost:8000/health` → `{"status":"ok"}`.

## 4. Widget + Dashboard

```bash
# widget — builds to one file, dist/widget.js
cd sanchijawab-widget
npm install
npm run build
# serve it locally so the dashboard's install snippet can load it:
cd dist && python -m http.server 5500

# dashboard — separate terminal
cd sanchijawab-admin
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL, defaults to localhost:8000
npm run dev
```

Open **http://localhost:3000**.

## First 5 minutes

1. **Sign up** (creates your workspace).
2. **Create a bot** from the dashboard home.
3. Open the bot → **Knowledge** → paste a real website URL → **+ Website**. Status starts `queued`; once the worker (started in §3) picks it up, it flips to `done` — the page polls automatically, no refresh needed.
4. **Install** tab shows a one-line `<script>` snippet with your bot's real id, pointing at wherever you're serving `widget.js` (§4).
5. **Playground** — ask it a real question about the site you just added. You should get a streamed, cited answer.

To actually embed the widget on a test page instead of just the dashboard's Playground, drop the Install tab's snippet into any local HTML file served over HTTP (not `file://` — the crawler and CORS both expect a real origin).

## Phase 0 proof-of-concept (separate, optional)

`sanchijawab-backend/app/poc/` proves the crawl→embed→answer pipeline on a fresh local Postgres, independent of everything above:

```bash
docker compose up -d db   # local Postgres+pgvector on host port 55432
cd sanchijawab-backend
uv run python -m app.poc.crawl_to_pgvector https://example.com
uv run python -m app.poc.ask example.com "what is this site about?"
```

## Running tests

```bash
cd sanchijawab-backend
uv run pytest
```

Runs against the real PostgreSQL from `.env` (creates real, uniquely-emailed test users/bots and leaves them behind — no separate test database exists yet). No live LLM calls are made: `test_llm_retry.py` fakes the Gemini client to test retry/backoff logic in isolation; anything that needs a real model answer (ingestion, chat) is still covered by ad-hoc manual scripts, not this suite yet.

## Troubleshooting

- **Postgres connection errors when running scripts directly (not via the app)**: diagnostic scripts under `app/poc/` read `DATABASE_URL` straight from the environment rather than `.env` — if you're not going through `uvicorn`/`app.config`, you may need to export it yourself for that one command (defaults to the same local docker-compose Postgres).
- **Widget shows nothing on a test page**: check the browser console — CORS is wide open on `/public/w/*` by design (see `main.py`), so this is usually a wrong `data-api`/`data-bot` value, not a CORS problem.
- **`onnxruntime`/`fastembed` install fails**: you're probably on Python 3.13+. Use 3.12 (`uv python install 3.12`, then `uv sync` again — the repo pins this in `sanchijawab-backend/.python-version`).

## What's real vs. not yet built

See `knowledge.md` — kept up to date as the single source of truth for build status. Short version: auth, workspaces, ingestion (including CSV/XLSX/OCR), RAG, the widget (with consent gate, markdown, ratings), inbox/handoff/leads, analytics, and a first pytest suite are built and verified end-to-end. Google sign-in, real email *sending* (code's ready, needs SMTP credentials), CRM push, a real CSAT survey, and CI/staging are not.
