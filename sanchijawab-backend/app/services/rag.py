"""RAG orchestration: fast-tier intent/rewrite -> hybrid retrieval ->
main-tier streamed grounded answer -> citation parsing.

Yields a stream of small dict events so a router can turn each into an
SSE delta without this module knowing anything about HTTP/SSE framing.
"""
from __future__ import annotations

import asyncio
import contextlib
import re
from collections.abc import AsyncIterator

from langfuse import propagate_attributes
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import SessionLocal
from ..models import Bot, Conversation
from . import actions as actions_svc
from . import llm, products, retrieval
from .tracing import get_langfuse

DECLINE_MARKERS = (
    "don't have information", "do not have information", "don't know",
    "do not know", "no information", "cannot find", "can't find",
)
# Also catches the common phrasings the plain markers miss, e.g. "I don't have any information
# about…", "I couldn't find…", "I'm unable to find…", "there is no specific information…".
_DECLINE_RE = re.compile(
    r"(?:don't|do not|doesn't|does not|didn't|did not|no)\s+(?:currently\s+)?(?:have\s+|hold\s+)?(?:any\s+|enough\s+)?"
    r"(?:specific\s+|relevant\s+|further\s+|reliable\s+)?(?:information|details|data)"
    r"|(?:can't|cannot|can not|couldn't|could not|unable to|not able to)\s+(?:find|locate)",
    re.IGNORECASE,
)


def _is_decline(text: str) -> bool:
    low = text.lower()
    return any(m in low for m in DECLINE_MARKERS) or bool(_DECLINE_RE.search(text))


# How much of an answer is held back, for a moment, to see whether it is really a "no answer"
# (about 15 tokens). Long enough to catch the first sentence of a decline, short enough not to be felt.
PEEK_CHARS = 70
GENERIC_DECLINE = "I don't have information about that yet. I can connect you with the team if you'd like."

_SEARCH_NOISE = {"com", "www", "http", "https", "eval"}


def _brand_words(*names: str) -> set[str]:
    words = {w for name in names for w in re.findall(r"[a-z0-9]+", (name or "").lower())}
    return {w for w in words if len(w) >= 4} - _SEARCH_NOISE


def _without_brand(query: str, brand: set[str]) -> str:
    """The question with the business's own name removed. Visitors often add it ("Associate Director
    Tech sanchiconnect"), but the name is on almost every page, so it drowns out the words that
    actually identify the right passage."""
    kept = [w for w in re.findall(r"\S+", query) if re.sub(r"[^a-z0-9]", "", w.lower()) not in brand]
    return " ".join(kept)


def _merge_chunks(primary: list[dict], extra: list[dict], limit: int = 10) -> list[dict]:
    """Interleaves two ranked result lists (best of each first), without repeats."""
    seen: set[str] = set()
    merged: list[dict] = []
    for pair in zip(extra + [None] * len(primary), primary + [None] * len(extra)):
        for c in pair:
            if c is not None and c["chunk_id"] not in seen:
                seen.add(c["chunk_id"])
                merged.append(c)
    return merged[:limit]


def _round_robin(lists: list[list[dict]], limit: int = 10) -> list[dict]:
    """Takes the best of each ranked list in turn (1st of each, then 2nd of each, ...), without repeats."""
    seen: set[str] = set()
    merged: list[dict] = []
    for rank in range(max((len(l) for l in lists), default=0)):
        for lst in lists:
            if rank < len(lst) and lst[rank]["chunk_id"] not in seen:
                seen.add(lst[rank]["chunk_id"])
                merged.append(lst[rank])
    return merged[:limit]


async def _head_then_rest(stream: AsyncIterator[str], peek: int = PEEK_CHARS):
    """Releases the first `peek` characters of a stream as one ("head", text) piece, then every later
    piece as ("delta", text). Lets the caller judge how an answer begins before showing any of it."""
    buf = ""
    released = False
    async for d in stream:
        if released:
            yield ("delta", d)
            continue
        buf += d
        if len(buf) >= peek:
            released = True
            yield ("head", buf)
    if not released:
        yield ("head", buf)


