# Design

System architecture. Source of truth: BRD §8 (System architecture) and §9.3 (Application stack).

## Components

```
Website + files ──► crawler / parsers ──► chunks + embeddings (Postgres + pgvector)
                                                   │
Visitor on site ──► widget.js ──► API ──► hybrid search ──► Claude ──► streamed answer + sources
                                    │
                                    └──► Inbox (agents take over) · Leads · Analytics
```

Four parts, matching the repo's three product folders plus the shared data layer:

- **`sanchijawab-admin`** — Next.js dashboard. Onboarding, knowledge management, bot settings, widget customiser, install page, playground, inbox, analytics, team.
- **`sanchijawab-widget`** — Preact + Vite, bundled to a single script, rendered inside Shadow DOM so host page CSS can't break it and vice versa.
- **`sanchijawab-backend`** — FastAPI app (API + SSE chat service) and a Celery worker sharing the same codebase; the worker runs crawl/parse/embed jobs and scheduled re-scans.
- **Data stores** — PostgreSQL 16 + pgvector (app data + vectors in one database for MVP scale), Redis (queue + cache), S3-compatible object storage (uploaded files, widget bundle).

## Request flow (visitor question → answer)

1. Widget sends message + page URL + session id to the chat service.
2. Fast model (Haiku) rewrites the query, detects language and handoff intent.
3. Hybrid search: pgvector similarity + Postgres full-text, filtered by `bot_id` and `visibility = customer`.
4. Optional Cohere rerank: retrieve 30, rerank to top 6.
5. Answer model (Sonnet) generates a grounded, streamed answer with citations; tool calls go through the MCP tool runner with visitor confirmation on data-changing actions.
6. Trace (prompt, chunks, tokens, latency, cost) logged to Langfuse.

## Why these choices (see BRD §9 for alternatives)

- **Postgres + pgvector over a dedicated vector DB**: one database to operate for MVP scale; move to Qdrant only past a few million chunks.
- **Shadow DOM widget**: isolation is a hard requirement (BRD NFR) — the widget runs on customer sites we don't control.
- **FastAPI (async) for both API and worker**: same language as the crawling/AI code, avoids a cross-language boundary for the RAG pipeline.
- **SSE over WebSocket for chat**: simpler infra for one-directional streaming; WebSocket reserved for live agent chat in the inbox.

_Status: planning reference — architecture agreed, nothing built yet. Tracked in Linear as [SAN-1056](https://linear.app/sanchiconnect/issue/SAN-1056) (foundations) and [SAN-1065](https://linear.app/sanchiconnect/issue/SAN-1065) (non-functional requirements)._
