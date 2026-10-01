"""One-off: re-judge the already-sampled groundedness questions from
eval_results.jsonl with the corrected (full-passage-text) judge, without
re-running the full 150-question search+answer pass.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from .ask import hybrid_search
from .db import get_connection
from .eval_run import judge_groundedness

RESULTS_PATH = Path(__file__).parent / "eval_results.jsonl"


async def main() -> None:
    rows = [json.loads(l) for l in RESULTS_PATH.read_text(encoding="utf-8").splitlines()]
    conn = await get_connection()
    try:
        for r in rows:
            if r["groundedness_score"] is None:
                continue
            passages = await hybrid_search(r["site"], r["question"], conn=conn)
            passages_text = "\n".join(f"[{j}] {p['text']}" for j, p in enumerate(passages, 1))
            new_score = judge_groundedness(passages_text, r["answer"])
            print(f"{r['site']}: {r['question'][:50]!r} old={r['groundedness_score']} new={new_score}")
            r["groundedness_score"] = new_score
    finally:
        await conn.close()

    RESULTS_PATH.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")

    scores = [r["groundedness_score"] for r in rows if r["groundedness_score"] is not None]
    print(f"\nCorrected sampled groundedness (n={len(scores)}): avg {sum(scores)/len(scores):.0f}/100, "
          f"min {min(scores)}, max {max(scores)}")


if __name__ == "__main__":
    asyncio.run(main())
