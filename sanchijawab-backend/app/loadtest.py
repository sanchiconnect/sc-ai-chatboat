"""Load test for the non-LLM hot paths (SAN-1132).

Drives the real FastAPI app in-process (no network, no Gemini calls, so it
costs nothing and measures the app + Postgres themselves) at increasing
concurrency, and reports throughput, latency percentiles and errors per
scenario. The LLM call is the real chat bottleneck and is an external service;
its latency is tracked by the eval runner (app/eval/run.py), not here.

Usage (from sanchijawab-backend/):
    uv run python -m app.loadtest                       # default: 5s per level at 1,10,25,50 workers
    uv run python -m app.loadtest --seconds 10 --levels 1 20 100
"""
from __future__ import annotations

import argparse
import asyncio
import statistics
import time
import uuid
from collections.abc import Awaitable, Callable

from httpx import ASGITransport, AsyncClient

from .config import settings
from .db import SessionLocal, engine
from .main import app
from .services import retrieval
from .models import Bot


async def run_level(name: str, call: Callable[[], Awaitable[bool]], workers: int, seconds: float) -> dict:
    latencies: list[float] = []
    errors = 0
    stop = time.perf_counter() + seconds

    async def worker():
        nonlocal errors
        while time.perf_counter() < stop:
            t0 = time.perf_counter()
            try:
                ok = await call()
            except Exception:
                ok = False
            latencies.append(time.perf_counter() - t0)
            if not ok:
                errors += 1

    t_start = time.perf_counter()
    await asyncio.gather(*(worker() for _ in range(workers)))
    elapsed = time.perf_counter() - t_start
    latencies.sort()
    n = len(latencies)
    pct = lambda p: latencies[min(n - 1, int(n * p))] * 1000  # noqa: E731
    return {
        "scenario": name, "workers": workers, "requests": n, "rps": round(n / elapsed, 1),
        "p50_ms": round(pct(0.50)), "p95_ms": round(pct(0.95)), "p99_ms": round(pct(0.99)),
        "mean_ms": round(statistics.mean(latencies) * 1000), "errors": errors,
    }


async def main(args: argparse.Namespace) -> None:
    settings.rate_limit_enabled = False  # we're deliberately hammering the same endpoints from one "IP"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=60) as client:
        email = f"loadtest_{uuid.uuid4().hex[:8]}@example.com"
        signup = await client.post("/v1/auth/signup", json={"email": email, "password": "Passw0rd!23", "business_name": "LoadTest"})
        signup.raise_for_status()
        data = signup.json()
        headers = {"Authorization": f"Bearer {data['access_token']}"}
        bot_id = (await client.post(f"/v1/workspaces/{data['workspace_id']}/bots", json={"name": "LoadTest"}, headers=headers)).json()["bot_id"]
        await client.post(f"/v1/bots/{bot_id}/qa-pairs", json={"question": "What are your hours?", "answer": "We are open 9 to 6 on weekdays."}, headers=headers)
        async with SessionLocal() as session:
            tenant_id = (await session.get(Bot, bot_id)).tenant_id

        async def public_config() -> bool:
            return (await client.get(f"/public/w/{bot_id}/config")).status_code == 200

        async def get_bot() -> bool:
            return (await client.get(f"/v1/bots/{bot_id}", headers=headers)).status_code == 200

        async def list_bots() -> bool:
            return (await client.get(f"/v1/workspaces/{data['workspace_id']}/bots", headers=headers)).status_code == 200

        async def retrieval_only() -> bool:
            async with SessionLocal() as session:
                return len(await retrieval.hybrid_search(session, tenant_id=tenant_id, bot_id=bot_id, query="opening hours")) > 0

        scenarios = [
            ("public widget config (DB write per call)", public_config),
            ("authenticated GET bot", get_bot),
            ("authenticated list bots", list_bots),
            ("hybrid retrieval (embed + pgvector + FTS)", retrieval_only),
        ]
        results = []
        for name, call in scenarios:
            for workers in args.levels:
                r = await run_level(name, call, workers, args.seconds)
                results.append(r)
                print(
                    f"{r['scenario'][:44]:44} w={r['workers']:<4} {r['rps']:>7} rps  "
                    f"p50={r['p50_ms']}ms p95={r['p95_ms']}ms p99={r['p99_ms']}ms errors={r['errors']}",
                    flush=True,
                )

        await client.delete(f"/v1/bots/{bot_id}", headers=headers)
    await engine.dispose()
    total_err = sum(r["errors"] for r in results)
    print(f"\nTotal errors across all levels: {total_err}")
    print(f"Test account left behind: {email} (workspace 'LoadTest') — delete it from the Super Admin console if unwanted.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seconds", type=float, default=5)
    parser.add_argument("--levels", type=int, nargs="+", default=[1, 10, 25, 50])
    asyncio.run(main(parser.parse_args()))
