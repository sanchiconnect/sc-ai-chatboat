# SanchiJawab Repo Map

Single repo (revised 2026-09-29) — unlike SanchiSaas, whose `sc-saas-admin`/`sc-saas-backend`/`sc-saas-frontend` really are separately cloned repos, SanchiJawab's three product folders below are tracked in this one repo. `.gitignore` only excludes build artifacts (`.venv/`, `node_modules/`, etc.) and secrets (`.env`), not the folders themselves.

```
SanchiJawab/
├── .claude/                    Claude Code config (agents/, commands/, hooks/ — empty scaffolding, fill as needed)
├── .vscode/                    Editor settings
├── README.md                   Project overview, quick start
├── AGENTS.md                   Instructions for AI coding agents
├── AI-NATIVE-SETUP.md          How this repo is wired for AI-assisted development
├── CLAUDE.md                   Claude Code project instructions
├── ONBOARDING.md               New contributor / business onboarding flow
├── api.md                      API surface reference
├── database.md                 Postgres/pgvector schema reference
├── design.md                   System architecture
├── knowledge.md                Living project status doc
├── docker-compose.yml          db (pgvector), redis, api, worker, dashboard
├── .env.example / .env         Config (see database.md's tenant-isolation note before editing)
├── specs/                      Planning docs (this folder) — BRD-derived, kept in sync with Linear
│   ├── product-overview/       ui-ux.md — cross-cutting design principles
│   ├── features/               Per-feature specs, written as Phase 1+ features are built (empty for now)
│   ├── bug-fixes/              Per-bug specs, written as bugs are triaged (empty for now)
│   ├── test-cases/             Test case docs (empty for now)
│   ├── feature.spec.template.md / module.spec.template.md   Templates — copy, don't edit in place
│   └── spec-authoring-practices.md
├── sanchijawab-backend/        FastAPI API + Celery worker (Python, uv-managed via pyproject.toml)
├── sanchijawab-admin/           Next.js dashboard (npm)
└── sanchijawab-widget/          Preact + Vite embeddable widget (npm)
```

Source of truth for requirements: the SanchiJawab BRD v1.1 (not checked into this repo — attach when available). Source of truth for build status: [Linear project P-SAN-62](https://linear.app/sanchiconnect/project/sanchijawab-19a528ede84c).
