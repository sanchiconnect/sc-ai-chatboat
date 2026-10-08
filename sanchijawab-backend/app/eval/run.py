"""Evaluation-set regression runner (SAN-1131).

Runs the 150-question eval set (5 sites x 30, app/poc/eval_questions.json)
through the REAL product pipeline (bot -> hybrid retrieval -> Gemini answer),
not the Phase 0 PoC scripts, then compares against a saved baseline and exits
non-zero if quality regressed. Used weekly by .github/workflows/eval-weekly.yml.

Each site gets its own bot in a dedicated "SanchiJawab Eval" workspace, crawled
once and reused on later runs (pass --recrawl to refresh the knowledge).

Usage (from sanchijawab-backend/):
    uv run python -m app.eval.run --save-baseline      # first run: record the baseline
    uv run python -m app.eval.run                      # later: compare against it
    uv run python -m app.eval.run --questions-per-site 3 --skip-judge   # quick smoke test
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, select

from ..timeutil import utcnow
from ..config import settings
from ..db import SessionLocal
from ..models import Bot, Chunk, IngestJob, Source, Workspace
from ..services import retrieval
from ..services.ingest import ingest_website_source
from ..services.rag import answer_stream

HERE = Path(__file__).parent
QUESTIONS_PATH = HERE.parent / "poc" / "eval_questions.json"
BASELINE_PATH = HERE / "baseline.json"
LAST_RUN_PATH = HERE / "last_run.json"

EVAL_WORKSPACE = "SanchiJawab Eval"
EVAL_TENANT = "eval-tenant"
CRAWL_PAGES = 40

# A run fails when it is meaningfully worse than the baseline.
MAX_DECLINE_RATE_INCREASE = 0.10   # absolute, e.g. 17% -> 27%
MIN_GROUNDEDNESS = 90              # BRD gate
MAX_LATENCY_FACTOR = 2.0           # p50 total latency vs baseline

JUDGE_PROMPT = """You are grading a RAG system for factual groundedness.
Given the retrieved passages and the answer, score 0-100: does every claim
in the answer trace back to the passages (100), or does it add unsupported
information (lower score)? If the answer correctly declines due to missing
information, score 100. Reply with ONLY the integer score, nothing else.

<passages>
{passages}
</passages>

