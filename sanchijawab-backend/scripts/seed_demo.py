"""Creates a fresh, fully-working demo account: signs up a new user, creates
a bot, crawls a handful of real public websites into it, and runs several
real questions + a human-handoff + two leads through the actual pipeline —
so Analytics/Inbox/Leads aren't empty the first time you look.

Everything here is real: real signup, a real crawl (crawl4ai), real Gemini
answers, real Postgres rows. Nothing is fabricated/mocked.

Requires, running locally first:
    docker compose up -d db
    cd sanchijawab-backend && uv run uvicorn app.main:app --port 8000
    cd sanchijawab-backend && uv run python -m app.worker   # <- processes the crawl jobs

Usage:
    uv run python scripts/seed_demo.py
    uv run python scripts/seed_demo.py --email me@example.com --password mypassword123
    uv run python scripts/seed_demo.py --urls https://example.com,https://example.org
"""
from __future__ import annotations

import argparse
import asyncio
import random
import string
import sys
import time

import httpx

DEFAULT_URLS = [
    "https://sanchiconnect.com",
    "https://www.jecrcfoundation.com",
    "https://www.python.org",
    "https://fastapi.tiangolo.com",
    "https://en.wikipedia.org/wiki/Chatbot",
]

DEMO_QUESTIONS = [
    "What services does this business offer?",
    "Tell me more about what you do.",
    "What is Python used for?",
    "What is FastAPI?",
    "What is a chatbot?",
    "What's the weather like on Mars today?",  # expected to decline — out of scope
]


def rand_suffix(n: int = 6) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


async def wait_for_ingestion(client: httpx.AsyncClient, token: str, bot_id: str, expected: int, timeout_s: int = 240) -> None:
    print(f"Waiting for {expected} crawl job(s) to finish (needs `python -m app.worker` running) ...")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = await client.get(f"/v1/bots/{bot_id}/sources", headers={"Authorization": f"Bearer {token}"})
        sources = resp.json()
        done = sum(1 for s in sources if s["job_status"] in ("done", "failed"))
        print(f"  {done}/{len(sources)} finished...")
        if done >= expected:
            for s in sources:
                print(f"    {s['url']}: {s['job_status']}" + (f" ({s['job_error']})" if s.get("job_error") else ""))
            return
        await asyncio.sleep(5)
    print("  Timed out waiting for ingestion — is `python -m app.worker` running? Continuing anyway.")


async def chat_once(client: httpx.AsyncClient, bot_id: str, message: str, visitor_id: str) -> tuple[str | None, str, bool]:
    async with client.stream(
        "POST", f"/public/w/{bot_id}/chat",
        json={"business_name": "Demo Business", "message": message, "history": [], "visitor_id": visitor_id},
        timeout=90,
    ) as resp:
        full_text, conv_id, handoff = "", None, False
        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            import json
            event = json.loads(line[6:])
            if event["type"] == "conversation":
                conv_id = event["conversation_id"]
            elif event["type"] == "delta":
                full_text += event.get("text") or ""
            elif event["type"] == "handoff":
                handoff = True
        return conv_id, full_text, handoff


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-base", default="http://127.0.0.1:8000")
    parser.add_argument("--email", default=None, help="default: demo-<random>@example.com")
    parser.add_argument("--password", default="demo12345")
    parser.add_argument("--business-name", default="Demo Business")
    parser.add_argument("--bot-name", default="Demo Assistant")
    parser.add_argument("--urls", default=",".join(DEFAULT_URLS), help="comma-separated list of sites to crawl")
    parser.add_argument("--skip-ingestion-wait", action="store_true", help="queue crawls but don't wait/seed conversations")
    args = parser.parse_args()

    email = args.email or f"demo-{rand_suffix()}@example.com"
    urls = [u.strip() for u in args.urls.split(",") if u.strip()]

    async with httpx.AsyncClient(base_url=args.api_base) as client:
        print(f"Signing up {email} ...")
        resp = await client.post("/v1/auth/signup", json={
            "email": email, "password": args.password, "business_name": args.business_name,
        })
        resp.raise_for_status()
        signup = resp.json()
        token, workspace_id = signup["access_token"], signup["workspace_id"]

        print(f"Creating bot {args.bot_name!r} ...")
        resp = await client.post(
            f"/v1/workspaces/{workspace_id}/bots", json={"name": args.bot_name},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        bot_id = resp.json()["bot_id"]

        print(f"Queuing {len(urls)} website crawl(s) ...")
        for url in urls:
            resp = await client.post(
                "/v1/sources", json={"bot_id": bot_id, "url": url, "visibility": "customer"},
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            print(f"  queued: {url}")

        if args.skip_ingestion_wait:
            print("\n--skip-ingestion-wait set; not seeding conversations.")
        else:
            await wait_for_ingestion(client, token, bot_id, expected=len(urls))

            print("\nRunning real conversations against the crawled content ...")
            for i, q in enumerate(DEMO_QUESTIONS):
                conv_id, answer, handoff = await chat_once(client, bot_id, q, f"seed-visitor-{i}")
                print(f"  Q: {q}\n  A: {answer[:140]}{'...' if len(answer) > 140 else ''}\n")

            print("Triggering a real handoff + lead ...")
            conv_id, _, handoff = await chat_once(client, bot_id, "I'd like to speak with a real person please", "seed-visitor-handoff")
            resp = await client.post(f"/public/w/{bot_id}/lead", json={
                "conversation_id": conv_id, "name": "Demo Lead", "email": "demo.lead@example.com", "phone": "+910000000000",
            })
            resp.raise_for_status()

        print("\n" + "=" * 60)
        print("Demo account ready:")
        print(f"  Email:    {email}")
        print(f"  Password: {args.password}")
        print(f"  Bot:      {args.bot_name} ({bot_id})")
        print("=" * 60)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except httpx.HTTPStatusError as e:
        print(f"Request failed: {e.response.status_code} {e.response.text}", file=sys.stderr)
        sys.exit(1)
