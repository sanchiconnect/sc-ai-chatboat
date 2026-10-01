# Backend Module Specs Index

Index of `sanchijawab-backend` modules. No detailed module specs exist yet — this is a table of contents to fill in as each module is implemented, using [module.spec.template.md](module.spec.template.md).

| Module | Covers | Linear |
|---|---|---|
| Auth & workspaces | FR-A1-A3, roles | SAN-1078, SAN-1079, SAN-1080 |
| Migrations | Alembic setup | SAN-1081 |
| Crawler | FR-K1-K5, K8-K10 | SAN-1082..1084, 1087, 1088 |
| File parser | FR-K6, K7 | SAN-1085, 1086 |
| Knowledge visibility filter | FR-K13 | SAN-1089 |
| RAG orchestrator | FR-C1-C9, hybrid retrieval | SAN-1090..1097 |
| Inbox / handoff API | FR-H1-H4, FR-L1, FR-T1-T4 | SAN-1109..1113 |
| Analytics API | FR-R1-R3, KPIs | SAN-1114..1117 |
| Billing | FR-A4-A5 | SAN-1118..1120 |
| Data model & core API | §12 | SAN-1121..1124 |
| Tenant isolation & security | §7 | SAN-1125..1129 |

Write a module spec (`module.spec.template.md`) when a module's design needs to be agreed before coding, not for every trivial change.
