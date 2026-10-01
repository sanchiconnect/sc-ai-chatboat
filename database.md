# Database

PostgreSQL 16 + pgvector. Source of truth: BRD §12 (Data model & APIs). Implementation tracked in Linear as [SAN-1064](https://linear.app/sanchiconnect/issue/SAN-1064) (schema) and [SAN-1081](https://linear.app/sanchiconnect/issue/SAN-1081) (Alembic migrations).

## Key tables

| Table | Important fields |
|---|---|
| `workspace` | owner, billing plan, created_at |
| `bot` | workspace_id, name, persona, instructions, model tier |
| `source` | id, bot_id, type (website/file/qa/connector), visibility (customer/internal), url or file_key, mode, include/exclude patterns, max_pages (≤5,000), rescan_interval_days (5-365), next_scan_at, status, stats json |
| `document` | id, source_id, url, title, markdown, content_hash, language, status, error, last_crawled_at |
| `chunk` | id, bot_id, document_id, visibility (copied from source for fast filtering), text, heading_path, token_count, `embedding vector(1024)`, tsvector for keyword search |
| `qa_pair` | bot_id, question, answer — overrides crawled content on conflict |
| `conversation` | id, bot_id, visitor_id, status (bot/waiting/human/closed), assigned_agent_id, page_url, language, rating, started_at |
| `message` | id, conversation_id, role (visitor/bot/agent/system), content, sources json, confidence, tokens_in, tokens_out, cost |
| `widget_config` | bot_id, theme, primary_color, texts json, position, offsets, devices, hidden_paths, consent_text, locale |
| `tool_connection` | id, bot_id, kind (mcp/webhook), server_url, encrypted_credentials, enabled_tools[], requires_confirmation |
| `lead` | conversation_id, name, email, phone, pushed_to_crm |

## Rules

- Every row that belongs to a tenant carries `tenant_id`/`bot_id` and every query — including vector search — filters on it. See [SAN-1125](https://linear.app/sanchiconnect/issue/SAN-1125).
- `chunk.visibility` is copied from the parent `source` at ingest time so retrieval never has to join back to check visibility.
- `embedding` dimension must match `EMBED_DIM` in `.env` — changing embedding models means a fresh database or a re-embed migration.
- Migrations are managed with Alembic from the start; tables are never auto-created in a shared/staging/prod environment.

_Status: planning reference — no tables created yet._
