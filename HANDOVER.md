# SanchiJawab — handover for review and deployment

Written 2026-10-07. This is the page to read first. It says what the product does, what is finished, what is
not, and exactly what has to be provided before it can go live.

## What it is

An AI chat assistant that businesses add to their own website. The business gives it their website address and/or files;
it reads them and then answers visitors' questions only from that content, with links to the source. When it doesn't know,
it says so and offers a human. Businesses manage everything from a dashboard; the platform team manages customers from a
separate Super Admin console.

## What is finished and working

- **Accounts and teams:** sign-up with email verification, workspaces, roles (owner / admin / agent / viewer), invitations.
- **Knowledge:** crawl a website (single page, sitemap, or whole domain), upload PDF/Word/PowerPoint/Excel/CSV/text, manual
  Q&A answers that override crawled content, per-page edit/disable, scheduled re-scan.
- **Answers:** grounded in the customer's content, streamed live, replies in the visitor's language, remembers the
  conversation, source links (limit 3, can be switched off), per-bot quality level (economy / balanced / quality),
  optional re-ranking (Cohere, tested live), refuses off-topic and prompt-injection attempts, masks phone/email/card numbers.
- **Chat widget:** one small script (about 42 KB) that works on any site; colours, light/dark theme, position, mobile/desktop
  rules, hidden pages, consent notice, widget text in several languages, transcript download/email, thumbs up/down, post-chat
  rating, proactive pop-up messages (after N seconds, on scroll, on exit, on a returning visit) with A/B testing.
- **Team inbox:** live conversations, human takeover and hand-back, hand-off rules (keywords, unhappy visitor, bot unsure
  twice), routing by page/language/team and business hours, notifications (in-app, email, Slack), lead capture + CSV export
  + push to any CRM by webhook, AI-drafted reply suggestions for agents.
- **Analytics:** conversations, resolution rate, hand-offs, leads, satisfaction, top and unanswered questions with one-click
  "add answer", crawl success, first-token speed.
- **Billing:** plans, 14-day trial, usage limits (messages / pages / files / seats) enforced, Razorpay + Stripe checkout,
  GST invoices.
- **Super Admin console:** all customers and their teams, account and workspace controls, plans and limits, payment keys,
  edit legal pages and blog without a developer, platform settings (trial length, support email, default quality), full
  activity log of every change.
- **Privacy and security:** each customer's data separated (covered by automated tests), per-bot data retention and
  automatic deletion, export/erase of one visitor's data, rate limits, protection against the crawler/webhooks being aimed
  at internal addresses, escaped emails, strong-secret requirement, activity log, security headers, accessibility checked
  (dashboard and widget, automated scan with no failures).
- **Products in chat:** a product list per assistant (add by hand or import a CSV) with picture, price and link; when a visitor asks about something related the bot mentions it and shows it as a card, matched by meaning and only for clear matches.
- **Public API and MCP server:** workspace admins create API keys; with a key, other software or an AI assistant (such as Claude) can read conversations and leads and ask an assistant questions. Keys are shown once, stored hashed, revocable, rate limited.
- **Actions the assistant can take:** a business defines an action (for example "Book a demo": a name, the details to collect, and the address of its own server). When a visitor asks for it, the assistant collects the details, shows a card, and calls the business's server only after the visitor presses Confirm (read-only look-ups can skip the confirmation). Calls are signed so the business can verify them, go to public addresses only, and are logged in the dashboard.
- **Answers: own information first, web second.** The assistant always searches the customer's website, files and Q&A first. Only if none of it answers does it search Google (a per-bot switch in Bot settings, on by default), and the reply says plainly that it came from the web. Passages are cleaned of link clutter and cut to fit the search model's 512-token window (`app/services/chunker.py`); `python -m app.reindex --apply` rebuilds data indexed before that fix.
- **Team, billing details and notifications:** owners/admins manage the team and the workspace's own billing details (country/state/city dropdowns, mobile with country code, required-field checks before any payment); plans, gateway keys and the platform's GST details are edited only in the Super Admin console. Team, lead and payment events create in-app (and email) notifications, and the screens refresh by themselves.
- **Operations tools:** `scripts\backup-db.ps1` and `restore-db.ps1 -Drill` (a restore drill passed on the real database), and `python -m app.preflight`, which reads the real settings and lists in plain words what to fix before launch.
- **Quality checks:** 87 automated tests, a load test, and a 150-question quality evaluation with a saved baseline and a
  weekly GitHub check.

## Honest numbers

| Measure | Result |
|---|---|
| Automated tests | 138 pass (plus 13 checks on the WordPress plugin) |
| Answer groundedness (sampled, judged by AI) | 96 / 100 (target 90), 150-question run on 2026-10-08 |
| Questions the bot declined on 5 real sites | 16.7% (was 22%): 33% Urban Company, 30% Chumbak, 13% JECRC, 7% Motherhood India, 0% SanchiConnect |
| Time to a full answer | about 6 s median, 7.5 s slowest 5% (was 11 s median before the speed work) |
| Dashboard speed, one process | about 100-150 requests/second with no errors at 50 simultaneous users |

