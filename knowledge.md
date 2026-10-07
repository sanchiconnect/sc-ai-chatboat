# Knowledge

Living status doc for the project. Source of truth for planning is the [SanchiJawab BRD v1.1](specs/) and the [Linear project](https://linear.app/sanchiconnect/project/sanchijawab-19a528ede84c) (P-SAN-62) — this file is a quick human-readable summary, not a duplicate of either.

## Current state (2026-09-29)

- Planning docs (this file, `api.md`, `database.md`, `design.md`, `README.md`, `specs/`)
- Package manifests for the three components — installed: `uv sync` in `sanchijawab-backend` (Python 3.12, pinned via `.python-version`), `npm install` in `sanchijawab-admin` and `sanchijawab-widget`
- `docker-compose.yml` and `.env.example` / `.env` — `db`/`redis` containers running locally. **Note:** the db container's host port is remapped to **55432** (not 5432) because this machine already runs a native Postgres service on 5432 — containers still talk to each other at `db:5432` internally
- 14 top-level Linear issues + 68 sub-tasks across 5 milestones (Phase 0 Discovery/PoC → Phase 3 Scale), all assigned to Aman
- **Phase 0 PoC validated end-to-end, including a live LLM call** ([SAN-1055](https://linear.app/sanchiconnect/issue/SAN-1055)): `sanchijawab-backend/app/poc/` — crawled a real page with Crawl4AI, chunked it, embedded locally with fastembed, stored in pgvector, hybrid search, then a real Gemini call (`DEFAULT_PROVIDER=google` / `CLOUD_API_KEY`, same single-key-slot convention as the SanchiConnect project). Answer script supports google/openai behind one `CLOUD_API_KEY` — swap `DEFAULT_PROVIDER` to change providers. First real test correctly answered "I don't know" for a question the crawled page didn't cover (FR-C2 strict grounding working as intended, not guessing).

## Phase 0 evaluation sites (confirmed working, 2026-09-29)

Real crawl → chunk → embed → pgvector → hybrid search → Gemini-grounded answer, validated end-to-end on all 5, with per-site tenant isolation (a cross-site question correctly returned "I don't have information" instead of leaking another site's data):

1. sanchiconnect.com — SaaS / startup ecosystem
2. jecrcfoundation.com — educational institution
3. chumbak.com — e-commerce
4. motherhoodindia.com — clinic / healthcare (cloudnine.in tried first, returned only 23 words — bot-blocked/JS-shell — swapped out)
5. urbancompany.com — local services

**Eval complete (2026-09-29)**: 150-question eval set written and run end-to-end (`app/poc/eval_questions.json`, `eval_run.py`, results in `eval_results.jsonl`). Sampled groundedness (n=10, LLM-judged with full passage context): **100/100 avg** — clears the BRD's ≥90% gate on the first pass, no chunk/prompt tuning needed. Decline rate 17% overall (expected — questions deliberately mixed answerable and unanswerable). Avg latency 4.55s/question (non-streaming synchronous PoC calls, not directly comparable to BRD's <2s first-token-streaming production target).

**Phase 0 status: SAN-1055 (Proof of Concept) is fully Done.** SAN-1054 (Discovery) has eval-set and stack-decision sub-tasks Done; provider-account signups (SAN-1070) and product name/domain/pricing (SAN-1071) remain genuinely blocked on the user.

## Blocked on the user (can't be done by an AI agent)

- **SAN-1070** — provider accounts (Sentry, Langfuse, hosting) need real signups/billing. LLM provider is unblocked for now (Gemini key supplied)
- **SAN-1071** — final product name/domain/pricing is a business call (repo currently assumes "SanchiJawab")
- **"Fully deployed"** — the PoC above is real but entirely local (Docker on this machine). Actually deploying (a live URL, not just localhost) needs a hosting decision + account (AWS/Railway/Render per BRD §9.3) and a domain — both blocked on SAN-1070/SAN-1071. Local "fully workable" is achievable now; "deployed" is not, until those are resolved.

## What's scoped (BRD v1.1)

Full functional requirements live in the BRD (§6) and are mirrored 1:1 into Linear issues. Summary:

**Phase 0 — Discovery & PoC**: evaluation set, stack decisions, crawl→embed→answer proof of concept.

**Phase 1 — MVP**: accounts/workspaces/roles, knowledge ingestion (crawler + files + Q&A + visibility), bot config + RAG engine, embeddable widget, install flow, inbox/handoff/leads, analytics, billing, data model, non-functional requirements (tenant isolation, privacy, AI safety).

**Phase 2 — Growth**: routing/proactive triggers, MCP tool actions (CRM/order lookup/booking), connectors, platform plugins (WordPress/Shopify/GTM), multilingual UI.

**Phase 3 — Scale**: messaging channels, agent copilot, public MCP server, SSO/audit log, data residency.

## Phase 1 target stack — changed from BRD default (2026-09-29)

Superseding the BRD's Postgres+pgvector+Claude recommendation below, for Phase 1 (not built yet):

- **App DB**: MySQL on the company's existing server (`DB_HOST` in `.env`), database `sc_sanchi_jawab` — dedicated to this project, not shared
- **No `sc_tenants` integration** (decided 2026-09-29): SanchiJawab is a standalone project, not connected to SanchiSaas or the company's shared tenant registry. Per-customer multi-tenancy (Sharma Organics, Chumbak, etc.) is handled entirely by our own `workspaces`/`tenant_id` columns in `sc_sanchi_jawab` — `tenant_id` is generated locally at signup, nothing external to cross-reference.
- **Vector search**: Qdrant Cloud (see below), filtered by tenant_id+bot_id+document_id for isolation (replaces pgvector + the visibility column)
- **LLM**: Google Gemini via `CLOUD_API_KEY`/`GEMINI_MODEL` for both the fast and main answer tiers (replaces Claude Sonnet+Haiku)
- **File storage**: Amazon S3 (`AMAZON_*` vars in `.env`) — needs a real AWS account + bucket + IAM key, not yet created
- Full text search: MySQL FULLTEXT indexes (replaces Postgres tsvector), still fused with the vector results via RRF

**Update (2026-09-29): real vertical slice built and proven end-to-end**, in `sanchijawab-backend/app/`:
- `config.py`, `db.py`, `models.py` — all core tables, Alembic migration applied to the live server (13 tables in `sc_sanchi_jawab`)
- `services/vector_store.py` (Qdrant), `embeddings.py` (fastembed), `llm.py` (Gemini, fast+main tier), `retrieval.py` (Qdrant + MySQL FULLTEXT, RRF-fused), `rag.py` (citation parsing, no_answer detection), `storage.py` (S3, untested — no AWS creds yet), `crawler.py` + `chunker.py` + `ingest.py` (crawl→chunk→embed→store, incremental via content_hash)
- `main.py` (FastAPI: `POST /v1/sources`, `GET /v1/sources/{job}/status`, `POST /public/w/{bot_id}/chat` SSE), `worker.py` (MySQL `FOR UPDATE SKIP LOCKED` job claiming)
- **Proven live**: created a real source (chumbak.com) via HTTP, worker crawled+ingested it into the real MySQL server + local Qdrant, then the SSE chat endpoint streamed a correct, multi-citation grounded answer with resolved source URLs — the full new stack, not a mock

**Update (2026-09-29, later): auth built and proven; Qdrant moved to cloud; S3 fixed**
- Auth (FR-A1-A3) done: `services/auth.py` (bcrypt + JWT), `deps.py` (role-gated dependencies), signup/login/me/verify-email/invite endpoints. Fixed a real security hole along the way — `/public/w/{bot_id}/chat` used to accept `tenant_id` as a client-supplied field (spoofable); now derives it server-side from the bot row.
- Fixed a `passlib`+`bcrypt` version incompatibility by dropping `passlib` and calling `bcrypt` directly.
- Qdrant switched from local Docker to Qdrant Cloud (free-tier cluster "jawab") — `QDRANT_URL`/`QDRANT_API_KEY` in `.env`. Local docker-compose `qdrant` service still there as an offline fallback.
- **S3 works** — corrected AWS key + bucket `sanchi-saas-dev` (this is a shared dev bucket, not per-product, but that's just storage, no tenant-registry implications); upload/download round-trip confirmed.
- Full auth-protected flow proven live: signup → create bot → create source (role-gated) → worker ingests (real crawl, MySQL + Qdrant Cloud) → public chat (no auth, but tenant_id no longer spoofable) → grounded streamed answer with correct citations.
- Full-stack health check (2026-09-29) re-confirmed everything still works after all the credential/config changes: Phase 0 (local Postgres data + Gemini call), Phase 1 MySQL (15 tables), Qdrant Cloud (139 points, green), S3 (round-trip OK).

**Update (2026-09-30): widget built and proven in a real browser**
- `sanchijawab-widget/` — Preact + Vite, builds to one 18.48kB (7.72kB gzip) IIFE bundle (`widget.js`), Shadow DOM isolated, reads config from `data-*` attributes on the script tag (`data-bot`, `data-api`, `data-business`, `data-color`, `data-welcome`). Streams SSE by hand (fetch + ReadableStream — `EventSource` doesn't support POST bodies). Conversation persists across page navigation via `sessionStorage`. Mobile full-screen via media query.
- Two real bugs only a browser test caught (curl/direct-script tests couldn't have found either): (1) `document.currentScript` is only valid during synchronous script execution — reading it inside a deferred `DOMContentLoaded` callback returns `null`; fixed by capturing it at module top level. (2) The backend had **no CORS headers** — a widget embedded on any real customer domain would be silently blocked by the browser calling a different-origin API. Added `CORSMiddleware` (wildcard origin — safe here since auth is Bearer-token, not cookies; real per-bot domain restriction is FR-I2/SAN-1106, still separate and not built).
- Verified with a real headless Chromium session (Playwright): loaded a host test page, clicked the launcher (through Shadow DOM), sent a real question, got back a real streamed grounded answer with a working source link. Screenshot confirmed correct rendering; checked exact bounding-box coordinates to rule out a suspected header/bubble overlap (turned out to be same-color visual illusion, not a real layout bug).

**Update (2026-09-30): admin dashboard built and proven — full onboarding funnel works end-to-end**
- `sanchijawab-admin/` — Next.js 15 (App Router) + Tailwind. Pages: signup, login, dashboard overview (list/create bots), per-bot Knowledge (add website source, live status polling), Install (real snippet with the bot's actual id), Playground (real streamed chat, same SSE-parsing approach as the widget).
- Backend gap found and fixed while building this: there were only *create* endpoints (sources, bots), nothing to *list* them. Added `GET /v1/workspaces`, `GET /v1/workspaces/{id}/bots`, `GET /v1/bots/{id}/sources` — needed for the dashboard to show anything that already exists, not just what you just created in that session.
- **Verified with a real headless-browser run of the entire funnel**: signup → redirected to dashboard → create bot → add a real website source → worker ingests it (real crawl) → UI polling shows `queued` → `done` without a manual refresh → Install tab shows the correct real bot id in the snippet → Playground gets a real streamed, cited answer. Screenshot confirmed clean rendering.
- Known cosmetic gap: chat responses render as plain text, so markdown (`**bold**`) shows literally instead of formatted — not fixed yet, not a functional issue.

**Update (2026-09-30): file upload + parsing built and proven**
- `POST /v1/sources/file` (multipart) → S3 → `services/parser.py` (docling for PDF/DOCX/PPTX, plain read for TXT/MD) → same chunk/embed/store pipeline as website sources — refactored the shared part of `ingest.py` into one helper so both paths stay in sync.
- Verified with two real uploads containing deliberately fabricated facts (a correct answer proves real grounding, not the model's general knowledge): a `.md` file and a `.docx` file, both correctly answered from their specific made-up content after ingestion.
- Real bug caught and fixed: docling doesn't accept a raw `BytesIO`, it needs its own `DocumentStream` wrapper — the ingest job failed loudly (not silently) on the first attempt, which is exactly why it got caught.
- Not done: CSV/TSV/XLSX (table-aware chunking is a different problem from word-count windows, left as a follow-up) and OCR for scanned PDFs.

**README.md written** — real setup instructions (prereqs, `.env` config, starting infra, backend/widget/dashboard, first-5-minutes walkthrough, troubleshooting), not a placeholder.

**Update (2026-09-30): file upload UI gap found and fixed**
- The backend file-upload endpoint (above) was never wired into the dashboard — Knowledge page only had the website-URL form, no file picker. Found by the user testing the real UI, not by me. Added a `<input type="file">` + `api.createFileSource()` (browser `FormData`, not JSON — a different code path from the rest of `lib/api.ts`'s `request()` helper). Verified with a real headless-browser run: signup → create bot → upload a real `.md` file through the actual file input → status polling → Playground answers correctly from the file's specific (fabricated) content.
- **Current dashboard is intentionally minimal** — Tailwind utility classes, no design system, only 3 of the BRD's ~9 planned screens exist (Knowledge, Install, Playground — the ones with working backend support). Bot settings, Widget customiser, Inbox, Analytics, Team/Settings pages don't exist yet, matching that none of their backends exist yet either.

**Update (2026-09-30): Bot Settings + Widget Customiser built**
- Dashboard pages `settings/page.tsx` (name/persona/instructions) and `widget/page.tsx` (color/header/welcome/position + live mock preview), backed by `GET/PATCH /v1/bots/{id}` and `GET/PUT /v1/bots/{id}/widget-config`. Persona/instructions are actually read by `rag.py` and injected into the Gemini system prompt in `llm.py`, not just stored.
- Verified live: saved an unusual persona ("answer in caps, sign off ROBOT SIGNING OFF") and custom branding through the real dashboard, then loaded the widget on a separate host page with no overriding attributes — it picked up both live from the backend. Found and fixed a real bug in the process: `/public/w/{bot_id}/config` was returning `bot.name` instead of the saved custom header text.

**Update (2026-09-30): citation bracket bug fixed**
- The LLM's system prompt told it to "cite passage ids like [1], [2]" inline in the visible answer text, while the widget separately rendered a "Source" link below — visitors saw the same citation twice, once as raw `[3]` noise in the sentence. Fixed by telling the model to write plain prose with no brackets/the word "Source", and deriving the sources list in `rag.py` directly from the retrieved chunks (deduped by URL) instead of regex-parsing markers out of the answer text.

**Update (2026-09-30): domain allow-list (FR-I2) built**
- `Bot.allowed_domains` (JSON list, migration `fddca69463ed`, empty = unrestricted/back-compat default). Enforced in both `/public/w/{bot_id}/config` and `/public/w/{bot_id}/chat` via `_enforce_domain_allowlist()` in `main.py`, which checks the request's `Origin` (falls back to `Referer`) hostname against the list, with subdomain matching (`allowed.example` also permits `widget.allowed.example`). No Origin/Referer header at all + a non-empty allow-list = deny (can't verify, so it's treated as untrusted). Manageable from the Bot Settings dashboard page (comma-separated input).
- Verified with real HTTP calls (not just unit logic): unrestricted bot accepts any origin; after setting an allow-list, a disallowed origin gets 403 on both endpoints, an allowed origin and its subdomain get 200, and a request with zero Origin/Referer header gets 403.

**Update (2026-09-30): Inbox (FR-H1) + lead capture (FR-L1) built**
- `Conversation`/`Message`/`Lead` tables (existed unused) are now actually written to: every widget chat call persists the visitor message and the bot's final answer via `services/conversations.py`. When the fast-tier intent detector flags `handoff_requested` (already existed, just went nowhere before), the conversation flips to `status="waiting"`, a "Connecting you with our team" message is stored, and the bot stays silent on any further messages in that conversation (checked server-side, not just client-side) so it doesn't talk over a human.
- Dashboard **Inbox** tab (`inbox/page.tsx`): list conversations by status (waiting/human/bot/closed), open one to see the full transcript, reply as an agent (`POST /v1/conversations/{id}/reply`, auto-sets status to `human` + `assigned_agent_id`), close it. Requires `agent` role or above.
- Widget picks up agent replies via polling `GET /public/w/{bot_id}/conversations/{id}/messages?after=<id>` every 4s once handed off — explicitly not realtime/websockets, a deliberate MVP trade-off, documented as such in the code.
- Lead capture (FR-L1 Must, partial): an inline name/email/phone form appears under the "Connecting you..." message right when handoff triggers (the natural moment per the BRD), posts to `/public/w/{bot_id}/lead`. Dashboard **Leads** tab lists captured leads per bot with a working CSV export button (client-side blob download). CRM push (FR-L1's other Should) is not built — no CRM integration exists yet.
- Also added: `visitor_id` (localStorage, persists across tabs) and `conversation_id` (sessionStorage, per tab) so a conversation survives a page reload within the same tab.
- Verified with a real end-to-end HTTP test (not mocked): signup → create bot → visitor message explicitly asking for a human → confirmed `handoff` event fires and conversation is created and persisted → lead submitted and visible in `GET /v1/conversations/{id}` → agent replies via the dashboard endpoint → widget's poll endpoint returns the agent message with `status: "human"` → a further visitor message while handed off gets `handed_off: true` and no bot answer → conversation closed → lead appears in the bot's leads list.
- Known gap: if the widget is closed/reopened mid-handoff without a fresh message, it re-checks status once on mount (a single poll call) rather than a persistent background connection — acceptable for MVP, noted rather than hidden.

**Update (2026-09-30): real email delivery wired up (code complete, sending itself blocked on credentials)**
- `services/email.py`: plain SMTP sender (stdlib `smtplib` via `asyncio.to_thread`, no vendor SDK — works with SES's SMTP endpoint, SendGrid, Mailgun, a Gmail app password, etc.). Controlled by new `SMTP_HOST/PORT/USER/PASSWORD/FROM` + `FRONTEND_URL` settings in `.env`/`.env.example` (all blank/default for now). If `SMTP_HOST` is unset, sending is skipped with a logged warning instead of failing signup/invite — verified this doesn't throw even when the host is unreachable/invalid (`socket.gaierror` caught, returns `False`).
- Signup now calls `send_verification_email()` and returns `email_sent: bool` alongside the existing `email_verify_token` (kept as a dev fallback — should stop being returned once real sending is confirmed reliable in production).
- Team invitations: new users get a real invite-token flow (`create_invite_token`, 7-day expiry) instead of a dead-end unusable-password account. `POST /v1/auth/accept-invite {token, password}` sets their password and logs them in. New dashboard pages `verify-email/page.tsx` and `accept-invite/page.tsx` handle the links these emails point to.
- **Not actually sent yet** — no SMTP credentials are configured (checked `.env`, none present). All the logic (token creation/expiry, one-time-use accept-invite, login-after-accept, graceful skip/failure handling) is verified with real HTTP calls; the literal "does an email land in an inbox" step is genuinely blocked on the user supplying SMTP credentials, same as the SAN-1070 provider-account pattern.

**Update (2026-09-30): widget polish — markdown rendering, thumbs up/down, transcript download (FR-W10)**
- `markdown.ts`: a small dependency-free markdown-to-HTML renderer (bold/italic/inline code/links/bulleted+numbered lists) instead of a full markdown library, to stay well inside the widget's <60KB gzip budget (currently 9.6KB gzipped, up from 8.6KB). HTML-escapes first, then only ever emits a fixed whitelist of tags, so nothing in the input (including text pulled from crawled/uploaded documents) can inject arbitrary markup. Bot/agent bubbles render through it; the visitor's own message stays plain text (rendering visitor input as HTML would be a real XSS risk).
- Thumbs up/down: `Message.rating` column (migration `598c4a2a6f7a`) + `POST /public/w/{bot_id}/messages/{message_id}/rating`. The backend now emits a `message_saved` SSE event right after persisting the bot's answer so the widget knows the real DB message id to attach the rating to.
- Transcript download: fully client-side (no backend endpoint needed) — builds a plain-text transcript from the visible conversation and triggers a blob download, same pattern as the dashboard's lead CSV export.
- Verified with a real headless-browser test (Playwright): uploaded a `.md` file with fabricated steps + a confirmation code, set bot instructions forcing markdown-formatted answers, asked a real question, and confirmed the rendered bubble contains actual `<ol><li>`/`<strong>` tags with **zero** literal `**`/`1.` markdown syntax leaking through; clicked thumbs-up and confirmed `Message.rating = 1` was actually written to MySQL (checked directly, not just the UI); clicked the download button and confirmed a real file downloads containing the full transcript. No console errors during the run.

**Update (2026-09-30): widget icons fixed to survive host-page charset misconfiguration (real bug, user-found)**
- User's own file:// test page (no `<meta charset>`) showed every widget icon as mojibake (`âce•` instead of `✕`, `âŽ¤` instead of `➤`, `â€¦` instead of `…`). Root cause: the widget's own UI glyphs were literal multi-byte UTF-8 characters baked into the JS source; a host page/script with no declared charset makes the browser fall back to a legacy 8-bit codepage to decode the external `widget.js`, corrupting every non-ASCII byte sequence. Not a one-off — this could hit any real customer site that doesn't explicitly declare UTF-8, which is a real, if old-fashioned, misconfiguration still seen in the wild.
- Fixed at two levels: (1) replaced every literal icon character in `Widget.tsx` with a JS `\uXXXX`/`\u{XXXXX}` escape (pure ASCII in source, immune to any decode-charset issue), and (2) discovered `vite.config.ts`'s esbuild minifier "optimizes" those escapes back into raw UTF-8 bytes for smaller output — undoing (1) — so added `esbuild: { charset: "ascii" }` to force it to keep escapes. Verified the *built* `dist/widget.js` is now 100% ASCII, zero non-ASCII bytes, byte-checked directly.
- Verified with a real headless-browser test reproducing the user's exact scenario (a `file://` page with no charset declared): all icons (chat bubble, close, send, download, thumbs) render as the correct glyphs, not mojibake. Screenshot-confirmed against the same test page layout the user reported the bug on.
- Backend-streamed text (bot answers, including em-dashes etc.) was already unaffected by this class of bug — it goes through an explicit `new TextDecoder()` (UTF-8 by default) in `api.ts`, independent of the host page's charset.

**Update (2026-09-30): CSV/TSV/XLSX ingestion (FR-K6 follow-up)**
- `services/tabular.py`: row-per-chunk parsing instead of the generic word-count chunker — each spreadsheet row becomes one self-contained "field: value" chunk (e.g. `"products.csv, row 3:\nSKU: ZBX-002\nPrice: 18999"`), so a row's fields always retrieve and get read together, never split mid-row the way a blind word-count window would corrupt a markdown table. CSV/TSV via stdlib `csv` (BOM-safe `utf-8-sig` decode), XLSX via new `openpyxl` dependency, iterating every sheet, capped at 5000 rows/sheet as a sanity limit.
- `ingest.py` refactored: `_store_document()` now takes pre-chunked `pieces: list[str]` instead of a raw markdown string and chunking internally, so callers decide chunking strategy — word-count windows for prose (websites, PDF/DOCX/PPTX, TXT/MD), row-per-chunk for spreadsheets. Upload endpoint, dashboard's accepted-file-types list and hint text updated to include CSV/TSV/XLSX.
- Verified with a real end-to-end test: uploaded a CSV (product catalog) and an XLSX (warranty sheet) with fabricated SKUs/prices/warranty months/support emails, asked three real questions, and got exact correct fabricated values back for each — including a row-isolation check (asking about SKU-001's warranty correctly returned 36 months, not SKU-002's 18) proving rows are retrieved and read as complete, uncorrupted records.
- Noted in passing, not fixed (separate concern): a transient Gemini API `ReadTimeout` during this test crashed that one streamed request with no retry — `llm.py`/`rag.py` have no retry/backoff on the LLM call. Real gap, not a CSV-specific issue.

**Update (2026-09-30): OCR for scanned PDFs — already working, just never verified (docling default)**
- docling's `PdfPipelineOptions.do_ocr` defaults to `True`, and `parser.py`'s plain `DocumentConverter()` (no custom pipeline options) inherits that default — so OCR was already wired in by nothing more than not having explicitly disabled it. Verified for real: generated a genuinely image-only PDF (rendered text onto a PIL image, saved as PDF — no embedded text layer at all, a true synthetic "scanned document") containing a fabricated unique code, uploaded it through the real upload endpoint, and the bot correctly answered a question about that code — proving docling's OCR actually extracted it, not that the PDF happened to have a hidden text layer already.

**Update (2026-09-30): Analytics dashboard (FR-R1) + unanswered-question loop (FR-R2)**
- `GET /v1/bots/{bot_id}/analytics/summary?days=N`: conversations, messages, handoff count, resolution rate (non-handoff conversations / total — "bot resolved without escalation"), leads captured, and a "message satisfaction rate" computed from thumbs up/down — explicitly labeled as a proxy, since no real post-chat CSAT survey exists. Top questions via simple exact-text (lowercased/trimmed) grouping of visitor messages — a real product would want semantic clustering for near-duplicate phrasings, noted as a known simplification, not hidden.
- `GET /v1/bots/{bot_id}/analytics/unanswered?days=N`: bot messages where `Message.confidence == 0.0` (now actually set — previously this column existed but nothing wrote to it; `main.py`'s chat handler now records 0.0/1.0 as a crude decline-vs-answered proxy), paired with the preceding visitor message in the same conversation.
- One-click "Add answer" (FR-R2): `POST /v1/bots/{bot_id}/qa-pairs` — critically, this doesn't just insert a `QAPair` row (which existed unused before, same trap as Bot/WidgetConfig originally were in). `services/qa.py` embeds the Q&A pair through the same `store_document()` pipeline used for websites/files, indexing it into Qdrant + MySQL chunks under a dedicated `Source(type="qa")` bucket, so it's real retrievable knowledge from the next question onward.
- Dashboard **Analytics** tab: metric cards, top-questions list, and an unanswered-questions panel with an inline "Add answer" form that calls the above.
- Verified with a real end-to-end test: asked a bot with zero knowledge sources a fabricated question (real decline), confirmed it showed up correctly in both the summary (top questions, resolution rate 100% since no handoff) and the unanswered-questions report, submitted an answer via the API, then asked the *same question again* and got the fabricated answer back correctly — proving the QA pair actually became retrievable, not just stored.

**Update (2026-09-30): LLM call retry/backoff + first real pytest suite**
- `llm.py`: a real transient `httpx.ReadTimeout` was observed mid-session crashing a live chat request with no retry (see the CSV/XLSX entry above). Fixed: `fast_analyze` and `stream_answer` now retry transient network errors (`httpx.TimeoutException/ConnectError/RemoteProtocolError`) up to 3 attempts with short backoff. Streaming is the tricky part — if content was already sent to the visitor before a failure, retrying from scratch would duplicate it, so instead it stops cleanly with a visible "connection interrupted" notice rather than silently truncating or crashing the connection.
- First committed automated test suite: `sanchijawab-backend/tests/` (21 tests, `uv run pytest`), against the real MySQL/Qdrant from `.env`, not mocks — auth flows, bot/widget-config CRUD, the domain allow-list, and the new retry logic (this one mocked, since it's specifically testing failure handling, not real infra). Hit and fixed a real pytest-asyncio + async SQLAlchemy gotcha: the engine is created once at import time bound to whichever event loop first used it, so every test after the first crashed with "Event loop is closed" until an autouse fixture disposes the engine between tests.
- Not covered by the suite: anything needing a real LLM/Qdrant round-trip (ingestion, chat) — deliberately kept out so the suite stays fast and free to run; still only verified via the ad-hoc manual scripts documented throughout this file. No CI wiring yet either (nothing runs `pytest` automatically on push).

**Update (2026-09-30): consent/privacy gate (FR-W4)**
- `WidgetConfig.consent_text` (existed unused) + new `require_consent` boolean (migration `2f4163f2bfc7`, defaults to `True`), exposed via the bot's widget-config endpoints and the public config the widget reads. Dashboard Widget settings page gets a checkbox + textarea.
- Widget: a real gate that disables the input/send button (not just visually — genuinely disabled) until the visitor accepts a business-customizable consent notice; decline shows a distinct "chat unavailable" state with a way to reconsider. Persists per-bot in `localStorage` (not `sessionStorage`) so an accepting visitor isn't re-prompted next visit.
- Verified with a real Playwright test: default is opt-in-required for new bots, custom consent text renders correctly, the input is genuinely disabled while gated (not just styled to look disabled), decline/accept/reload-persistence all behave correctly.

**Not built yet**: Google sign-in, CRM push for leads, real post-chat CSAT survey, FR-R3 (turning an in-transcript correction into knowledge), CI pipeline, linting config, staging environment.

**Update (2026-09-30): moved from MySQL + Qdrant Cloud to a single PostgreSQL + pgvector database**
- This is actually a *return* to the original plan (see "Key decisions locked in" below — Postgres+pgvector was always the documented MVP-scale choice) rather than a new direction. MySQL + Qdrant were adopted mid-Phase-1 from a pasted "migration brief" that assumed a different stack context; after a cost/architecture discussion the user decided to move back, targeting a fresh AWS/Supabase deployment.
- **Why**: running app data (MySQL) and vectors (Qdrant Cloud) as two separate services means two things to provision, monitor, and pay for. Postgres+pgvector puts both in one database — one connection, one backup/HA story, one bill — and pgvector is a free extension, not a separate paid product. Research at the time (2026-09-30) also showed Qdrant Cloud's free tier is only 1GB, with paid tiers running ~$25–450/mo depending on scale, versus pgvector adding effectively nothing to an existing Postgres instance at this project's scale.
- **Local dev**: the existing `docker-compose.yml` `db` service (`pgvector/pgvector:pg16` image, host port 55432) — already there from the Phase 0 PoC, now also the real app's database. `DB_HOST/PORT/USER/PASS/NAME` in `.env` default to it.
- **Production ("when live")**: the plan is a Supabase Postgres project — same driver (`asyncpg`), same schema, just different `DB_*` values in `.env`. Not provisioned yet; no Supabase credentials have been supplied, so production deployment itself is still pending on that.
- **What changed in code**: `config.py` (`postgres_url` replacing `mysql_url`), `db.py`/`alembic/env.py` (same, just the new URL), `models.py` (`Chunk.embedding` is now a native `pgvector.sqlalchemy.Vector(384)` column; the MySQL `FULLTEXT` index replaced by a Postgres generated `tsvector` column + GIN index — the exact pattern already proven in `app/poc/db.py`), `services/retrieval.py` (hybrid search is now a single SQL query — pgvector cosine distance + `ts_rank_cd`, summed — instead of two separate Qdrant+MySQL queries fused by RRF in Python), `services/ingest.py` (embeddings are set directly on the `Chunk` row, no separate upsert call), `services/vector_store.py` deleted entirely. `pyproject.toml` dropped `aiomysql`/`pymysql`/`qdrant-client`.
- **Migrations**: since there was no real production data to preserve (only test rows from this session), the old MySQL-dialect migration history was deleted and replaced with one fresh Postgres-targeted initial migration, rather than trying to port ~8 migrations' worth of MySQL-specific DDL (e.g. `JSON_ARRAY()`, `mysql_prefix="FULLTEXT"`) to Postgres syntax.
- **A real hazard caught during this migration**: autogenerate's diff also proposed *dropping* `poc_chunks` — the unrelated Phase 0 PoC's own table, which happens to live in the same local Postgres instance. Caught before running it and hand-edited out of the migration; `poc_chunks` confirmed still present and untouched after applying.
- Verified end-to-end with real HTTP calls (not assumed): all 21 pytest tests pass against the new Postgres; a real file ingested into two different bots each answered correctly from its own fabricated content and neither could see the other's (tenant/bot isolation intact); a CSV upload (row-per-chunk tabular ingestion) also verified working on the new embedding-storage path.
- Qdrant Cloud account/data are simply no longer used by the app — nothing was deleted there, in case of rollback.

**Update (2026-09-30): dashboard visual redesign — shell ported to real code**
- After iterating a full visual redesign as a wireframe (fonts, color tokens, sidebar+topbar shell, per-bot nav, Super Admin concept, avatar, consent-gate UI, etc.), started porting the confirmed design into the actual `sanchijawab-admin` Next.js app rather than leaving it as a wireframe only.
- Done for real: Fraunces (display/headings) + Sora (body/UI) loaded via `next/font/google`; a full color-token system in `globals.css` (light + automatic dark via `prefers-color-scheme`, no manual toggle yet) wired into `tailwind.config.ts` as named colors (`bg-accent`, `text-fg-muted`, etc.); a real `WorkspaceSidebar` component (Bots/Team/Billing) and a rebuilt bot-level `layout.tsx` sidebar (real bot name fetched via `api.getBot`, real nav, real active-route highlighting); a real `ProfileMenu` component (real email via a new `/v1/auth/me` field, real logout) used everywhere the old design just had a static "AK" circle; `dashboard/page.tsx` rebuilt with a working inline "Create a new bot" form (previously nonexistent inline, only a separate form) using real data, no fabricated stats; new **Team** page backed by a real `GET /v1/workspaces/{id}/members` endpoint (not a placeholder) with a working invite form; new **Billing** page — honestly still a placeholder, since no billing backend exists at all.
- Deliberately NOT restyled yet: the inner content of Knowledge/Widget/Settings/Leads/Install/Playground/Inbox/Analytics pages — they still use the old plain Tailwind styling inside the new shell. Shell first (highest leverage, every page inherits it), inner-page restyling is the next incremental pass.
- Verified with a real Playwright run against the actual built Next.js app (not the wireframe): signup → real Fraunces font confirmed via `getComputedStyle` → created a bot through the real inline form → landed on its real settings page → bot sidebar showed the real bot name → sidebar navigation to Inbox worked → profile menu opened with the real signed-up email and a working logout → Team page showed the real member row for that account → Billing showed the honest not-built placeholder. Zero console/page errors through the whole flow.
- Landing page (public marketing homepage) is explicitly next, per the user's direction — doesn't exist at all yet, separate from this logged-in dashboard.

## Key decisions locked in (original BRD defaults, Phase 0 PoC)

- Answer model: Gemini 2.5 Flash (per-bot tier via FR-C9); fast tasks: Gemini 2.5 Flash
- Embeddings: fastembed (local, default) with Voyage/OpenAI as upgrade path
- Database: PostgreSQL 16 + pgvector for both app data and vectors at MVP scale
- Widget: Preact + Shadow DOM, <60KB gzipped
- Backend: FastAPI (async), same codebase for API and Celery worker
- Python tooling: `uv` for virtual env + dependency management (`sanchijawab-backend/pyproject.toml`), not plain venv/pip

## Not yet decided / open questions

- Final product name/domain/pricing — tracked in [SAN-1071](https://linear.app/sanchiconnect/issue/SAN-1071)
- Target evaluation sites for the 150-question eval set — [SAN-1068](https://linear.app/sanchiconnect/issue/SAN-1068)

_Update this file when a phase completes or a major decision changes — don't let it drift from Linear._
