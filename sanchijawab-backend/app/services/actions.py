"""Bot actions (SAN-1801, FR-X1-X4): lets the assistant do something on a visitor's behalf by calling the customer's own
web address. Three rules shape everything here:

1. The model only PROPOSES. Anything that changes data waits for the visitor to press Confirm (the proposal is stored
   on the server, so the details can't be altered between proposal and confirmation, and it can be used only once).
2. Details come only from what the visitor actually said; the model is told never to invent them.
3. The call goes out signed, to a public address only, with no redirects, a short timeout and a size cap.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import datetime, timedelta

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ActionLog, Bot, BotAction, PendingAction
from .crypto import decrypt_secret
from .urlsafety import UnsafeURLError, assert_public_url

MAX_ACTIONS_PER_BOT = 10
MAX_PARAMS = 8
MAX_VALUE_CHARS = 500
PENDING_MINUTES = 15
CALL_TIMEOUT_SECONDS = 10
MAX_RESPONSE_BYTES = 64 * 1024
_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{2,63}$")
_PARAM_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")


class ActionError(ValueError):
    pass


def clean_definition(name: str, label: str, description: str, url: str, params: list[dict]) -> dict:
    name = (name or "").strip().lower()
    if not _NAME_RE.match(name):
        raise ActionError("name must be lowercase letters, numbers and underscores, starting with a letter (3-64 characters), e.g. book_demo")
    label = (label or "").strip()
    if not label or len(label) > 100:
        raise ActionError("label is required (up to 100 characters); the visitor sees it on the confirm card")
    description = (description or "").strip()
    if len(description) < 10:
        raise ActionError("Describe when the assistant should use this action (at least 10 characters)")
    url = (url or "").strip()
    if not url.startswith(("http://", "https://")) or len(url) > 1024:
        raise ActionError("url must be a full http(s) address")
    try:
        assert_public_url(url)
    except UnsafeURLError as e:
        raise ActionError(str(e))
    if len(params) > MAX_PARAMS:
        raise ActionError(f"At most {MAX_PARAMS} details per action")
    clean_params, seen = [], set()
    for p in params:
        pname = (p.get("name") or "").strip().lower()
        if not _PARAM_RE.match(pname) or pname in seen:
            raise ActionError(f"Detail name {pname!r} must be lowercase letters/numbers/underscores and unique")
        seen.add(pname)
        clean_params.append({
            "name": pname, "description": (p.get("description") or "").strip()[:200], "required": bool(p.get("required", True)),
        })
    return {"name": name, "label": label[:100], "description": description[:1000], "url": url, "params_json": clean_params}


def new_secret() -> str:
    return "whsec_" + secrets.token_urlsafe(24)


def sign(secret: str, timestamp: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


async def enabled_actions(session: AsyncSession, bot_id: str) -> list[BotAction]:
    return list((await session.execute(
        select(BotAction).where(BotAction.bot_id == bot_id, BotAction.enabled.is_(True)).order_by(BotAction.name)
    )).scalars().all())


def resolve_plan(plan: dict, actions: list[BotAction]) -> tuple[BotAction, dict[str, str], list[dict]] | None:
    """Turns the model's suggestion into something trustworthy: a real, enabled action; only its declared details;
    short strings; and the list of required details still missing."""
    if not isinstance(plan, dict):
        return None
    chosen = next((a for a in actions if a.name == str(plan.get("action") or "")), None)
    if chosen is None:
        return None
    raw = plan.get("params") if isinstance(plan.get("params"), dict) else {}
    declared = {p["name"]: p for p in chosen.params_json or []}
    params: dict[str, str] = {}
    for key, value in raw.items():
        if key in declared and value is not None and str(value).strip():
            params[key] = str(value).strip()[:MAX_VALUE_CHARS]
    missing = [p for p in declared.values() if p.get("required", True) and p["name"] not in params]
    return chosen, params, missing


async def propose(session: AsyncSession, *, bot: Bot, action: BotAction, params: dict, conversation_id: str, visitor_id: str) -> PendingAction:
    pending = PendingAction(
        tenant_id=bot.tenant_id, bot_id=bot.id, action_id=action.id, conversation_id=conversation_id,
        visitor_id=(visitor_id or "")[:64], params_json=params, expires_at=datetime.utcnow() + timedelta(minutes=PENDING_MINUTES),
    )
    session.add(pending)
    await session.commit()
    return pending


async def _post(url: str, body: bytes, headers: dict) -> tuple[int, bytes]:
    """The one place a customer's address is called (replaced in tests)."""
    async with httpx.AsyncClient(timeout=CALL_TIMEOUT_SECONDS, follow_redirects=False) as client:
        async with client.stream("POST", url, content=body, headers=headers) as resp:
            data = b""
            async for chunk in resp.aiter_bytes():
                data += chunk
                if len(data) > MAX_RESPONSE_BYTES:
                    break
            return resp.status_code, data[:MAX_RESPONSE_BYTES]


