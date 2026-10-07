# Product name, domain and pricing hypothesis (SAN-1071)

Status: hypothesis for approval — decided 2026-10-07 by product owner (name), derived from what is already configured in the app (pricing).

## Name and domain

- **Product name:** SanchiJawab (final).
- **Domain:** not purchased yet. Needed before public launch (privacy policy, widget script URL, email sender) — tracked under SAN-1133 / SAN-1132.

## Free trial

- 14 days, no card, starts at signup (`TRIAL_DAYS` in `app/services/plan_limits.py`).
- When the trial ends, plan-gated actions return 402 until a paid plan is bought.
- "Powered by SanchiJawab" branding shows on trial/unpaid workspaces and is hidden on paid plans (FR-W9).

## Plans (as currently configured in the dashboard's Billing & plan page)

| Plan | Price shown | Purchasable today | Notes |
|---|---|---|---|
| Growth | ₹2,999 / month | No (`amount` not set yet) | "Unlimited conversations, 3 bots, priority support" |
| Enterprise | Contact us | No (sales-led) | Custom limits |
| Growth Test | ₹999 / month | Yes | A test plan used to exercise checkout; delete before launch |

Gateways: Razorpay (India, INR) and Stripe (international). GST invoices are generated for India.

## Limits the platform can enforce per plan

Messages per month, indexed pages, uploaded files, and team seats (`Plan.max_*`; empty means unlimited). The Growth plan currently has no numeric caps set, so it is effectively unlimited on every dimension, including page and file counts. Set real caps before beta.

## Open items before launch

1. Set `amount` on Growth so it becomes purchasable, and set numeric limits.
2. Decide a lower self-serve tier if beta customers find ₹2,999 too high (not decided).
3. Delete the "Growth Test" plan.
4. Buy the domain.
