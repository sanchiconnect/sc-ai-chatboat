# Business Perspective: Major Modules

Source: BRD v1.1 §3 (Scope & phases).

## In scope

Website crawling (single URL, sitemap, whole domain with limits); knowledge file upload (PDF/DOCX/PPTX/TXT/MD/CSV/TSV/XLSX) and manual Q&A pairs; customer-facing vs internal-only knowledge; processing pipeline (clean, chunk, embed, index, scheduled re-scan); bot persona/instructions/guardrails/fallback; embeddable chat widget with brand customisation; install via snippet/WordPress/Shopify/GTM; shared inbox with handoff, lead capture, proactive messages; analytics and unanswered-question reports; tool calling via MCP; subscription billing.

## Out of scope for v1

Voice calls and phone IVR; WhatsApp/Instagram/Messenger channels (phase 3); full ticketing/help-desk with SLAs; in-chat checkout and payment collection; crawling content behind a login (except via customer-provided API/MCP); on-premise deployment.

## Release phases → Linear milestones

| Phase | Name | Contents | Linear milestone |
|---|---|---|---|
| 0 | Proof of concept | Crawl one site, upload a PDF, ask questions in a bare test page. Prove answer quality and latency. | [Phase 0 – Discovery & Proof of Concept](https://linear.app/sanchiconnect/project/sanchijawab-19a528ede84c) |
| 1 | MVP | Sign-up, knowledge sources, bot settings, widget customiser, install code, playground, basic inbox, basic analytics, billing. | Phase 1 – MVP Build |
| — | Beta & launch | 10-20 beta customers, weekly evals, load test, security review, privacy policy/DPA, public launch. | Phase 1 – Beta & Launch |
| 2 | Growth | Human handoff routing, proactive triggers, lead forms, MCP tools (CRM, Shopify, calendar), WordPress/Shopify plugins, multilingual UI. | Phase 2 – Growth |
| 3 | Scale | Messaging channels, agent copilot suggestions, public MCP server, SSO, audit logs, data residency. | Phase 3 – Scale |

## Major modules → components

| Module (BRD FR group) | Lives in | Linear parent issue |
|---|---|---|
| Account & workspace | `sanchijawab-backend` + `sanchijawab-admin` | SAN-1056 |
| Knowledge ingestion | `sanchijawab-backend` | SAN-1057 |
| Bot config & RAG engine | `sanchijawab-backend` | SAN-1058 |
| Chat widget | `sanchijawab-widget` | SAN-1059 |
| Installation | `sanchijawab-backend` (allow-list) + `sanchijawab-admin` (install page) | SAN-1060 |
| Inbox, handoff, leads | `sanchijawab-backend` + `sanchijawab-admin` | SAN-1061 |
| Analytics & improvement loop | `sanchijawab-backend` + `sanchijawab-admin` | SAN-1062 |
| Billing | `sanchijawab-backend` + `sanchijawab-admin` | SAN-1063 |