The two things to improve if time allows: the answer time is slow for a chat, and sites with many pages decline more
because only 40 pages were crawled in the test.

## What is NOT built (and why)

| Item | Why |
|---|---|
| Shopify app (store-listed) | The theme-extension code is written (`integrations/shopify`) but untested: it needs a Shopify Partner account. WordPress has a ready plugin zip; Webflow, Google Tag Manager, Wix and Squarespace need no plugin (step-by-step on the Install page). |
| WhatsApp, Instagram, Messenger channels | Need Meta business accounts and app review. |
| CRM (HubSpot/Zoho), Shopify/WooCommerce order lookup, calendar booking, Google Drive/Notion import | Need those companies' developer accounts. A generic webhook for leads already works. |
| Single sign-on (Google Workspace, SAML) | Needs an identity provider to test with. |
| Ready-made connectors (HubSpot, Zoho, Shopify orders, Google Calendar) | The actions engine below is built and works with any server that can receive a signed web request; the named connectors need those companies' accounts. |
| Enforced Content-Security-Policy | Written and sent in report-only mode; switch to enforcing (`CSP_ENFORCE=true`) after a click-through on the real site. |
| Multi-region / data residency | Depends on hosting. |
| Screen-reader and keyboard-only testing | Only automated accessibility scans were run. |
| Payment webhooks | If a customer pays and closes the browser before it confirms, the order stays "not completed" until they return. Needs live gateway accounts to build and test. |
| Re-ranking at full speed | The Cohere key in use is a Trial key (10 calls a minute); above that, re-ranking silently falls back to plain ranking. Use a paid key for launch. |
| Older bots' pages | "Verify Bot" and "Demo Assistant" were indexed before page text was stored; re-crawl or re-upload them to get the cleaned, correctly sized passages. |

## What must be provided before launch

These are the only things standing between "reviewed" and "live". Nothing else is blocked.

| # | What | Simple explanation | Used for |
|---|---|---|---|
| 1 | **A place to run it** (a cloud server or container service) | Where the app physically runs. Any host that can run Docker works. | `DEPLOYMENT.md` |
| 2 | **A domain name** and DNS access | The web address, e.g. `app.yourname.com`, `api.yourname.com`, and one for `widget.js`. | Public URLs in `.env` |
| 3 | **An email-sending service** (SendGrid, Amazon SES, Brevo, ...) plus the domain's email records | So verification and invitation emails arrive and don't go to spam. | `SMTP_*` |
| 4 | **Google Gemini API key** (already in use for development) | The AI that writes answers. Should be a paid key for production. | `CLOUD_API_KEY` |
| 5 | **Razorpay and/or Stripe live keys** | To take real payments. Entered in the Super Admin console, not in files. | Billing |
| 6 | **Company legal details and a lawyer's review** | Legal name, address, governing law, privacy contact. Fills the `[BRACKETS]` in the Privacy Policy and DPA drafts already in Website content. | Publishing the legal pages |
| 7 | **Sentry project** (optional) | Error reporting. Without it the app still works. | `SENTRY_DSN` |
| 8 | **Langfuse account** (optional; development one already works) | AI call tracing for debugging quality. | `LANGFUSE_*` |
| 9 | **Cohere key** (optional) | Slightly better answer ranking. A development key is in use. | `COHERE_API_KEY` |
| 10 | **A GitHub repository** | To store the code and run the weekly quality check (add `CLOUD_API_KEY` as a secret). | `.github/workflows` |
| 11 | **Decision: who are the first beta customers** | Kit in `specs/Beta-Program-Kit.md`. | Beta |

## Reviewer's quick tour (15 minutes, after `docker compose up -d --build`)

1. Open the dashboard (port 3000) and sign up with the email in `SUPERADMIN_EMAILS`.
2. Create an assistant, add a website on the Knowledge tab, wait for it to finish.
3. Ask it questions in the Playground; add a Q&A answer and see it take over.
4. Widget tab: change the colour, add a pop-up message; Install tab: copy the snippet into any HTML page served over http(s).
5. Chat from that page; open the Inbox, take over, try "Suggest reply".
6. `/staff/login`: look at customers, Website content (draft the privacy policy), Settings & activity.

## Where things are

`README.md` (setup), `RUNNING_LOCALLY.md` (daily dev), `DEPLOYMENT.md` (hosting), `knowledge.md` (build history),
`specs/` (requirements, pricing hypothesis, beta kit, legal drafts), Linear project "SanchiJawab" (every ticket and its status).
