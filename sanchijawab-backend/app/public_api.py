"""Read-only public API and MCP server (SAN-1806, FR-X5), authenticated with a
workspace API key created in the dashboard:

    Authorization: Bearer sj_live_...

REST:  GET /api/v1/bots, /api/v1/bots/{id}/conversations, /api/v1/conversations/{id},
       /api/v1/bots/{id}/leads, POST /api/v1/bots/{id}/ask
MCP:   POST /mcp  (JSON-RPC 2.0 over HTTP; tools: list_bots, ask_question,
       list_conversations, get_conversation, list_leads) so AI assistants such
       as Claude can use a customer's bot as a tool.

Everything is scoped to the key's own workspace; nothing here can change data
except `ask`, which stores the exchange like any other chat turn.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import SessionLocal
from .deps import CurrentUser, get_current_user, require_workspace_role
from .models import ApiKey, Bot, Conversation, Lead, Workspace
from .services import ratelimit
from .services.conversations import list_messages
from .services.plan_limits import enforce_message_limit, enforce_trial_or_plan
from .services.rag import answer_stream

router = APIRouter()

KEY_PREFIX = "sj_live_"
PER_KEY_LIMIT = 60          # requests per minute per key
ASK_LIMIT = 20              # asks per minute per key (each costs a model call)


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ─── Key management (dashboard, workspace admins) ───────────────────────────


class CreateKeyRequest(BaseModel):
    name: str


@router.post("/v1/workspaces/{workspace_id}/api-keys")
async def create_api_key(workspace_id: str, body: CreateKeyRequest, user: CurrentUser = Depends(get_current_user)):
    name = body.name.strip()
    if not name or len(name) > 100:
        raise HTTPException(422, "Give the key a name (up to 100 characters)")
    async with SessionLocal() as session:
        await require_workspace_role(workspace_id, user, min_role="admin", session=session)
        workspace = await session.get(Workspace, workspace_id)
        count = len((await session.execute(
            select(ApiKey.id).where(ApiKey.workspace_id == workspace_id, ApiKey.revoked_at.is_(None))
        )).all())
        if count >= 10:
            raise HTTPException(400, "At most 10 active API keys per workspace — revoke one first")
        raw = KEY_PREFIX + secrets.token_urlsafe(32)
        row = ApiKey(
            tenant_id=workspace.tenant_id, workspace_id=workspace_id, name=name,
            key_prefix=raw[:12], key_hash=hash_key(raw), created_by=user.user_id,
        )
        session.add(row)
        await session.commit()
        return {"key_id": row.id, "name": row.name, "key": raw,
                "note": "Copy this key now — it is never shown again."}


def _key_out(k: ApiKey) -> dict:
    return {
        "key_id": k.id, "name": k.name, "prefix": k.key_prefix, "created_at": k.created_at.isoformat(),
        "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
        "revoked": k.revoked_at is not None,
    }


@router.get("/v1/workspaces/{workspace_id}/api-keys")
async def list_api_keys(workspace_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        await require_workspace_role(workspace_id, user, min_role="admin", session=session)
        rows = (await session.execute(
            select(ApiKey).where(ApiKey.workspace_id == workspace_id).order_by(ApiKey.created_at.desc())
        )).scalars().all()
        return [_key_out(k) for k in rows]


@router.delete("/v1/workspaces/{workspace_id}/api-keys/{key_id}")
async def revoke_api_key(workspace_id: str, key_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        await require_workspace_role(workspace_id, user, min_role="admin", session=session)
        key = await session.get(ApiKey, key_id)
        if key is None or key.workspace_id != workspace_id:
            raise HTTPException(404, "Key not found")
        key.revoked_at = key.revoked_at or datetime.utcnow()
        await session.commit()
        return {"revoked": True}


# ─── Authenticating a request by API key ───────────────────────────────────────


async def api_key_workspace(authorization: str = Header(default="")) -> tuple[str, str, str]:
    """Returns (workspace_id, tenant_id, key_id) for a valid, unrevoked key on
    an active workspace; applies the per-key rate limit."""
    raw = authorization.removeprefix("Bearer ").strip()
    if not raw.startswith(KEY_PREFIX):
        raise HTTPException(401, "Missing or invalid API key. Send 'Authorization: Bearer sj_live_...'")
    async with SessionLocal() as session:
        key = (await session.execute(select(ApiKey).where(ApiKey.key_hash == hash_key(raw)))).scalar_one_or_none()
        if key is None or key.revoked_at is not None:
            raise HTTPException(401, "Invalid or revoked API key")
        workspace = await session.get(Workspace, key.workspace_id)
        if workspace is None or not workspace.is_active:
            raise HTTPException(403, "This workspace has been deactivated")
        # Updated at most once a minute so a busy key doesn't write on every call.
        if key.last_used_at is None or datetime.utcnow() - key.last_used_at > timedelta(minutes=1):
            key.last_used_at = datetime.utcnow()
            await session.commit()
        ident = (key.workspace_id, key.tenant_id, key.id)
    ratelimit.check(f"apikey:{ident[2]}", limit=PER_KEY_LIMIT, window_seconds=60)
    return ident


async def _own_bot(session: AsyncSession, workspace_id: str, bot_id: str) -> Bot:
    bot = await session.get(Bot, bot_id)
    if bot is None or bot.workspace_id != workspace_id:
        raise HTTPException(404, "Bot not found")
    return bot


# ─── Operations shared by REST and MCP ────────────────────────────────────────────


async def op_list_bots(workspace_id: str) -> list[dict]:
    async with SessionLocal() as session:
        bots = (await session.execute(select(Bot).where(Bot.workspace_id == workspace_id))).scalars().all()
        return [{"bot_id": b.id, "name": b.name, "status": b.status} for b in bots]


async def op_list_conversations(workspace_id: str, bot_id: str, limit: int) -> list[dict]:
    limit = max(1, min(limit, 100))
    async with SessionLocal() as session:
        await _own_bot(session, workspace_id, bot_id)
        rows = (await session.execute(
            select(Conversation).where(Conversation.bot_id == bot_id).order_by(Conversation.started_at.desc()).limit(limit)
        )).scalars().all()
        return [{"conversation_id": c.id, "status": c.status, "page_url": c.page_url, "language": c.language,
                 "started_at": c.started_at.isoformat(), "rating": c.rating} for c in rows]


async def op_get_conversation(workspace_id: str, conversation_id: str) -> dict:
    async with SessionLocal() as session:
        conv = await session.get(Conversation, conversation_id)
        if conv is None:
            raise HTTPException(404, "Conversation not found")
        await _own_bot(session, workspace_id, conv.bot_id)
        msgs = await list_messages(session, conversation_id=conversation_id)
        return {"conversation_id": conv.id, "status": conv.status, "started_at": conv.started_at.isoformat(),
                "messages": [{"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in msgs]}


async def op_list_leads(workspace_id: str, bot_id: str, limit: int) -> list[dict]:
    limit = max(1, min(limit, 200))
    async with SessionLocal() as session:
        await _own_bot(session, workspace_id, bot_id)
        rows = (await session.execute(
            select(Lead, Conversation).join(Conversation, Lead.conversation_id == Conversation.id)
            .where(Conversation.bot_id == bot_id).order_by(Lead.created_at.desc()).limit(limit)
        )).all()
        return [{"name": lead.name, "email": lead.email, "phone": lead.phone, "created_at": lead.created_at.isoformat()}
                for lead, _ in rows]


async def op_ask(workspace_id: str, key_id: str, bot_id: str, question: str) -> dict:
    question = question.strip()
    if not question or len(question) > 2000:
        raise HTTPException(422, "question must be 1-2000 characters")
    ratelimit.check(f"apikey-ask:{key_id}", limit=ASK_LIMIT, window_seconds=60)
    async with SessionLocal() as session:
        bot = await _own_bot(session, workspace_id, bot_id)
        workspace = await session.get(Workspace, workspace_id)
        await enforce_trial_or_plan(session, workspace)
        await enforce_message_limit(session, workspace)
        text, sources, no_answer = "", [], False
        async for event in answer_stream(
            session, tenant_id=bot.tenant_id, bot_id=bot.id, business_name=bot.name, message=question,
            visitor_id=f"api:{key_id[:8]}",
        ):
            if event["type"] == "delta":
                text += event["text"]
            elif event["type"] == "done":
                sources = [s["url"] for s in event.get("sources", [])]
                no_answer = bool(event.get("no_answer"))
            elif event["type"] == "handoff":
                text, no_answer = text or "This question would be handed to a human.", True
        return {"answer": text, "sources": sources, "answered": not no_answer}


# ─── REST ───────────────────────────────────────────────────────────────────────────


@router.get("/api/v1/bots")
async def api_bots(ident=Depends(api_key_workspace)):
    return await op_list_bots(ident[0])


@router.get("/api/v1/bots/{bot_id}/conversations")
async def api_conversations(bot_id: str, limit: int = 25, ident=Depends(api_key_workspace)):
    return await op_list_conversations(ident[0], bot_id, limit)


@router.get("/api/v1/conversations/{conversation_id}")
async def api_conversation(conversation_id: str, ident=Depends(api_key_workspace)):
    return await op_get_conversation(ident[0], conversation_id)


@router.get("/api/v1/bots/{bot_id}/leads")
async def api_leads(bot_id: str, limit: int = 50, ident=Depends(api_key_workspace)):
    return await op_list_leads(ident[0], bot_id, limit)


class AskRequest(BaseModel):
    question: str


@router.post("/api/v1/bots/{bot_id}/ask")
async def api_ask(bot_id: str, body: AskRequest, ident=Depends(api_key_workspace)):
    return await op_ask(ident[0], ident[2], bot_id, body.question)


# ─── MCP (JSON-RPC 2.0 over HTTP) ─────────────────────────────────────────────────────

MCP_PROTOCOL = "2025-03-26"
_BOT_ID = {"bot_id": {"type": "string", "description": "A bot id from list_bots"}}
MCP_TOOLS = [
    {"name": "list_bots", "description": "List this workspace's chat assistants.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "ask_question", "description": "Ask one of the workspace's assistants a question; it answers only from the business's own published content.",
     "inputSchema": {"type": "object", "properties": {**_BOT_ID, "question": {"type": "string"}}, "required": ["bot_id", "question"]}},
    {"name": "list_conversations", "description": "Recent visitor conversations for an assistant.",
     "inputSchema": {"type": "object", "properties": {**_BOT_ID, "limit": {"type": "integer"}}, "required": ["bot_id"]}},
    {"name": "get_conversation", "description": "Full message transcript of one conversation.",
     "inputSchema": {"type": "object", "properties": {"conversation_id": {"type": "string"}}, "required": ["conversation_id"]}},
    {"name": "list_leads", "description": "Leads (name, email, phone) captured by an assistant.",
     "inputSchema": {"type": "object", "properties": {**_BOT_ID, "limit": {"type": "integer"}}, "required": ["bot_id"]}},
]


async def _call_tool(name: str, args: dict, ident) -> object:
    ws, _tenant, key_id = ident
    if name == "list_bots":
        return await op_list_bots(ws)
    if name == "ask_question":
        return await op_ask(ws, key_id, str(args.get("bot_id", "")), str(args.get("question", "")))
    if name == "list_conversations":
        return await op_list_conversations(ws, str(args.get("bot_id", "")), int(args.get("limit", 25)))
    if name == "get_conversation":
        return await op_get_conversation(ws, str(args.get("conversation_id", "")))
    if name == "list_leads":
        return await op_list_leads(ws, str(args.get("bot_id", "")), int(args.get("limit", 50)))
    raise KeyError(name)


def _rpc_error(rid, code: int, message: str) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}})


@router.post("/mcp")
async def mcp_endpoint(request: Request, ident=Depends(api_key_workspace)):
    import json

    try:
        msg = await request.json()
    except Exception:
        return _rpc_error(None, -32700, "Parse error")
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or "method" not in msg:
        return _rpc_error(msg.get("id") if isinstance(msg, dict) else None, -32600, "Invalid request")
    rid, method, params = msg.get("id"), msg["method"], msg.get("params") or {}

    if rid is None:  # notification (e.g. notifications/initialized): no response body
        return JSONResponse(status_code=202, content=None)
    if method == "initialize":
        return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": {
            "protocolVersion": MCP_PROTOCOL, "capabilities": {"tools": {}},
            "serverInfo": {"name": "sanchijawab", "version": "1.0"},
        }})
    if method == "ping":
        return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": {}})
    if method == "tools/list":
        return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": {"tools": MCP_TOOLS}})
    if method == "tools/call":
        try:
            result = await _call_tool(str(params.get("name", "")), params.get("arguments") or {}, ident)
        except KeyError:
            return _rpc_error(rid, -32602, f"Unknown tool {params.get('name')!r}")
        except HTTPException as e:  # tool-level failure: reported inside the result, per the MCP spec
            return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": {
                "isError": True, "content": [{"type": "text", "text": str(e.detail)}]}})
        return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": {
            "content": [{"type": "text", "text": json.dumps(result, indent=2)}]}})
    return _rpc_error(rid, -32601, f"Method not found: {method}")

