# Third-Party Services

Source: BRD v1.1 §9 (LLMs, models, tools & MCP). This is the decided stack — see the BRD for full alternatives comparison.

## AI models

| Job | Chosen | Why |
|---|---|---|
| Main answer generation | Claude Sonnet 5 (`claude-sonnet-5`) via Anthropic API | Strong instruction-following, stays grounded, cites sources, reliable tool use |
| Fast tasks (query rewrite, language/intent detection, handoff classifier) | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | Low latency and cost for high-volume steps |
| Embeddings | fastembed (local, default) | Free, self-hosted, no API key needed for MVP/dev; Voyage AI or OpenAI as a paid upgrade path for higher multilingual quality |
| Reranking | Cohere Rerank (optional) | Retrieve 30, rerank to top 6 — meaningful accuracy jump for small cost |
| OCR (scanned PDFs) | Docling built-in OCR | Catalogues/brochures are often scanned |
| Moderation | Haiku-based classifier | Blocks abuse before it reaches the main model |

Model names change often — the model ID lives in `.env` (`ANSWER_MODEL`, `FAST_MODEL`), never hardcoded.

## Scraping & file processing

| Tool | Use |
|---|---|
| Crawl4AI | Main crawler — clean Markdown output, handles JS via Playwright |
| Playwright | Headless browser fallback for JS-rendered sites |
| Trafilatura / BeautifulSoup | Main-content extraction, boilerplate stripping |
| Docling | Parse PDF/DOCX/PPTX/XLSX with tables and headings, plus OCR |

## Infra & observability

| Service | Use |
|---|---|
| PostgreSQL 16 + pgvector | App data + vectors (single DB at MVP scale) |
| Redis + Celery | Job queue for crawl/embed/re-scan |
| S3-compatible storage | Uploaded files, widget bundle |
| Sentry | Error tracking |
| Langfuse | LLM tracing (prompt, chunks, tokens, latency, cost) |
| Razorpay (India) / Stripe (international) | Billing — Phase 1 (SAN-1063) |

## Not yet integrated (Phase 2/3)

CRM (HubSpot/Zoho), Shopify/WooCommerce, Google Calendar/Calendly — via MCP tool connections, gated behind visitor confirmation for any data-changing action. See [SAN-1067](https://linear.app/sanchiconnect/issue/SAN-1067).
