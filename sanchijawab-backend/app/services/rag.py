"""RAG orchestration: fast-tier intent/rewrite -> hybrid retrieval ->
main-tier streamed grounded answer -> citation parsing.

Yields a stream of small dict events so a router can turn each into an
SSE delta without this module knowing anything about HTTP/SSE framing.
"""
from __future__ import annotations

import re
from collections.abc import AsyncIterator

from langfuse import propagate_attributes
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Bot, Conversation
from . import llm, retrieval
from .tracing import get_langfuse

DECLINE_MARKERS = (
    "don't have information", "do not have information", "don't know",
    "do not know", "no information", "cannot find", "can't find",
)


def _is_decline(text: str) -> bool:
    low = text.lower()
    return any(m in low for m in DECLINE_MARKERS)


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
) -> AsyncIterator[dict]:
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

        analysis = await llm.fast_analyze(message, history, summary_context)
        if analysis.get("handoff_requested") or analysis.get("negative_sentiment"):
            trigger = "explicit_ask" if analysis.get("handoff_requested") else "sentiment"
            root_span.update(output={"handoff_requested": True, "trigger": trigger})
            yield {"type": "handoff"}
            return

        query = analysis.get("standalone_query") or message
        language = analysis.get("language") or "en"

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
            full_text = ""
            async for delta in llm.stream_answer(business_name, language, message, "", persona, instructions, summary_context):
                full_text += delta
                yield {"type": "delta", "text": delta}

            root_span.update(output={"text": full_text, "no_answer": False, "sources": []})
            yield {"type": "done", "no_answer": False, "sources": []}
            return

        chunks = await retrieval.hybrid_search(session, tenant_id=tenant_id, bot_id=bot_id, query=query)
        if not chunks:
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
            root_span.update(output={"text": text, "no_answer": True, "sources": []})
            yield {"type": "delta", "text": text}
            yield {"type": "done", "no_answer": True, "sources": []}
            return

        if conversation_id:
            conv = await session.get(Conversation, conversation_id)
            if conv is not None and conv.consecutive_low_confidence != 0:
                conv.consecutive_low_confidence = 0
                await session.commit()

        knowledge = "\n".join(f"[{i}] ({c.get('url') or 'source'}) {c['text']}" for i, c in enumerate(chunks, 1))

        full_text = ""
        async for delta in llm.stream_answer(business_name, language, message, knowledge, persona, instructions, summary_context):
            full_text += delta
            yield {"type": "delta", "text": delta}

        declined = _is_decline(full_text)
        sources: list[dict] = []
        if not declined:
            seen: set[str] = set()
            for c in chunks:
                url = c.get("url")
                if url and url not in seen:
                    seen.add(url)
                    sources.append({"url": url, "chunk_id": c["chunk_id"]})

        root_span.update(output={"text": full_text, "no_answer": declined, "sources": sources})
        yield {"type": "done", "no_answer": declined, "sources": sources}