async def _web_flow(*, business_name: str, language: str, message: str, persona: str, instructions: str,
                    summary: str, model_tier: str, out: dict) -> AsyncIterator[dict]:
    """Second choice after the knowledge base: a Google-Search-grounded answer, labelled as such.
    Yields delta events. `out["ok"]` is False when the web had nothing usable, in which case nothing
    was yielded and the caller shows its normal "I don't know"."""
    out.update(ok=False, text="", sources=[])
    sources: list[dict] = []
    stream = llm.stream_web_answer(
        business_name, language, message, persona, instructions, summary, model_tier, sources_out=sources,
    )
    text = ""
    async with contextlib.aclosing(stream), contextlib.aclosing(_head_then_rest(stream)) as pieces:
        async for kind, piece in pieces:
            if kind == "head":
                if not piece.strip() or _is_decline(piece):
                    return
                notice = llm.WEB_NOTICE.format(business=business_name)
                text = notice + piece
                yield {"type": "delta", "text": text}
            else:
                text += piece
                yield {"type": "delta", "text": piece}
    out.update(ok=bool(text), text=text, sources=[{"url": s["url"], "chunk_id": ""} for s in sources])


MAX_SOURCES = 3


def pick_sources(chunks: list[dict], limit: int = MAX_SOURCES) -> list[dict]:
    """Source links shown under an answer: unique page URLs from the
    best-ranked chunks, capped. Showing every retrieved chunk (6) made a
    one-line answer look like it cited half the site."""
    sources: list[dict] = []
    seen: set[str] = set()
    for c in chunks:
        url = c.get("url")
        if url and url not in seen:
            seen.add(url)
            sources.append({"url": url, "chunk_id": c["chunk_id"]})
            if len(sources) == limit:
                break
    return sources


async def _search_own_session(tenant_id: str, bot_id: str, query: str, rerank: bool = True) -> list[dict]:
    async with SessionLocal() as s:
        return await retrieval.hybrid_search(s, tenant_id=tenant_id, bot_id=bot_id, query=query, rerank=rerank)


def _keyword_list(raw: str) -> list[str]:
    """handoff_keywords is stored as one string, newline- or comma-
    separated — same convention as Source.include_patterns."""
    if not raw:
        return []
    return [p.strip().lower() for p in re.split(r"[\n,]+", raw) if p.strip()]


