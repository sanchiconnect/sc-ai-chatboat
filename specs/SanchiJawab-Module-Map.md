# SanchiJawab Module Map

Maps BRD functional requirement groups to the three product components and their Linear tracking. See also [Business-Perspective-Major-Modules.md](Business-Perspective-Major-Modules.md) for the phase-level view.

```
sanchijawab-backend/   FastAPI app + Celery worker
  ├─ auth, workspaces, roles          (FR-A1-A3)        SAN-1078, SAN-1079, SAN-1080
  ├─ crawler + file parsers           (FR-K1-K13)        SAN-1082..1089
  ├─ RAG orchestrator + guardrails    (FR-C1-C9)         SAN-1090..1097
  ├─ inbox / handoff / leads API      (FR-H, FR-L, FR-T) SAN-1109..1113
  ├─ analytics API                    (FR-R)             SAN-1114..1117
  ├─ billing                          (FR-A4-A5)         SAN-1118..1120
  └─ data model + core API            (§12)              SAN-1121..1124

sanchijawab-admin/     Next.js dashboard
  ├─ onboarding, knowledge UI
  ├─ bot settings UI                  (FR-C1, C6, C8, C9)
  ├─ widget customiser UI             (FR-W1-W9)
  ├─ install page UI                  (FR-I1-I4)
  ├─ inbox UI                         (FR-H1)
  ├─ analytics UI                     (FR-R1-R3)
  └─ team & billing UI                (FR-A3-A5)

sanchijawab-widget/    Preact + Shadow DOM, served from CDN
  └─ chat widget                      (FR-W1-W10)        SAN-1098..1104
```

Cross-cutting (not owned by one component): tenant isolation, security, privacy, AI safety, observability — [SAN-1065](https://linear.app/sanchiconnect/issue/SAN-1065); data model — [SAN-1064](https://linear.app/sanchiconnect/issue/SAN-1064).