<answer>
{answer}
</answer>"""


async def get_or_create_bot(session, site: str, recrawl: bool) -> Bot:
    ws = (await session.execute(select(Workspace).where(Workspace.name == EVAL_WORKSPACE))).scalar_one_or_none()
    if ws is None:
        ws = Workspace(name=EVAL_WORKSPACE, tenant_id=EVAL_TENANT)
        session.add(ws)
        await session.flush()
    name = f"eval-{site}"
    bot = (await session.execute(select(Bot).where(Bot.workspace_id == ws.id, Bot.name == name))).scalar_one_or_none()
    if bot is None:
        bot = Bot(tenant_id=ws.tenant_id, workspace_id=ws.id, name=name)
        session.add(bot)
        await session.flush()
    # The eval measures answers grounded in the crawled site. A web-search answer would be judged against
    # passages it never used, so the online fallback is always off for these bots.
    bot.web_fallback = False
    await session.commit()

    chunk_count = (await session.execute(select(func.count()).select_from(Chunk).where(Chunk.bot_id == bot.id))).scalar_one()
    if chunk_count == 0 or recrawl:
        print(f"  crawling https://{site} (up to {CRAWL_PAGES} pages) ...", flush=True)
        source = (
            await session.execute(select(Source).where(Source.bot_id == bot.id, Source.type == "website"))
        ).scalar_one_or_none()
        if source is None:
            source = Source(
                tenant_id=bot.tenant_id, bot_id=bot.id, type="website", url=f"https://{site}",
                visibility="customer", status="pending", ownership_confirmed=True,
                mode="whole_domain", max_pages=CRAWL_PAGES,
            )
            session.add(source)
            await session.commit()
        job = IngestJob(tenant_id=bot.tenant_id, source_id=source.id, status="running")
        session.add(job)
        await session.commit()
        stats = await ingest_website_source(session, source, job=job)
        job.status = "done"
        source.status = "indexed"
        await session.commit()
        print(f"  crawled: {stats}", flush=True)
    return bot


async def ask(session, bot: Bot, question: str) -> dict:
    t0 = time.perf_counter()
    first = None
    text = ""
    done: dict = {}
    handoff = False
    trace: dict = {}
    async for event in answer_stream(
        session, tenant_id=bot.tenant_id, bot_id=bot.id, business_name=bot.name, message=question, trace=trace,
    ):
        if event["type"] == "delta":
            if first is None:
                first = time.perf_counter() - t0
            text += event["text"]
        elif event["type"] == "done":
            done = event
        elif event["type"] == "handoff":
            handoff = True
    return {
        "answer": text, "declined": bool(done.get("no_answer")) or not text, "handoff": handoff,
        "sources": [s["url"] for s in done.get("sources", [])],
        "first_token_s": round(first, 3) if first is not None else None,
        "total_s": round(time.perf_counter() - t0, 3),
        # what the model was actually shown (the judge must check the answer against THIS, not a different search)
        "_passages": [c["text"] for c in trace.get("chunks", [])],
    }


def judge(passages_text: str, answer: str) -> int | None:
    try:
        from google import genai

        client = genai.Client(api_key=settings.cloud_api_key)
        resp = client.models.generate_content(
            model=settings.gemini_model, contents=JUDGE_PROMPT.format(passages=passages_text, answer=answer)
        )
        digits = "".join(ch for ch in resp.text if ch.isdigit())[:3]
        return int(digits) if digits else None
    except Exception as e:  # a judge hiccup shouldn't fail the whole run
        print(f"    (judge failed: {e})")
        return None


def summarise(rows: list[dict]) -> dict:
    scores = [r["groundedness"] for r in rows if r.get("groundedness") is not None]
    totals = [r["total_s"] for r in rows]
    by_site: dict[str, dict] = {}
    for site in sorted({r["site"] for r in rows}):
        s = [r for r in rows if r["site"] == site]
        by_site[site] = {"n": len(s), "decline_rate": round(sum(r["declined"] for r in s) / len(s), 3)}
    return {
        "n": len(rows),
        "decline_rate": round(sum(r["declined"] for r in rows) / len(rows), 3),
        "groundedness_avg": round(sum(scores) / len(scores), 1) if scores else None,
        "groundedness_n": len(scores),
        "p50_total_s": round(statistics.median(totals), 2),
        "p95_total_s": round(sorted(totals)[int(len(totals) * 0.95) - 1], 2) if len(totals) > 1 else totals[0],
        "by_site": by_site,
    }


def compare(current: dict, baseline: dict) -> list[str]:
    problems = []
    if current["decline_rate"] > baseline["decline_rate"] + MAX_DECLINE_RATE_INCREASE:
        problems.append(
            f"decline rate rose {baseline['decline_rate']:.0%} -> {current['decline_rate']:.0%} "
            f"(allowed +{MAX_DECLINE_RATE_INCREASE:.0%})"
        )
    if current["groundedness_avg"] is not None and current["groundedness_avg"] < MIN_GROUNDEDNESS:
        problems.append(f"sampled groundedness {current['groundedness_avg']} is below {MIN_GROUNDEDNESS}")
    if current["p50_total_s"] > baseline["p50_total_s"] * MAX_LATENCY_FACTOR:
        problems.append(f"median latency {baseline['p50_total_s']}s -> {current['p50_total_s']}s (over {MAX_LATENCY_FACTOR}x)")
    return problems


async def main(args: argparse.Namespace) -> int:
    questions = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    sites = [s for s in dict.fromkeys(q["site"] for q in questions) if not args.sites or s in args.sites]
    rows: list[dict] = []

    for site in sites:
        print(f"\n== {site}", flush=True)
        site_qs = [q["q"] for q in questions if q["site"] == site][: args.questions_per_site]
        async with SessionLocal() as session:
            bot = await get_or_create_bot(session, site, args.recrawl)
            judged = 0
            for i, question in enumerate(site_qs, 1):
                res = await ask(session, bot, question)
                passages = res.pop("_passages")
                row = {"site": site, "question": question, **res, "groundedness": None}
                if not args.skip_judge and not res["declined"] and judged < 2:
                    row["groundedness"] = judge("\n".join(f"[{j}] {p}" for j, p in enumerate(passages, 1)), res["answer"])
                    judged += 1
                rows.append(row)
                state = "HANDOFF" if res["handoff"] else "declined" if res["declined"] else "answered"
                print(f"[{i}/{len(site_qs)}] {question[:55]!r} -> {state} ({res['total_s']}s)", flush=True)

    summary = summarise(rows)
    LAST_RUN_PATH.write_text(
        json.dumps({"run_at": utcnow().isoformat(), "summary": summary, "rows": rows}, indent=1), encoding="utf-8"
    )
    print("\n" + json.dumps(summary, indent=1))

    if args.save_baseline:
        BASELINE_PATH.write_text(json.dumps({"saved_at": utcnow().isoformat(), **summary}, indent=1), encoding="utf-8")
        print(f"\nBaseline saved to {BASELINE_PATH}")
        return 0
    if not BASELINE_PATH.exists():
        print("\nNo baseline yet — run with --save-baseline first.")
        return 0

    problems = compare(summary, json.loads(BASELINE_PATH.read_text(encoding="utf-8")))
    if problems:
        print("\nREGRESSION DETECTED:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("\nNo regression against the baseline.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sites", nargs="*", help="only these sites (default: all 5)")
    parser.add_argument("--questions-per-site", type=int, default=30)
    parser.add_argument("--recrawl", action="store_true")
    parser.add_argument("--skip-judge", action="store_true")
    parser.add_argument("--save-baseline", action="store_true")
    sys.exit(asyncio.run(main(parser.parse_args())))
