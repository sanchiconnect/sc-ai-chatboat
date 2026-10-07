# Beta program kit (SAN-1130)

Goal from the BRD: 10–20 beta customers using SanchiJawab on their real sites, and enough evidence to decide whether to launch publicly. Everything here is a draft for the product owner to edit; placeholders are in [BRACKETS].

## Who to recruit

Target segments, in order (the four the product's website already speaks to): e-commerce stores, SaaS companies with help docs, education / admissions teams, real-estate and local-service businesses. Aim for 3–5 per segment so one segment's quirks don't dominate.

A good beta customer: has a public website with at least 20 pages of real answers (FAQ, policies, pricing), gets repeat questions by email, chat or phone, and can give 20 minutes a week for feedback. Avoid: sites that are mostly images or behind a login, and anyone who needs an integration we haven't built (WordPress / Shopify plugins are on hold; the script tag works everywhere).

## Outreach email

Subject: Try an AI assistant that answers only from your own website — free beta

Hi [Name],

I'm [Your name] at [Company]. We built SanchiJawab, a chat assistant for your website. It reads your own pages and files, answers visitors' questions from them with links to the source, and says "I don't know" and offers your team instead of guessing.

We're inviting [10–20] businesses to a free beta: setup takes about 15 minutes (paste your website address, paste one line of code). In return we'd like 20 minutes of honest feedback a week for [4] weeks. You keep the assistant afterwards, and beta users get [OFFER, e.g. 3 months free] when we launch.

Interested? Reply and I'll set you up this week. [Link to book a 15-minute call]

[Your name]

## Onboarding checklist (per customer)

1. Create the account and workspace (or invite them); confirm the email is verified.
2. Create the assistant; set name, avatar and persona.
3. Add the website (confirm ownership) and any key PDFs; wait for the crawl and spot-check 5 pages in Knowledge.
4. Ask the assistant 10 real questions in the Playground; add Q&A pairs for anything wrong or missing.
5. Set the widget look, consent text, allowed domains (their real domain) and the handoff team and business hours.
6. Install the script on a staging page, then the live site; use "Check installation" on the Install page.
7. Give them the Inbox, Leads and Analytics tour (10 minutes).
8. Agree what "success" means for them (see below) and the weekly check-in time.
9. Tell them how to reach you and what data we keep (link to the privacy policy once published, and the retention setting).

## What we measure (success criteria)

Per customer and overall, from the product's own Analytics and the weekly eval:

- Resolution rate: share of conversations answered without a human. Target to decide: [≥ 60%].
- Unanswered questions: how many, and how many were fixed with "Add answer" in the first two weeks.
- Answer quality: no customer-reported wrong answer left uncorrected for more than [2 days]; weekly eval run shows no regression (SAN-1131).
- Leads captured per 100 conversations, and satisfaction (CSAT) average. Target to decide: [CSAT ≥ 4.0].
- Reliability: no outage longer than [1 hour]; first-token latency under [3 s] at the median. Today's measured median full answer is about 11–13 s end to end with the Gemini model, so streaming and model tier are the first things to tune.
- Customer sentiment: "Would you be disappointed if this went away?" asked at week 4. Target: [≥ 40% very disappointed].

## Weekly feedback form (outline)

1. What did the assistant get wrong this week? (paste a conversation link)
2. What did it get right that surprised you?
3. What did you have to do by hand that you expected it to do?
4. Anything confusing in the dashboard?
5. One feature that would make you pay for this.
6. Score 0–10: how likely are you to recommend it?

## Support and risk

- Shared channel (email or WhatsApp group) with a same-day reply target.
- Known gaps to tell customers up front: no WordPress/Shopify plugin yet, Sentry error tracking not set up, the privacy policy and DPA are drafts until counsel signs off (do not onboard EU customers before they are published).
- Before inviting anyone: publish the privacy policy (SAN-1133), set real plan limits, buy the domain, and run the load test on the real hosting (SAN-1132).
