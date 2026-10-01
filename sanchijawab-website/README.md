# SanchiJawab — marketing website

The public, 24-page marketing site for SanchiJawab. Separate Next.js app from
`sanchijawab-admin` (the product dashboard) — this one has no backend of its
own yet; forms post to stub `/app/api/*` routes that return a mock success
(`// TODO: connect backend`).

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS v3 + hand-built shadcn/ui-style
components (Radix primitives + `class-variance-authority`) + Framer Motion +
`next-themes` + MDX for the blog and legal pages.

Theming is token-based (CSS custom properties in `app/globals.css` that flip
under `prefers-color-scheme` and `[data-theme]`), matching
`sanchijawab-admin`'s design system exactly — not Tailwind's `dark:` variants.

## Running locally

```bash
npm install
npm run dev
# open http://localhost:3001 (falls back off 3000 automatically if the
# admin dashboard is already running there)
```

```bash
npm run build   # production build
npm run lint    # ESLint
```

See the repo root's `RUNNING_LOCALLY.md` for running this alongside the
admin dashboard and backend.
