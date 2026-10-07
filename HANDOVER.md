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
- **Quality checks:** 74 automated tests, a load test, and a 150-question quality evaluation with a saved baseline and a
  weekly GitHub check.

## Honest numbers

| Measure | Result |
|---|---|
| Automated tests | 74 pass |
| Answer groundedness (sampled, judged by AI) | 97 / 100 (target 90) |
| Questions the bot declined on 5 real sites | 22% (43% on one clothing-brand site, 10% on the best) |
| Time to a full answer | 11 s median, 17 s slowest-5% |
| Dashboard speed, one process | about 100-150 requests/second with no errors at 50 simultaneous users |

The two things to improve if time allows: the answer time is slow for a chat, and sites with many pages decline more
because only 40 pages were crawled in the test.

## What is NOT built (and why)

| Item | Why |
|---|---|
| WordPress, Shopify, Webflow, Google Tag Manager installers | On hold. The pasted snippet works on all of them; plugins are convenience. |
| WhatsApp, Instagram, Messenger channels | Need Meta business accounts and app review. |
| CRM (HubSpot/Zoho), Shopify/WooCommerce order lookup, calendar booking, Google Drive/Notion import | Need those companies' developer accounts. A generic webhook for leads already works. |
| Single sign-on (Google Workspace, SAML) | Needs an identity provider to test with. |
| Public API keys / MCP server, product cards in chat, "bot takes actions" engine | Designed in the project plan, not started. |
| Content-Security-Policy header | Needs the real website addresses. |
| Multi-region / data residency | Depends on hosting. |
| Screen-reader and keyboard-only testing | Only automated accessibility scans were run. |

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
