# Running everything locally — quick reference

Full setup/prerequisites are in `README.md`. This is the copy-paste cheat
sheet for day-to-day "just start everything" on Windows, plus the gotchas
that actually came up running this project.

## Every time you sit down to work

```bash
# 1. Docker Desktop must be running (it does NOT survive a reboot/sleep on
#    its own) — start it, then bring up Postgres:
docker compose up -d db

# 2. Backend (terminal 1) — from sanchijawab-backend/
uv run uvicorn app.main:app --reload --port 8000
# check: curl http://localhost:8000/health -> {"status":"ok"}

# 3. Worker, if you're testing ingestion (terminal 2) — from sanchijawab-backend/
uv run python -m app.worker

# 4. Admin dashboard (terminal 3) — from sanchijawab-admin/
npm run dev
# open http://localhost:3000

# 5. Marketing website (terminal 4) — from sanchijawab-website/
npm run dev
# open http://localhost:3001 (falls back off 3000 automatically since the
# admin dashboard is already holding it — no manual port flag needed)

# 6. Widget (terminal 5, only to test the embeddable chat bubble) — from sanchijawab-widget/
npm run serve
# rebuilds dist/widget.js, then serves it on http://localhost:5500
# open http://localhost:5500/test.html — the bubble should appear bottom-right.
# Paste on your own page (served over http://, not file://):
#   <script src="http://localhost:5500/widget.js" data-bot="<bot id>" data-api="http://localhost:8000" async></script>
# No bubble? Check, in order: step 6 is running, backend (step 2) is up,
# data-bot is a real bot id in the DB you're running against, and the bot's
# allowed domains / hidden pages (Widget settings) don't exclude the page.
```

New migration after pulling changes that touched `app/models.py`:

```bash
cd sanchijawab-backend
uv run alembic upgrade head
```

## Gotchas actually hit running this project on Windows

- **`localhost:8000` "not open" but `:3000` is fine** — the backend isn't a
  background service; if its terminal was closed (or the machine
  slept/restarted Docker Desktop), it's just not running anymore. Re-run
  step 2 above. There's no supervisor restarting it for you yet.
- **Docker Desktop doesn't restart itself** after the host sleeps or the
  app is closed — `docker compose up -d db` will hang/fail with a pipe
  error until Docker Desktop itself is running again.
- **`uv run` and a plain `python`/`pip` in Git Bash can resolve to
  *different* interpreters** — `python` may resolve to the project's
  `.venv`, while `pip` resolves to a global install, so `pip install X`
  silently installs into the wrong place and `import X` then fails inside
  the venv. Always install deps by adding them to `pyproject.toml` and
  running `uv sync`, not a bare `pip install`.
- **First `uvicorn` startup after installing new/heavy dependencies is
  slow** (10–20s, no output until it's done) — give it that long before
  assuming it's hung. `curl http://localhost:8000/health` in a loop is more
  reliable than eyeballing the terminal.
- **Widget bundle testing needs a real HTTP origin, not `file://`** — serve
  `sanchijawab-widget/dist/` with e.g. `python -m http.server`, per the main
  README's troubleshooting section.
- **Admin "Log out" redirects to the marketing site**, not back to its own
  `/login` — the target comes from `NEXT_PUBLIC_MARKETING_URL` in
  `sanchijawab-admin/.env.local` (defaults to `http://localhost:3001`). If
  the website dev server is running on a different port, update that var or
  the logout button will 404.

## Payments (Razorpay/Stripe) — test mode specifics

- Gateway credentials live in the `payment_gateways` table, not `.env` —
  set them from **Billing & plan → Payment gateways** in the dashboard
  (super admin only), not by editing the backend directly.
- `PAYMENT_SECRET_KEY` in `.env` encrypts those credentials at rest — it
  must be set before you can save gateway credentials (see `.env.example`
  for how to generate one). Losing/rotating it makes already-stored
  credentials unreadable.
- `PAYMENT_MODE` in `.env` is `test` or `live`, global for now (applies to
  every order). Keep it on `test` until you have real Razorpay/Stripe test
  keys to exercise the full checkout → confirm flow end-to-end.