async def answer_stream(
    session: AsyncSession,
    *,
    tenant_id: str,
    bot_id: str,
    business_name: str,
    message: str,
    history: list[dict] | None = None,
    conversation_id: str | None = None,
    visitor_id: str | None = None,
    trace: dict | None = None,
) -> AsyncIterator[dict]:
    """`trace`, when given, is filled with what the answer was based on (trace["chunks"]) so tests and the
    quality evaluation can check the answer against the passages the model really saw."""
    history = history or []

    # Conversation memory beyond the last 10 turns (SAN-1093, FR-C5): the
    # widget sends its full local history on every request, but only the
    # most recent 10 turns go to the model directly — anything older is
    # folded into a rolling per-conversation summary instead of being
    # dropped outright. Only the *newly* overflowed slice gets summarized
    # each time (summary_msg_count tracks how much is already folded in),
    # so cost doesn't grow with conversation length.
    summary_context = ""
    older = history[:-10] if len(history) > 10 else []
    if older and conversation_id:
        conv = await session.get(Conversation, conversation_id)
        if conv is not None:
            if len(older) > conv.summary_msg_count:
                newly_aged_out = older[conv.summary_msg_count:]
                conv.summary = await llm.summarize_history(conv.summary, newly_aged_out)
                conv.summary_msg_count = len(older)
                await session.commit()
            summary_context = conv.summary

    bot = await session.get(Bot, bot_id)
    persona = bot.persona if bot else ""
    instructions = bot.instructions if bot else ""
    keywords = _keyword_list(bot.handoff_keywords if bot else "")
    model_tier = bot.model_tier if bot else "balanced"

    with get_langfuse().start_as_current_observation(
        name="chat-answer", as_type="span", input=message,
    ) as root_span, propagate_attributes(
        session_id=conversation_id,
        user_id=visitor_id,
        tags=[f"tenant:{tenant_id}", f"bot:{bot_id}"],
    ):
        # Keyword-triggered handoff (SAN-1111, FR-H2) — deterministic,
        # checked before the LLM call since it doesn't need one: a business
        # may want to *always* escalate on certain terms (e.g. "lawyer",
        # "cancel subscription") regardless of how naturally the visitor
        # phrases an explicit ask for a human.
        if keywords and any(k in message.lower() for k in keywords):
            root_span.update(output={"handoff_requested": True, "trigger": "keyword"})
            yield {"type": "handoff"}
            return

        # Speed: with no earlier turns the "standalone" rewrite is just the
        # message itself, so search can start at the same time as the
        # analysis call instead of waiting for it (saves one LLM round trip
        # on a first question). It gets its own DB session — one session can't
        # run two queries at once. Later turns still wait for the rewrite.
        speculative = None
        speculative_alt = None  # the same search with the business's own name left out (see below)
        brand = _brand_words(business_name, bot.name if bot else "")
        if not history:
            speculative = asyncio.create_task(_search_own_session(tenant_id, bot_id, message))
            alt_first = _without_brand(message, brand)
            if alt_first and alt_first != message:
                speculative_alt = asyncio.create_task(_search_own_session(tenant_id, bot_id, alt_first, rerank=False))

        phrasing_tasks: list[asyncio.Task] = []  # searches for the other phrasings (filled in once the question is analysed)

        def cancel_speculative() -> None:
            for t in (speculative, speculative_alt, *phrasing_tasks):
                if t:
                    t.cancel()

        analysis = await llm.fast_analyze(message, history, summary_context, business_name)
        if analysis.get("handoff_requested") or analysis.get("negative_sentiment"):
            cancel_speculative()
            trigger = "explicit_ask" if analysis.get("handoff_requested") else "sentiment"
            root_span.update(output={"handoff_requested": True, "trigger": trigger})
            yield {"type": "handoff"}
            return

        query = analysis.get("standalone_query") or message
        if not history or re.search(r"\[[^\]]+\]", query):
            # A first message has nothing to be "made standalone"; and a rewrite that left a placeholder
            # such as [Company Name] in it would poison the search. The visitor's own words are the best query.
            query = message
        language = analysis.get("language") or "en"
        # Other ways the answer may be worded on the site; searched alongside the question itself, so a
        # question like "how many startups" also finds the passage that says "4,000+ DeepTech startups".
        alt_phrasings = [
            q.strip() for q in (analysis.get("search_queries") or [])
            if isinstance(q, str) and q.strip() and q.strip().lower() != query.strip().lower()
        ][:2]
        phrasing_tasks.extend(
            asyncio.create_task(_search_own_session(tenant_id, bot_id, q, rerank=False)) for q in alt_phrasings
        )

        if conversation_id:
            # Persisted so language-based routing rules (SAN-1112, FR-H3)
            # have something real to match against — Conversation.language
            # was otherwise write-once at creation ("en", regardless of what
            # the visitor actually typed).
            conv = await session.get(Conversation, conversation_id)
            if conv is not None and conv.language != language:
                conv.language = language
                await session.commit()

        if analysis.get("is_conversational"):
            # Pure small talk ("hello", "thanks") has no corresponding
            # <knowledge> passage — retrieval would just attach irrelevant
            # chunks as fake "sources" under an otherwise-correct reply.
            # Skip retrieval entirely and answer from the greeting-exception
            # in ANSWER_SYSTEM, with no knowledge block and no citations.
            cancel_speculative()
            full_text = ""
            async for delta in llm.stream_answer(business_name, language, message, "", persona, instructions, summary_context, model_tier):
                full_text += delta
                yield {"type": "delta", "text": delta}

            root_span.update(output={"text": full_text, "no_answer": False, "sources": [], "follow_ups": []})
            yield {"type": "done", "no_answer": False, "sources": [], "follow_ups": []}
            return

        # Bot actions (SAN-1801): is the visitor asking the assistant to DO something (book, look up, create)?
        # The model only proposes; anything that changes data waits for the visitor's Confirm press.
        extra_knowledge = ""
        bot_actions = await actions_svc.enabled_actions(session, bot_id) if conversation_id else []
        if bot_actions:
            resolved = actions_svc.resolve_plan(await llm.plan_action(message, history, summary_context, bot_actions), bot_actions)
            if resolved:
                action, action_params, missing = resolved
                if missing:
                    extra_knowledge = (
                        f"The visitor wants to: {action.label}. To do that you still need these details from them: "
                        + ", ".join(m["description"] or m["name"] for m in missing)
                        + ". Ask for them politely in one short message. Never make up values."
                    )
                elif action.requires_confirmation:
                    cancel_speculative()
                    pending = await actions_svc.propose(
                        session, bot=bot, action=action, params=action_params, conversation_id=conversation_id, visitor_id=visitor_id or ""
                    )
                    root_span.update(output={"action_proposed": action.name})
                    yield {
                        "type": "action_proposal", "pending_id": pending.id, "label": action.label,
                        "fields": actions_svc.card_fields(action, action_params),
                    }
                    yield {"type": "done", "no_answer": False, "sources": [], "follow_ups": [], "products": []}
                    return
                else:
                    result = await actions_svc.execute(
                        session, bot=bot, action=action, params=action_params, conversation_id=conversation_id, confirmed=False
                    )
                    extra_knowledge = (
                        f"Result of '{action.label}' for the visitor: {result['message']}" if result["ok"]
                        else f"Trying to '{action.label}' just failed. Apologise briefly and offer to connect them with the team."
                    )

        if speculative:
            try:
                chunks = await speculative
            except Exception:
                chunks = []
            if not chunks:
                # Nothing from the speculative run (or it failed): redo it on
                # the main session so an empty result is never a false "no".
                chunks = await retrieval.hybrid_search(session, tenant_id=tenant_id, bot_id=bot_id, query=query)
        else:
            chunks = await retrieval.hybrid_search(session, tenant_id=tenant_id, bot_id=bot_id, query=query)

        # A second search with the business's own name left out, merged in. Without it, "Associate
        # Director Tech sanchiconnect" returned pages that merely mention the company and missed the
        # one passage that names that role.
        alt_query = _without_brand(query, brand)
        if alt_query and alt_query != query:
            alt_chunks: list[dict] | None = None
            if speculative_alt is not None and query == message:
                try:
                    alt_chunks = await speculative_alt  # already running in parallel: no extra wait
                except Exception:
                    alt_chunks = None
            if alt_chunks is None:
                alt_chunks = await retrieval.hybrid_search(session, tenant_id=tenant_id, bot_id=bot_id, query=alt_query, rerank=False)
            chunks = _merge_chunks(chunks, alt_chunks)
        elif speculative_alt is not None:
            speculative_alt.cancel()

        extra_lists: list[list[dict]] = []
        for task in phrasing_tasks:
            try:
                extra_lists.append(await task)
            except Exception:
                pass  # an extra phrasing is a bonus; never let it break the answer
        if extra_lists:
            chunks = _round_robin([chunks, *extra_lists], limit=12)
        if trace is not None:
            trace["chunks"] = chunks

        # Catalogue products related to the question (SAN-1800): the model may
        # recommend them, and the widget shows them as cards under the answer.
        matched_products = await products.search(session, tenant_id=tenant_id, bot_id=bot_id, query=query)
        web_ok = bool(bot and bot.web_fallback) and not extra_knowledge

        if not chunks and not matched_products and not extra_knowledge and web_ok:
            # Own information first (nothing matched at all) — only now look online.
            web: dict = {}
            async for ev in _web_flow(
                business_name=business_name, language=language, message=message, persona=persona,
                instructions=instructions, summary=summary_context, model_tier=model_tier, out=web,
            ):
                yield ev
            if web["ok"]:
                root_span.update(output={"text": web["text"], "no_answer": False, "sources": web["sources"], "web": True})
                yield {"type": "done", "no_answer": False, "sources": web["sources"], "follow_ups": [], "products": [], "web": True}
                return

        if not chunks and not matched_products and not extra_knowledge:
            # Low-confidence-twice handoff (SAN-1111, FR-H2) — "low
            # confidence" scoped to "retrieval found nothing at all",
            # checkable before generating anything. A second consecutive
            # empty-handed turn escalates instead of repeating the same
            # "I don't know" reply; a single occurrence just answers
            # normally and starts counting.
            conv = await session.get(Conversation, conversation_id) if conversation_id else None
            if conv is not None and conv.consecutive_low_confidence >= 1:
                conv.consecutive_low_confidence = 0
                await session.commit()
                root_span.update(output={"handoff_requested": True, "trigger": "low_confidence_twice"})
                yield {"type": "handoff"}
                return
            if conv is not None:
                conv.consecutive_low_confidence += 1
                await session.commit()

            text = "I don't have information about that yet. I can connect you with the team if you'd like."
            root_span.update(output={"text": text, "no_answer": True, "sources": [], "follow_ups": []})
            yield {"type": "delta", "text": text}
            yield {"type": "done", "no_answer": True, "sources": [], "follow_ups": []}
            return

        if conversation_id:
            conv = await session.get(Conversation, conversation_id)
            if conv is not None and conv.consecutive_low_confidence != 0:
                conv.consecutive_low_confidence = 0
                await session.commit()

        knowledge = "\n".join(f"[{i}] ({c.get('url') or 'source'}) {c['text']}" for i, c in enumerate(chunks, 1))
        if extra_knowledge:
            knowledge = (knowledge + "\n\n" if knowledge else "") + extra_knowledge
        if matched_products:
            catalogue = "\n".join(
                f"- {p['name']}" + (f" ({p['price']})" if p["price"] else "") + (f": {p['description']}" if p["description"] else "")
                for p in matched_products
            )
            knowledge += f"\n\nProducts from the catalogue (the visitor sees these as cards under your answer):\n{catalogue}"

        full_text = ""
        via_web = False
        web_sources: list[dict] = []
        answer_stream_ = llm.stream_answer(business_name, language, message, knowledge, persona, instructions, summary_context, model_tier)
        gave_up = False
        # With the online fallback off there's nothing to wait for, so words stream out immediately.
        # (Both generators are closed explicitly, in this task, when we stop reading early.)
        async with contextlib.aclosing(answer_stream_), contextlib.aclosing(
            _head_then_rest(answer_stream_, PEEK_CHARS if web_ok else 0)
        ) as pieces:
            async for kind, piece in pieces:
                if kind == "head" and web_ok and _is_decline(piece):
                    gave_up = True  # the knowledge base couldn't answer: show none of this, try the web
                    break
                full_text += piece
                yield {"type": "delta", "text": piece}

        if gave_up:
            web = {}
            async for ev in _web_flow(
                business_name=business_name, language=language, message=message, persona=persona,
                instructions=instructions, summary=summary_context, model_tier=model_tier, out=web,
            ):
                yield ev
            if web["ok"]:
                full_text, web_sources, via_web = web["text"], web["sources"], True
            else:
                full_text = GENERIC_DECLINE
                yield {"type": "delta", "text": full_text}

        declined = not via_web and _is_decline(full_text)
        sources: list[dict] = []
        cards: list[dict] = []
        if via_web:
            sources = web_sources
        elif not declined:
            sources = pick_sources(chunks)
            cards = [{k: v for k, v in p.items() if k != "similarity"} for p in matched_products]

        # "done" goes out as soon as the answer is complete, so the typing
        # indicator stops and the visitor can type again straight away. The
        # follow-up chips need one more (slow) model call, so they follow as
        # their own event instead of holding "done" back by 1-2 seconds.
        yield {"type": "done", "no_answer": declined, "sources": sources, "follow_ups": [], "products": cards, "web": via_web}

        follow_ups: list[str] = []
        if not declined:
            # Follow-up quick replies (SAN-1096, FR-C8) — only worth
            # suggesting more questions when this one actually got a real,
            # grounded answer; a decline has nothing to follow up on.
            follow_ups = await llm.suggest_follow_ups(message, full_text)
            if follow_ups:
                yield {"type": "follow_ups", "follow_ups": follow_ups}

        root_span.update(output={"text": full_text, "no_answer": declined, "sources": sources, "follow_ups": follow_ups, "products": len(cards)})
