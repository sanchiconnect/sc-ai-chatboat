# API

Reference for SanchiJawab's core API. Source of truth: BRD §12 (Data model & APIs). Implementation tracked in Linear as [SAN-1064](https://linear.app/sanchiconnect/issue/SAN-1064).

Base URL (dev): `http://localhost:8000`. Interactive docs at `/docs` (FastAPI auto-generated).

## Auth

All `/v1/*` endpoints require a session (dashboard user). All `/public/*` endpoints are called by the embedded widget using a bot's public key — no user session, but rate-limited per key and per visitor IP.

## Core endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/v1/bots` | Create bot |
| POST | `/v1/bots/{id}/sources` | Add website, file or Q&A source; enqueues ingestion job |
| GET | `/v1/sources/{id}/progress` (SSE) | Live crawl progress |
| PATCH | `/v1/documents/{id}` | Edit or disable a page |
| PUT | `/v1/bots/{id}/widget` | Save widget configuration |
| GET | `/v1/conversations?status=waiting` | Inbox list |
| POST | `/v1/conversations/{id}/takeover` | Agent takes over |
| GET | `/v1/bots/{id}/analytics` | Dashboard metrics |

## Public widget endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/public/w/{public_key}/config` | Widget loads its config (cached at CDN edge) |
| POST | `/public/w/{public_key}/chat` (SSE) | Visitor message; streams answer |
| POST | `/public/w/{public_key}/leads` | Submit lead form |

## Conventions

- Streaming responses (`chat`, `progress`) use Server-Sent Events.
- Every request scoped to a workspace/bot must filter by `tenant_id` at the query layer — see [SAN-1125](https://linear.app/sanchiconnect/issue/SAN-1125) (tenant isolation).
- Data-changing MCP tool calls always require visitor confirmation before executing (BRD §9.4).

_Status: planning reference — no endpoints implemented yet. Update this file as routes land._