def _message_from(raw: bytes) -> str:
    """The customer's reply is shown to the visitor, so only take plain text: a "message" field if the reply is JSON,
    else the beginning of the text. The widget renders it as text, never as HTML."""
    text = raw.decode("utf-8", errors="replace").strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict) and isinstance(data.get("message"), str):
            return data["message"].strip()[:500]
    except ValueError:
        pass
    return text[:500]


async def execute(session: AsyncSession, *, bot: Bot, action: BotAction, params: dict, conversation_id: str, confirmed: bool) -> dict:
    """Calls the customer's address. Always logs. Returns {ok, message, error}."""
    payload = {
        "action": action.name, "params": params, "conversation_id": conversation_id,
        "confirmed_by_visitor": confirmed, "bot_id": bot.id,
    }
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = str(int(time.time()))
    headers = {"Content-Type": "application/json", "X-SanchiJawab-Timestamp": timestamp, "User-Agent": "SanchiJawab-Actions/1.0"}
    if action.secret_enc:
        headers["X-SanchiJawab-Signature"] = sign(decrypt_secret(action.secret_enc), timestamp, body)

    started = time.perf_counter()
    status, message, error = None, "", ""
    try:
        assert_public_url(action.url)  # again at call time: DNS can change after the action was saved
        status, raw = await _post(action.url, body, headers)
        ok = 200 <= status < 300
        message = _message_from(raw) if ok else ""
        if not ok:
            error = f"HTTP {status}"
    except UnsafeURLError as e:
        ok, error = False, str(e)[:300]
    except (httpx.HTTPError, OSError) as e:
        ok, error = False, f"{e.__class__.__name__}"[:300]

    session.add(ActionLog(
        tenant_id=bot.tenant_id, bot_id=bot.id, action_name=action.name, conversation_id=conversation_id or "",
        confirmed_by_visitor=confirmed, ok=ok, http_status=status, duration_ms=int((time.perf_counter() - started) * 1000), error=error,
    ))
    await session.commit()
    return {"ok": ok, "message": message, "error": error}


async def claim_pending(session: AsyncSession, *, pending_id: str, bot_id: str, conversation_id: str, visitor_id: str, new_status: str) -> PendingAction | None:
    """Atomically takes a proposal that is still pending, unexpired and belongs to this conversation, so pressing
    Confirm twice (or racing two tabs) runs it once."""
    conditions = [
        PendingAction.id == pending_id, PendingAction.bot_id == bot_id, PendingAction.conversation_id == conversation_id,
        PendingAction.status == "pending", PendingAction.expires_at > datetime.utcnow(),
    ]
    if visitor_id:  # a proposal made for one visitor can't be confirmed by another
        conditions.append(PendingAction.visitor_id.in_([visitor_id, ""]))
    row = (await session.execute(
        update(PendingAction).where(*conditions).values(status=new_status).returning(PendingAction.id)
    )).first()
    await session.commit()
    return await session.get(PendingAction, row[0]) if row else None


def card_fields(action: BotAction, params: dict) -> list[dict]:
    """What the visitor reviews before confirming: each detail's name and the value that will be sent."""
    desc = {p["name"]: p.get("description") or p["name"] for p in action.params_json or []}
    return [{"name": desc.get(k, k), "value": v} for k, v in params.items()]

