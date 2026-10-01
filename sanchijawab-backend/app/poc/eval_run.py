"""Phase 0 PoC (SAN-1074): run the 150-question eval set end to end.

For every question: hybrid search (scoped to its site) -> grounded answer,
timing both. Writes one JSON line per question to eval_results.jsonl, then
prints summary stats (latency, decline rate per site).

Also runs an LLM-judge groundedness check on a sample (2 questions/site,
BRD §2's "answer groundedness ... sampled eval" KPI) rather than judging
all 150, which would just be a second full pass of paid calls for a Phase 0
PoC.

Usage:
    uv run python -m app.poc.eval_run
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

from .ask import answer, hybrid_search
from .db import get_connection

QUESTIONS_PATH = Path(__file__).parent / "eval_questions.json"
RESULTS_PATH = Path(__file__).parent / "eval_results.jsonl"

DECLINE_MARKERS = (
    "don't have information",
    "do not have information",
    "don't know",
    "do not know",
    "no information",
    "cannot find",
    "can't find",
    "unable to find",
)

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


def is_decline(text: str) -> bool:
    low = text.lower()
    return any(marker in low for marker in DECLINE_MARKERS)


def judge_groundedness(passages_text: str, answer_text: str) -> int | None:
    api_key = os.environ.get("CLOUD_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
            contents=JUDGE_PROMPT.format(passages=passages_text, answer=answer_text),
        )
        return int("".join(ch for ch in resp.text if ch.isdigit())[:3] or 0)
    except Exception as e:
        print(f"    (judge failed: {e})")
        return None


async def main() -> None:
    questions = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    conn = await get_connection()

    results = []
    judged_count: dict[str, int] = {}
    try:
        for i, item in enumerate(questions, 1):
            site, question = item["site"], item["q"]
            t0 = time.perf_counter()
            passages = await hybrid_search(site, question, conn=conn)
            t1 = time.perf_counter()
            ans = answer(question, passages) if passages else "(no chunks for this site)"
            t2 = time.perf_counter()

            declined = is_decline(ans)
            # Full text, not truncated — the judge must see everything the
            # answer-writer saw, or it flags genuinely-grounded claims as
            # unsupported just because it can't verify them.
            passages_text = "\n".join(f"[{j}] {p['text']}" for j, p in enumerate(passages, 1))

            # Sample 2 per site for LLM-judge groundedness.
            judged_count.setdefault(site, 0)
            groundedness = None
            if passages and judged_count[site] < 2:
                groundedness = judge_groundedness(passages_text, ans)
                judged_count[site] += 1

            row = {
                "site": site,
                "question": question,
                "search_latency_s": round(t1 - t0, 3),
                "answer_latency_s": round(t2 - t1, 3),
                "declined": declined,
                "top_url": passages[0]["url"] if passages else None,
                "answer": ans,
                "groundedness_score": groundedness,
            }
            results.append(row)
            print(f"[{i}/{len(questions)}] {site}: {question[:50]!r} "
                  f"-> {'DECLINED' if declined else 'answered'} "
                  f"({row['search_latency_s'] + row['answer_latency_s']:.2f}s)"
                  + (f" groundedness={groundedness}" if groundedness is not None else ""))
    finally:
        await conn.close()

    RESULTS_PATH.write_text(
        "\n".join(json.dumps(r) for r in results) + "\n", encoding="utf-8"
    )

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    by_site: dict[str, list[dict]] = {}
    for r in results:
        by_site.setdefault(r["site"], []).append(r)

    all_latencies = [r["search_latency_s"] + r["answer_latency_s"] for r in results]
    all_scores = [r["groundedness_score"] for r in results if r["groundedness_score"] is not None]

    for site, rows in by_site.items():
        n = len(rows)
        declined = sum(r["declined"] for r in rows)
        latencies = [r["search_latency_s"] + r["answer_latency_s"] for r in rows]
        scores = [r["groundedness_score"] for r in rows if r["groundedness_score"] is not None]
        print(f"{site}: {n} questions, {declined} declined ({declined/n:.0%}), "
              f"avg latency {sum(latencies)/n:.2f}s"
              + (f", sampled groundedness avg {sum(scores)/len(scores):.0f}/100" if scores else ""))

    print(f"\nOverall: {len(results)} questions, "
          f"avg total latency {sum(all_latencies)/len(all_latencies):.2f}s, "
          f"decline rate {sum(r['declined'] for r in results)/len(results):.0%}")
    if all_scores:
        print(f"Sampled groundedness (n={len(all_scores)}): avg {sum(all_scores)/len(all_scores):.0f}/100, "
              f"min {min(all_scores)}, max {max(all_scores)}")
    print(f"\nFull results written to {RESULTS_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
