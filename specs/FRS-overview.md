# FRS Overview

Functional requirements summary. Full detail: BRD v1.1 §6. Per-component detail: [backend-module-specs-index.md](backend-module-specs-index.md), [admin-module-specs-index.md](admin-module-specs-index.md), [widget-module-specs-index.md](widget-module-specs-index.md).

## Priority legend

- **Must** — needed for MVP (Phase 1)
- **Should** — needed for Phase 2
- **Could** — nice to have, Phase 3 or later

## FR groups

| Group | ID prefix | BRD section | Linear parent |
|---|---|---|---|
| Account & workspace | FR-A | §6.1 | SAN-1056, SAN-1063 |
| Knowledge ingestion (scraping & files) | FR-K | §6.2 | SAN-1057 |
| Bot configuration & conversation engine | FR-C | §6.3 | SAN-1058 |
| Chat widget | FR-W | §6.4 | SAN-1059 |
| Installation | FR-I | §6.5 | SAN-1060 |
| Inbox, handoff, leads & triggers | FR-H, FR-L, FR-T | §6.6 | SAN-1061 |
| Analytics, improvement loop & actions | FR-R, FR-X | §6.7 | SAN-1062, SAN-1067 |

Each FR ID is referenced directly in the corresponding Linear sub-task description — the BRD is the source of truth for requirement text; Linear tracks build status.
