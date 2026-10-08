"""Endpoints for bot actions (SAN-1801): managing them in the dashboard, and the two calls the chat widget makes when a
visitor presses Confirm or Cancel on an action card."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, select

from .db import SessionLocal
from .deps import CurrentUser, get_current_user, require_workspace_role
from .models import ActionLog, Bot, BotAction, Workspace
from .services import actions as svc
from .services.conversations import add_message
from .services.crypto import encrypt_secret
from .services.ratelimit import rate_limit

router = APIRouter()


class ParamIn(BaseModel):
    name: str
    description: str = ""
    required: bool = True


class ActionIn(BaseModel):
    name: str
    label: str
    description: str
    url: str
    params: list[ParamIn] = []
    requires_confirmation: bool = True
    enabled: bool = True


def _out(a: BotAction) -> dict:
    return {
        "action_id": a.id, "name": a.name, "label": a.label, "description": a.description, "url": a.url,
        "params": a.params_json or [], "requires_confirmation": a.requires_confirmation, "enabled": a.enabled,
        "signed": bool(a.secret_enc),
    }


async def _bot(session, bot_id: str, user: CurrentUser, role: str) -> Bot:
    bot = await session.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(404, "Bot not found")
    await require_workspace_role(bot.workspace_id, user, min_role=role, session=session)
    return bot


async def _action(session, action_id: str, user: CurrentUser, role: str) -> tuple[BotAction, Bot]:
    action = await session.get(BotAction, action_id)
    if action is None:
        raise HTTPException(404, "Action not found")
    return action, await _bot(session, action.bot_id, user, role)


def _clean(body: ActionIn) -> dict:
    try:
        return svc.clean_definition(body.name, body.label, body.description, body.url, [p.model_dump() for p in body.params])
    except svc.ActionError as e:
        raise HTTPException(422, str(e))


# ─── dashboard ────────────────────────────────────────────────────────────────────


@router.get("/v1/bots/{bot_id}/actions")
async def list_actions(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        await _bot(session, bot_id, user, "viewer")
        rows = (await session.execute(select(BotAction).where(BotAction.bot_id == bot_id).order_by(BotAction.name))).scalars().all()
        return [_out(a) for a in rows]


@router.post("/v1/bots/{bot_id}/actions")
async def create_action(bot_id: str, body: ActionIn, user: CurrentUser = Depends(get_current_user)):
    fields = _clean(body)
    async with SessionLocal() as session:
        bot = await _bot(session, bot_id, user, "admin")
        existing = (await session.execute(select(BotAction).where(BotAction.bot_id == bot_id))).scalars().all()
        if len(existing) >= svc.MAX_ACTIONS_PER_BOT:
            raise HTTPException(400, f"At most {svc.MAX_ACTIONS_PER_BOT} actions per assistant")
        if any(a.name == fields["name"] for a in existing):
            raise HTTPException(409, "An action with that name already exists")
        secret = svc.new_secret()
        action = BotAction(
            tenant_id=bot.tenant_id, bot_id=bot_id, requires_confirmation=body.requires_confirmation, enabled=body.enabled,
            secret_enc=encrypt_secret(secret), **fields,
        )
        session.add(action)
        await session.commit()
        return _out(action) | {"secret": secret, "secret_note": "Copy the signing secret now: it is not shown again. Use it to check the X-SanchiJawab-Signature header."}


@router.put("/v1/actions/{action_id}")
async def edit_action(action_id: str, body: ActionIn, user: CurrentUser = Depends(get_current_user)):
    fields = _clean(body)
    async with SessionLocal() as session:
        action, _bot_row = await _action(session, action_id, user, "admin")
        clash = (await session.execute(
            select(BotAction).where(BotAction.bot_id == action.bot_id, BotAction.name == fields["name"], BotAction.id != action.id)
        )).first()
        if clash:
            raise HTTPException(409, "An action with that name already exists")
        for k, v in fields.items():
            setattr(action, k, v)
        action.requires_confirmation = body.requires_confirmation
        action.enabled = body.enabled
        await session.commit()
        return _out(action)


@router.post("/v1/actions/{action_id}/rotate-secret")
async def rotate_secret(action_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        action, _bot_row = await _action(session, action_id, user, "admin")
        secret = svc.new_secret()
        action.secret_enc = encrypt_secret(secret)
        await session.commit()
        return {"secret": secret, "secret_note": "Copy the signing secret now: it is not shown again."}


@router.delete("/v1/actions/{action_id}")
async def delete_action(action_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        action, _bot_row = await _action(session, action_id, user, "admin")
        await session.delete(action)
        await session.commit()
        return {"deleted": True}


@router.post("/v1/actions/{action_id}/test")
async def test_action(action_id: str, user: CurrentUser = Depends(get_current_user)):
    """Sends a sample call (every detail set to "test") so the customer can check their endpoint and signature."""
    async with SessionLocal() as session:
        action, bot = await _action(session, action_id, user, "admin")
        sample = {p["name"]: "test" for p in action.params_json or []}
        return await svc.execute(session, bot=bot, action=action, params=sample, conversation_id="test", confirmed=False)


@router.get("/v1/bots/{bot_id}/actions/log")
async def action_log(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        await _bot(session, bot_id, user, "agent")
        rows = (await session.execute(
            select(ActionLog).where(ActionLog.bot_id == bot_id).order_by(ActionLog.created_at.desc()).limit(50)
        )).scalars().all()
        return [
            {"action": r.action_name, "ok": r.ok, "http_status": r.http_status, "confirmed_by_visitor": r.confirmed_by_visitor,
             "duration_ms": r.duration_ms, "error": r.error, "at": r.created_at.isoformat()}
            for r in rows
        ]


# ─── public (the chat widget) ──────────────────────────────────────────────────────────


class DecisionIn(BaseModel):
    conversation_id: str
    visitor_id: str = ""


async def _public_bot(session, bot_id: str, request: Request) -> Bot:
    from . import main as app_main  # late import: main includes this router

    bot = await session.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(404, "Bot not found")
    app_main._enforce_domain_allowlist(bot, request)
    workspace = await session.get(Workspace, bot.workspace_id)
    if bot.status != "live" or workspace is None or not workspace.is_active:
        raise HTTPException(403, "This assistant isn't currently available")
    return bot


@router.post("/public/w/{bot_id}/actions/{pending_id}/confirm", dependencies=[Depends(rate_limit("action-confirm", limit=10, window_seconds=60))])
async def confirm_action(bot_id: str, pending_id: str, body: DecisionIn, request: Request):
    async with SessionLocal() as session:
        bot = await _public_bot(session, bot_id, request)
        pending = await svc.claim_pending(
            session, pending_id=pending_id, bot_id=bot_id, conversation_id=body.conversation_id,
            visitor_id=body.visitor_id, new_status="confirmed",
        )
        if pending is None:
            raise HTTPException(409, "This request has expired or was already handled. Please ask again.")
        action = await session.get(BotAction, pending.action_id)
        if action is None or not action.enabled:
            raise HTTPException(409, "That action is no longer available.")
        result = await svc.execute(
            session, bot=bot, action=action, params=pending.params_json or {}, conversation_id=pending.conversation_id, confirmed=True
        )
        text = (result["message"] or f"Done: {action.label}.") if result["ok"] else "Sorry, I couldn't complete that. Please try again, or contact the team."
        await add_message(session, conversation_id=pending.conversation_id, tenant_id=bot.tenant_id, role="bot", content=text)
        await session.commit()
        return {"ok": result["ok"], "message": text}


@router.post("/public/w/{bot_id}/actions/{pending_id}/cancel", dependencies=[Depends(rate_limit("action-cancel", limit=20, window_seconds=60))])
async def cancel_action(bot_id: str, pending_id: str, body: DecisionIn, request: Request):
    async with SessionLocal() as session:
        await _public_bot(session, bot_id, request)
        pending = await svc.claim_pending(
            session, pending_id=pending_id, bot_id=bot_id, conversation_id=body.conversation_id,
            visitor_id=body.visitor_id, new_status="cancelled",
        )
        return {"cancelled": pending is not None}


async def delete_actions_for_bots(session, bot_ids: list[str]) -> None:
    """Used when a bot or workspace is deleted."""
    from .models import PendingAction

    await session.execute(delete(PendingAction).where(PendingAction.bot_id.in_(bot_ids)))
    await session.execute(delete(ActionLog).where(ActionLog.bot_id.in_(bot_ids)))
    await session.execute(delete(BotAction).where(BotAction.bot_id.in_(bot_ids)))
