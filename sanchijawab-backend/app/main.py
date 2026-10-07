"""FastAPI app.

Auth (FR-A1), workspaces (FR-A2) and roles (FR-A3) are real now — see
deps.py/services/auth.py. Sources and chat derive tenant_id server-side
instead of trusting the client, closing a real hole where any caller
could previously claim to be any tenant by passing tenant_id in the body.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from urllib.parse import urlparse

import sentry_sdk
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings

# Empty dsn makes this a safe no-op (same convention as the Langfuse client
# in services/tracing.py) — local dev without a Sentry project keeps working.
sentry_sdk.init(
    dsn=settings.sentry_dsn or None,
    environment=settings.sentry_environment,
    traces_sample_rate=settings.sentry_traces_sample_rate,
    release=settings.sentry_release or None,
)
from .db import SessionLocal
from .deps import (
    CurrentUser, get_current_staff_user, get_current_user, require_super_admin, require_workspace_role,
)
from .models import (
    BillingProfile, Bot, Chunk, Conversation, Document, IngestJob, Lead, Membership, Message, Order,
    PaymentGateway, Plan, QAPair, RoutingRule, Source, Team, ToolConnection, User, Workspace, WidgetConfig,
)
from .services import crm, storage
from .services.auth import (
    create_access_token,
    create_email_verify_token,
    create_invite_token,
    create_staff_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from .services.chunker import chunk_text
from .services.conversations import add_message, get_or_create_conversation, list_messages
from .services.email import send_email, send_invite_email, send_verification_email
from .services.embeddings import embed_texts
from .services.parser import DOCLING_EXTENSIONS, PLAIN_TEXT_EXTENSIONS, TABULAR_EXTENSIONS, extension_of
from .services.payments import razorpay_gateway, stripe_gateway
from .services.payments.gateways import gateway_out, upsert_gateway
from .services.payments.invoice import compute_gst_split, generate_invoice_html, render_invoice_pdf
from .services.payments.sequence import next_invoice_number
from .services.pii import mask_pii
from .services.plan_limits import (
    enforce_file_limit,
    enforce_message_limit,
    enforce_page_limit,
    enforce_seat_limit,
    enforce_trial_or_plan,
    get_usage_summary,
    start_trial,
)
from .services.qa import create_qa_pair
from .services.rag import answer_stream
from .services.routing import is_within_business_hours, route_team
from .services.tracing import get_langfuse


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    # Langfuse batches spans in a background thread; without this, traces
    # from the last few requests before a deploy/restart can be dropped.
    get_langfuse().flush()


app = FastAPI(title="SanchiJawab API", lifespan=lifespan)

# The widget is embedded on arbitrary customer domains by design — the
# public/w/* routes MUST be callable cross-origin from anywhere, there's no
# fixed frontend origin to allow-list. No cookies are used (auth is a
# Bearer token), so a wildcard origin here doesn't expose credentials.
# Per-bot domain restriction (FR-I2 allowed-domains, SAN-1106) is a separate
# app-level check (_enforce_domain_allowlist below), not a replacement for it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Auth (FR-A1) ────────────────────────────────────────────────────────


def _is_bootstrap_superadmin(email: str) -> bool:
    allowed = {e.strip().lower() for e in settings.superadmin_emails.split(",") if e.strip()}
    return email.strip().lower() in allowed


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    business_name: str


@app.post("/v1/auth/signup")
async def signup(body: SignupRequest):
    async with SessionLocal() as session:
        existing = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
        if existing:
            raise HTTPException(400, "Email already registered")

        tenant_id = str(uuid.uuid4())  # placeholder until sc_tenants integration is unblocked
        user = User(
            tenant_id=tenant_id, email=body.email, password_hash=hash_password(body.password),
            is_super_admin=_is_bootstrap_superadmin(body.email),
        )
        session.add(user)
        await session.flush()

        workspace = Workspace(tenant_id=tenant_id, name=body.business_name)
        await start_trial(workspace)
        session.add(workspace)
        await session.flush()

        session.add(Membership(tenant_id=tenant_id, workspace_id=workspace.id, user_id=user.id, role="owner"))
        await session.commit()

        verify_token = create_email_verify_token(user.id)
        email_sent = await send_verification_email(user.email, verify_token)

        return {
            "access_token": create_access_token(user.id, tenant_id),
            "workspace_id": workspace.id,
            "email_sent": email_sent,
            # Dev fallback for when SMTP_HOST isn't configured — a production
            # deploy with email delivery confirmed working should stop
            # returning this so the token isn't exposed over the API.
            "email_verify_token": verify_token,
        }


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@app.post("/v1/auth/login")
async def login(body: LoginRequest):
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
        if user is None or not verify_password(body.password, user.password_hash):
            raise HTTPException(401, "Invalid email or password")
        if not user.is_active:
            raise HTTPException(403, "This account has been deactivated")
        # Re-synced on every login (not just at signup) so adding an email to
        # SUPERADMIN_EMAILS promotes an existing account on its next login.
        should_be_admin = _is_bootstrap_superadmin(user.email)
        if user.is_super_admin != should_be_admin:
            user.is_super_admin = should_be_admin
            await session.commit()
        return {"access_token": create_access_token(user.id, user.tenant_id)}


@app.get("/v1/auth/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        db_user = await session.get(User, user.user_id)
        email = db_user.email if db_user else None
        is_super_admin = bool(db_user.is_super_admin) if db_user else False
    return {"user_id": user.user_id, "tenant_id": user.tenant_id, "email": email, "is_super_admin": is_super_admin}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@app.post("/v1/auth/change-password")
async def change_password(body: ChangePasswordRequest, user: CurrentUser = Depends(get_current_user)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    async with SessionLocal() as session:
        db_user = await session.get(User, user.user_id)
        if db_user is None or not verify_password(body.current_password, db_user.password_hash):
            raise HTTPException(401, "Current password is incorrect")
        db_user.password_hash = hash_password(body.new_password)
        await session.commit()
        return {"changed": True}


class VerifyEmailRequest(BaseModel):
    token: str


@app.post("/v1/auth/verify-email")
async def verify_email(body: VerifyEmailRequest):
    payload = decode_token(body.token, expected_type="email_verify")
    if payload is None:
        raise HTTPException(400, "Invalid or expired verification token")
    async with SessionLocal() as session:
        from datetime import datetime

        db_user = await session.get(User, payload["sub"])
        if db_user is None:
            raise HTTPException(404, "User not found")
        db_user.email_verified_at = datetime.utcnow()
        await session.commit()
    return {"verified": True}


# ─── Workspaces & bots (FR-A2), team roles (FR-A3) ──────────────────────


@app.get("/v1/workspaces")
async def list_workspaces(user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(Workspace, Membership.role)
                .join(Membership, Membership.workspace_id == Workspace.id)
                .where(Membership.user_id == user.user_id)
            )
        ).all()
        return [{"workspace_id": w.id, "name": w.name, "role": role} for w, role in rows]


class UpdateWorkspaceRequest(BaseModel):
    name: str


@app.patch("/v1/workspaces/{workspace_id}")
async def update_workspace(workspace_id: str, body: UpdateWorkspaceRequest, user: CurrentUser = Depends(get_current_user)):
    await require_workspace_role(workspace_id, user, min_role="admin")
    async with SessionLocal() as session:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(404, "Workspace not found")
        workspace.name = body.name.strip() or workspace.name
        await session.commit()
        return {"workspace_id": workspace.id, "name": workspace.name}


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "agent"  # owner|admin|agent|viewer


@app.get("/v1/workspaces/{workspace_id}/members")
async def list_members(workspace_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_workspace_role(workspace_id, user, min_role="viewer")
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(User, Membership)
                .join(Membership, Membership.user_id == User.id)
                .where(Membership.workspace_id == workspace_id)
                .order_by(Membership.created_at)
            )
        ).all()
        return [
            {
                "user_id": u.id, "email": u.email, "role": m.role,
                "active": bool(u.password_hash),  # invited-but-not-accepted users have no password yet
            }
            for u, m in rows
        ]


@app.post("/v1/workspaces/{workspace_id}/invitations")
async def invite_member(
    workspace_id: str, body: InviteRequest, user: CurrentUser = Depends(get_current_user)
):
    await require_workspace_role(workspace_id, user, min_role="admin")

    async with SessionLocal() as session:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(404, "Workspace not found")
        await enforce_trial_or_plan(session, workspace)
        await enforce_seat_limit(session, workspace)

        invited = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
        is_new_user = invited is None
        if invited is None:
            # Created with no usable password — accept-invite (below) sets a
            # real one once they follow the emailed link.
            invited = User(tenant_id=workspace.tenant_id, email=body.email, password_hash="")
            session.add(invited)
            await session.flush()

        existing = (
            await session.execute(
                select(Membership).where(
                    Membership.workspace_id == workspace_id, Membership.user_id == invited.id
                )
            )
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(400, "Already a member")

        session.add(
            Membership(tenant_id=workspace.tenant_id, workspace_id=workspace_id, user_id=invited.id, role=body.role)
        )
        await session.commit()

        email_sent = False
        invite_token = None
        if is_new_user:
            invite_token = create_invite_token(invited.id, workspace_id, body.role)
            email_sent = await send_invite_email(body.email, invite_token, workspace.name)

        return {
            "user_id": invited.id, "role": body.role, "email_sent": email_sent,
            # Dev fallback for when SMTP_HOST isn't configured, same convention
            # as signup's email_verify_token.
            "invite_token": invite_token,
        }


async def _get_membership_and_target(
    session: AsyncSession, workspace_id: str, target_user_id: str
) -> tuple[Membership, User]:
    membership = (
        await session.execute(
            select(Membership).where(Membership.workspace_id == workspace_id, Membership.user_id == target_user_id)
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(404, "Not a member of this workspace")
    target_user = await session.get(User, target_user_id)
    if target_user is None:
        raise HTTPException(404, "User not found")
    return membership, target_user


@app.post("/v1/workspaces/{workspace_id}/members/{target_user_id}/resend-invite")
async def resend_invite(workspace_id: str, target_user_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_workspace_role(workspace_id, user, min_role="admin")
    async with SessionLocal() as session:
        membership, target_user = await _get_membership_and_target(session, workspace_id, target_user_id)
        if target_user.password_hash:
            raise HTTPException(400, "This person has already accepted their invite")
        workspace = await session.get(Workspace, workspace_id)
        invite_token = create_invite_token(target_user.id, workspace_id, membership.role)
        email_sent = await send_invite_email(target_user.email, invite_token, workspace.name)
        return {"email_sent": email_sent, "invite_token": invite_token}


class UpdateMembershipRequest(BaseModel):
    role: str  # admin|agent|viewer — not owner, ownership isn't transferred through this


@app.patch("/v1/workspaces/{workspace_id}/members/{target_user_id}")
async def update_membership(
    workspace_id: str, target_user_id: str, body: UpdateMembershipRequest, user: CurrentUser = Depends(get_current_user)
):
    if body.role not in ("admin", "agent", "viewer"):
        raise HTTPException(422, "role must be admin, agent or viewer")
    await require_workspace_role(workspace_id, user, min_role="admin")
    async with SessionLocal() as session:
        membership, _ = await _get_membership_and_target(session, workspace_id, target_user_id)
        if membership.role == "owner":
            raise HTTPException(400, "Can't change the workspace owner's role")
        membership.role = body.role
        await session.commit()
        return {"user_id": target_user_id, "role": membership.role}


@app.delete("/v1/workspaces/{workspace_id}/members/{target_user_id}")
async def remove_member(workspace_id: str, target_user_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_workspace_role(workspace_id, user, min_role="admin")
    async with SessionLocal() as session:
        membership, _ = await _get_membership_and_target(session, workspace_id, target_user_id)
        if membership.role == "owner":
            raise HTTPException(400, "Can't remove the workspace owner")
        await session.delete(membership)
        await session.commit()
        return {"removed": True}


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


@app.post("/v1/auth/accept-invite")
async def accept_invite(body: AcceptInviteRequest):
    payload = decode_token(body.token, expected_type="invite")
    if payload is None:
        raise HTTPException(400, "Invalid or expired invite")

    async with SessionLocal() as session:
        db_user = await session.get(User, payload["sub"])
        if db_user is None:
            raise HTTPException(404, "User not found")
        if db_user.password_hash:
            raise HTTPException(400, "This invite has already been accepted")

        db_user.password_hash = hash_password(body.password)
        from datetime import datetime

        db_user.email_verified_at = datetime.utcnow()
        await session.commit()
        return {"access_token": create_access_token(db_user.id, db_user.tenant_id), "workspace_id": payload["workspace_id"]}


class CreateBotRequest(BaseModel):
    name: str


@app.post("/v1/workspaces/{workspace_id}/bots")
async def create_bot(
    workspace_id: str, body: CreateBotRequest, user: CurrentUser = Depends(get_current_user)
):
    await require_workspace_role(workspace_id, user, min_role="admin")

    async with SessionLocal() as session:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(404, "Workspace not found")
        bot = Bot(tenant_id=workspace.tenant_id, workspace_id=workspace_id, name=body.name)
        session.add(bot)
        await session.commit()
        return {"bot_id": bot.id}


@app.get("/v1/bots/{bot_id}")
async def get_bot(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="viewer")
        return {
            "bot_id": bot.id, "name": bot.name, "persona": bot.persona,
            "instructions": bot.instructions, "model_tier": bot.model_tier,
            "allowed_domains": bot.allowed_domains,
            "avatar_id": bot.avatar_id, "avatar_name": bot.avatar_name,
            "crm_webhook_url": bot.crm_webhook_url, "handoff_keywords": bot.handoff_keywords,
            "business_hours": bot.business_hours_json,
        }


@app.get("/v1/bots/{bot_id}/install-check")
async def install_check(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    """FR-I3 — "detect widget loaded on given URL, show status." We can't
    reach out and probe the customer's site ourselves (no guarantee it's
    even public, and a server-side fetch wouldn't execute the script tag
    anyway) — so this reports the most recent real evidence we have: the
    last time the widget's own config endpoint was actually hit, and from
    which host, which only happens if the script tag is really on the page.
    """
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="viewer")
        return {
            "installed": bot.widget_last_seen_at is not None,
            "last_seen_at": bot.widget_last_seen_at.isoformat() if bot.widget_last_seen_at else None,
            "last_seen_host": bot.widget_last_seen_host,
        }


class UpdateBotRequest(BaseModel):
    name: str | None = None
    persona: str | None = None
    instructions: str | None = None
    model_tier: str | None = None
    allowed_domains: list[str] | None = None
    avatar_id: str | None = None
    avatar_name: str | None = None
    crm_webhook_url: str | None = None
    handoff_keywords: str | None = None
    business_hours: dict | None = None


@app.patch("/v1/bots/{bot_id}")
async def update_bot(bot_id: str, body: UpdateBotRequest, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        for field in (
            "name", "persona", "instructions", "model_tier", "avatar_id", "avatar_name",
            "crm_webhook_url", "handoff_keywords",
        ):
            value = getattr(body, field)
            if value is not None:
                setattr(bot, field, value)
        if body.allowed_domains is not None:
            bot.allowed_domains = [d.strip().lower() for d in body.allowed_domains if d.strip()]
        if body.business_hours is not None:
            bot.business_hours_json = body.business_hours
        await session.commit()
        return {
            "bot_id": bot.id, "name": bot.name, "persona": bot.persona,
            "instructions": bot.instructions, "model_tier": bot.model_tier,
            "allowed_domains": bot.allowed_domains,
            "avatar_id": bot.avatar_id, "avatar_name": bot.avatar_name,
            "crm_webhook_url": bot.crm_webhook_url, "handoff_keywords": bot.handoff_keywords,
            "business_hours": bot.business_hours_json,
        }


@app.delete("/v1/bots/{bot_id}")
async def delete_bot(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        source_ids = (await session.execute(select(Source.id).where(Source.bot_id == bot_id))).scalars().all()
        conversation_ids = (
            await session.execute(select(Conversation.id).where(Conversation.bot_id == bot_id))
        ).scalars().all()

        # No DB-level ON DELETE CASCADE on these FKs, so children go first,
        # deepest first, or Postgres rejects the final bot delete. Chunk has
        # a FK to Document, so it must be deleted before Document is.
        if conversation_ids:
            await session.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
            await session.execute(delete(Lead).where(Lead.conversation_id.in_(conversation_ids)))
        await session.execute(delete(Chunk).where(Chunk.bot_id == bot_id))
        if source_ids:
            await session.execute(delete(IngestJob).where(IngestJob.source_id.in_(source_ids)))
            await session.execute(delete(Document).where(Document.source_id.in_(source_ids)))
        await session.execute(delete(Source).where(Source.bot_id == bot_id))
        await session.execute(delete(Conversation).where(Conversation.bot_id == bot_id))
        await session.execute(delete(QAPair).where(QAPair.bot_id == bot_id))
        await session.execute(delete(WidgetConfig).where(WidgetConfig.bot_id == bot_id))
        await session.execute(delete(ToolConnection).where(ToolConnection.bot_id == bot_id))
        # routing_rules has a FK to teams, so it goes first.
        await session.execute(delete(RoutingRule).where(RoutingRule.bot_id == bot_id))
        await session.execute(delete(Team).where(Team.bot_id == bot_id))
        await session.delete(bot)
        await session.commit()
        return {"deleted": True}


class CreateTeamRequest(BaseModel):
    name: str


@app.get("/v1/bots/{bot_id}/teams")
async def list_teams(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="viewer")

        teams = (await session.execute(select(Team).where(Team.bot_id == bot_id))).scalars().all()
        return [{"team_id": t.id, "name": t.name} for t in teams]


@app.post("/v1/bots/{bot_id}/teams")
async def create_team(bot_id: str, body: CreateTeamRequest, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        team = Team(tenant_id=bot.tenant_id, bot_id=bot_id, name=body.name)
        session.add(team)
        await session.commit()
        return {"team_id": team.id, "name": team.name}


@app.delete("/v1/teams/{team_id}")
async def delete_team(team_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        team = await session.get(Team, team_id)
        if team is None:
            raise HTTPException(404, "Team not found")
        bot = await session.get(Bot, team.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        await session.execute(delete(RoutingRule).where(RoutingRule.team_id == team_id))
        await session.execute(
            update(Conversation).where(Conversation.routed_team_id == team_id).values(routed_team_id=None)
        )
        await session.delete(team)
        await session.commit()
        return {"deleted": True}


class RoutingRuleRequest(BaseModel):
    team_id: str
    page_pattern: str = ""
    language: str = ""
    priority: int = 0


@app.get("/v1/bots/{bot_id}/routing-rules")
async def list_routing_rules(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="viewer")

        rules = (
            await session.execute(
                select(RoutingRule).where(RoutingRule.bot_id == bot_id).order_by(RoutingRule.priority.asc())
            )
        ).scalars().all()
        return [
            {
                "rule_id": r.id, "team_id": r.team_id, "page_pattern": r.page_pattern,
                "language": r.language, "priority": r.priority,
            }
            for r in rules
        ]


@app.post("/v1/bots/{bot_id}/routing-rules")
async def create_routing_rule(bot_id: str, body: RoutingRuleRequest, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        team = await session.get(Team, body.team_id)
        if team is None or team.bot_id != bot_id:
            raise HTTPException(404, "Team not found")

        rule = RoutingRule(
            tenant_id=bot.tenant_id, bot_id=bot_id, team_id=body.team_id,
            page_pattern=body.page_pattern.strip(), language=body.language.strip(), priority=body.priority,
        )
        session.add(rule)
        await session.commit()
        return {
            "rule_id": rule.id, "team_id": rule.team_id, "page_pattern": rule.page_pattern,
            "language": rule.language, "priority": rule.priority,
        }


@app.delete("/v1/routing-rules/{rule_id}")
async def delete_routing_rule(rule_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        rule = await session.get(RoutingRule, rule_id)
        if rule is None:
            raise HTTPException(404, "Routing rule not found")
        bot = await session.get(Bot, rule.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        await session.delete(rule)
        await session.commit()
        return {"deleted": True}


DEFAULT_WIDGET_TEXTS = {"welcome": "Hi! Ask me anything.", "header": "Chat with us"}
DEFAULT_CONSENT_TEXT = (
    "By using this chat, you agree that your messages may be stored and used to provide support. "
    "Don't share sensitive personal information."
)


@app.get("/v1/bots/{bot_id}/widget-config")
async def get_widget_config(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="viewer")

        config = await session.get(WidgetConfig, bot_id)
        if config is None:
            config = WidgetConfig(bot_id=bot_id, tenant_id=bot.tenant_id, texts_json=DEFAULT_WIDGET_TEXTS)
            session.add(config)
            await session.commit()
        return {
            "primary_color": config.primary_color, "theme": config.theme,
            "position": config.position, "texts": config.texts_json or DEFAULT_WIDGET_TEXTS,
            "consent_text": config.consent_text or DEFAULT_CONSENT_TEXT,
            "require_consent": config.require_consent,
        }


class UpdateWidgetConfigRequest(BaseModel):
    primary_color: str | None = None
    theme: str | None = None
    position: str | None = None
    welcome: str | None = None
    header: str | None = None
    consent_text: str | None = None
    require_consent: bool | None = None


@app.put("/v1/bots/{bot_id}/widget-config")
async def update_widget_config(
    bot_id: str, body: UpdateWidgetConfigRequest, user: CurrentUser = Depends(get_current_user)
):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        config = await session.get(WidgetConfig, bot_id)
        if config is None:
            config = WidgetConfig(bot_id=bot_id, tenant_id=bot.tenant_id, texts_json=dict(DEFAULT_WIDGET_TEXTS))
            session.add(config)

        if body.primary_color is not None:
            config.primary_color = body.primary_color
        if body.theme is not None:
            config.theme = body.theme
        if body.position is not None:
            config.position = body.position
        texts = dict(config.texts_json or DEFAULT_WIDGET_TEXTS)
        if body.welcome is not None:
            texts["welcome"] = body.welcome
        if body.header is not None:
            texts["header"] = body.header
        config.texts_json = texts
        if body.consent_text is not None:
            config.consent_text = body.consent_text
        if body.require_consent is not None:
            config.require_consent = body.require_consent

        await session.commit()
        return {
            "primary_color": config.primary_color, "theme": config.theme,
            "position": config.position, "texts": config.texts_json,
            "consent_text": config.consent_text or DEFAULT_CONSENT_TEXT,
            "require_consent": config.require_consent,
        }


@app.get("/v1/workspaces/{workspace_id}/bots")
async def list_bots(workspace_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_workspace_role(workspace_id, user, min_role="viewer")
    async with SessionLocal() as session:
        bots = (await session.execute(select(Bot).where(Bot.workspace_id == workspace_id))).scalars().all()
        return [{"bot_id": b.id, "name": b.name, "created_at": b.created_at.isoformat()} for b in bots]


# ─── Knowledge sources ────────────────────────────────────────────────────


SOURCE_MODES = {"single_page", "sitemap", "whole_domain"}


class CreateSourceRequest(BaseModel):
    bot_id: str
    url: str
    visibility: str = "customer"
    mode: str = "whole_domain"
    include_patterns: str = ""
    exclude_patterns: str = ""
    max_pages: int = 40  # same hard crawl cap as before (SAN-1082); raise per-source if a site genuinely needs more
    ownership_confirmed: bool = False  # SAN-1083/FR-K4 — must be explicitly true; we crawl on the customer's behalf, not public scraping
    rescan_interval_days: int = 7  # SAN-1088/FR-K10 — how often this source re-crawls itself automatically


@app.post("/v1/sources")
async def create_source(body: CreateSourceRequest, user: CurrentUser = Depends(get_current_user)):
    if body.mode not in SOURCE_MODES:
        raise HTTPException(422, f"mode must be one of {sorted(SOURCE_MODES)}")
    if not 1 <= body.max_pages <= 500:
        raise HTTPException(422, "max_pages must be between 1 and 500")
    if not body.ownership_confirmed:
        raise HTTPException(422, "You must confirm you own this site or have permission to crawl it")
    if not 5 <= body.rescan_interval_days <= 365:
        raise HTTPException(422, "rescan_interval_days must be between 5 and 365")

    async with SessionLocal() as session:
        bot = await session.get(Bot, body.bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        workspace = await session.get(Workspace, bot.workspace_id)
        await enforce_trial_or_plan(session, workspace)
        await enforce_page_limit(session, workspace)

        source = Source(
            tenant_id=bot.tenant_id, bot_id=body.bot_id, type="website",
            url=body.url, visibility=body.visibility, status="pending",
            ownership_confirmed=body.ownership_confirmed,
            mode=body.mode, include_patterns=body.include_patterns,
            exclude_patterns=body.exclude_patterns, max_pages=body.max_pages,
            rescan_interval_days=body.rescan_interval_days,
            next_scan_at=datetime.utcnow() + timedelta(days=body.rescan_interval_days),
        )
        session.add(source)
        await session.flush()

        job = IngestJob(tenant_id=bot.tenant_id, source_id=source.id, status="queued")
        session.add(job)
        await session.commit()

        return {"source_id": source.id, "job_id": job.id, "status": "queued"}


@app.post("/v1/sources/file")
async def create_file_source(
    bot_id: str = Form(...),
    visibility: str = Form("customer"),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    ext = extension_of(file.filename or "")
    if ext not in DOCLING_EXTENSIONS | PLAIN_TEXT_EXTENSIONS | TABULAR_EXTENSIONS:
        raise HTTPException(
            400, f"Unsupported file type: {ext or file.filename!r}. Supported: PDF, DOCX, PPTX, TXT, MD, CSV, TSV, XLSX."
        )

    data = await file.read()
    max_bytes = settings.max_file_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(400, f"File exceeds {settings.max_file_mb}MB limit")

    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        workspace = await session.get(Workspace, bot.workspace_id)
        await enforce_trial_or_plan(session, workspace)
        await enforce_file_limit(session, workspace)

        key = f"{bot.tenant_id}/{bot_id}/{uuid.uuid4()}-{file.filename}"
        storage.upload_bytes(key, data, file.content_type or "application/octet-stream")

        source = Source(
            tenant_id=bot.tenant_id, bot_id=bot_id, type="file",
            file_key=key, visibility=visibility, status="pending",
        )
        session.add(source)
        await session.flush()

        job = IngestJob(tenant_id=bot.tenant_id, source_id=source.id, status="queued")
        session.add(job)
        await session.commit()

        return {"source_id": source.id, "job_id": job.id, "status": "queued"}


@app.get("/v1/sources/{job_id}/status")
async def source_status(job_id: int, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        job = await session.get(IngestJob, job_id)
        if job is None or job.tenant_id != user.tenant_id:
            raise HTTPException(404, "Not found")
        return {
            "job_id": job.id, "status": job.status, "error": job.error,
            "pages_done": job.pages_done, "pages_total": job.pages_total,
        }


@app.get("/v1/sources/{job_id}/status/stream")
async def source_status_stream(job_id: int, token: str):
    """SSE progress for an ingest job (SAN-1123) — a sibling to the
    polling GET above, not a replacement for it. The browser's native
    EventSource can't send an Authorization header, so the token travels
    as a query param here specifically; every other endpoint keeps using
    the Bearer header. Checked once at connection open (same depth as
    get_current_user), not re-checked per tick — this stream is meant to
    live only as long as one crawl does, not an open-ended session."""
    payload = decode_token(token, expected_type="access")
    if payload is None:
        raise HTTPException(401, "Invalid or expired token")
    async with SessionLocal() as session:
        db_user = await session.get(User, payload["sub"])
    if db_user is None or not db_user.is_active:
        raise HTTPException(401, "This account has been deactivated")
    tenant_id = payload["tenant_id"]

    async def event_stream():
        last_sent = None
        ticks_since_data = 0
        while True:
            async with SessionLocal() as session:
                job = await session.get(IngestJob, job_id)
            if job is None or job.tenant_id != tenant_id:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Not found'})}\n\n"
                return
            current = {
                "type": "progress", "job_id": job.id, "status": job.status,
                "error": job.error, "pages_done": job.pages_done, "pages_total": job.pages_total,
            }
            if current != last_sent:
                yield f"data: {json.dumps(current)}\n\n"
                last_sent = current
                ticks_since_data = 0
            else:
                # A job queued behind others can sit at "queued" for a real,
                # unbounded stretch (confirmed live: 23s behind one other
                # job) with nothing new to report — a comment line keeps
                # the connection from going dark long enough to trip a
                # client or proxy idle-timeout, without changing the event
                # stream a consumer actually parses.
                ticks_since_data += 1
                if ticks_since_data % 10 == 0:
                    yield ": keep-alive\n\n"
            if job.status in ("done", "failed", "cancelled"):
                return
            await asyncio.sleep(1.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/v1/bots/{bot_id}/sources")
async def list_sources(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="viewer")

        sources = (await session.execute(select(Source).where(Source.bot_id == bot_id))).scalars().all()
        result = []
        for s in sources:
            job = (
                await session.execute(
                    select(IngestJob).where(IngestJob.source_id == s.id).order_by(IngestJob.id.desc())
                )
            ).scalars().first()
            display = s.url or (s.file_key.rsplit("/", 1)[-1] if s.file_key else "unknown")
            result.append({
                "source_id": s.id, "url": display, "type": s.type, "visibility": s.visibility,
                "job_status": job.status if job else None, "job_error": job.error if job else None,
                "pages_done": job.pages_done if job else None, "pages_total": job.pages_total if job else None,
                "rescan_interval_days": s.rescan_interval_days,
                "next_scan_at": s.next_scan_at.isoformat() if s.next_scan_at else None,
            })
        return result


@app.post("/v1/sources/{source_id}/rescan")
async def rescan_source(source_id: str, user: CurrentUser = Depends(get_current_user)):
    """Manually re-trigger a crawl for an already-created website source
    (SAN-1087, FR-K9) — goes through the same queue/worker path as the
    initial crawl (worker.py polls every 2s), so a small source clears
    comfortably within the feature's 2-minute re-index target."""
    async with SessionLocal() as session:
        source = await session.get(Source, source_id)
        if source is None:
            raise HTTPException(404, "Source not found")
        if source.type != "website":
            raise HTTPException(400, "Only website sources can be re-scanned")
        bot = await session.get(Bot, source.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        in_flight = (
            await session.execute(
                select(IngestJob.id).where(IngestJob.source_id == source_id, IngestJob.status.in_(["queued", "running"]))
            )
        ).first()
        if in_flight:
            raise HTTPException(409, "A crawl is already in progress for this source")

        source.status = "pending"
        # Re-scanning now means the schedule restarts from now too, not from
        # whenever the last automatic run happened to land (SAN-1088).
        source.next_scan_at = datetime.utcnow() + timedelta(days=source.rescan_interval_days)
        job = IngestJob(tenant_id=source.tenant_id, source_id=source.id, status="queued")
        session.add(job)
        await session.commit()
        return {"source_id": source.id, "job_id": job.id, "status": "queued"}


@app.post("/v1/sources/{source_id}/stop")
async def stop_source(source_id: str, user: CurrentUser = Depends(get_current_user)):
    """Stops an in-progress crawl (SAN-1088, FR-K10) — sets a flag the
    worker checks between page fetches (see CrawlCancelled in ingest.py);
    the request returns immediately, the crawl itself winds down on its
    own next checkpoint rather than being killed mid-request."""
    async with SessionLocal() as session:
        source = await session.get(Source, source_id)
        if source is None:
            raise HTTPException(404, "Source not found")
        bot = await session.get(Bot, source.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        job = (
            await session.execute(
                select(IngestJob)
                .where(IngestJob.source_id == source_id, IngestJob.status.in_(["queued", "running"]))
                .order_by(IngestJob.id.desc())
            )
        ).scalars().first()
        if job is None:
            raise HTTPException(400, "No crawl is currently in progress for this source")

        job.cancel_requested = True
        await session.commit()
        return {"job_id": job.id, "status": job.status}


class UpdateSourceRequest(BaseModel):
    rescan_interval_days: int


@app.patch("/v1/sources/{source_id}")
async def update_source(source_id: str, body: UpdateSourceRequest, user: CurrentUser = Depends(get_current_user)):
    if not 5 <= body.rescan_interval_days <= 365:
        raise HTTPException(422, "rescan_interval_days must be between 5 and 365")
    async with SessionLocal() as session:
        source = await session.get(Source, source_id)
        if source is None:
            raise HTTPException(404, "Source not found")
        bot = await session.get(Bot, source.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        source.rescan_interval_days = body.rescan_interval_days
        source.next_scan_at = datetime.utcnow() + timedelta(days=body.rescan_interval_days)
        await session.commit()
        return {"source_id": source.id, "rescan_interval_days": source.rescan_interval_days}


async def _get_document_for_user(session, document_id: str, user: CurrentUser, min_role: str) -> tuple[Document, Source]:
    doc = await session.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "Page not found")
    source = await session.get(Source, doc.source_id)
    bot = await session.get(Bot, source.bot_id)
    await require_workspace_role(bot.workspace_id, user, min_role=min_role)
    return doc, source


@app.get("/v1/sources/{source_id}/documents")
async def list_documents(source_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        source = await session.get(Source, source_id)
        if source is None:
            raise HTTPException(404, "Source not found")
        bot = await session.get(Bot, source.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="viewer")

        docs = (await session.execute(select(Document).where(Document.source_id == source_id))).scalars().all()
        return [
            {
                "document_id": d.id, "url": d.url, "title": d.title, "status": d.status,
                "disabled": d.disabled, "error": d.error,
                "last_crawled_at": d.last_crawled_at.isoformat() if d.last_crawled_at else None,
            }
            for d in docs
        ]


@app.get("/v1/documents/{document_id}")
async def get_document(document_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        doc, _ = await _get_document_for_user(session, document_id, user, min_role="viewer")
        return {
            "document_id": doc.id, "url": doc.url, "title": doc.title, "status": doc.status,
            "disabled": doc.disabled, "content": doc.raw_text,
        }


class EditDocumentRequest(BaseModel):
    content: str


@app.patch("/v1/documents/{document_id}")
async def edit_document(document_id: str, body: EditDocumentRequest, user: CurrentUser = Depends(get_current_user)):
    """Overrides a page's indexed content directly (SAN-1087, FR-K9) —
    re-chunks/re-embeds synchronously in-request rather than going through
    the crawl queue, since this is one page's worth of work; comfortably
    inside the feature's 2-minute re-index target."""
    async with SessionLocal() as session:
        doc, source = await _get_document_for_user(session, document_id, user, min_role="admin")

        await session.execute(delete(Chunk).where(Chunk.document_id == doc.id))
        stats = {"pages": 0, "chunks": 0, "skipped": 0}
        pieces = chunk_text(body.content)
        content_hash = hashlib.sha256("\n\n".join(pieces).encode("utf-8")).hexdigest()
        doc.raw_text = body.content
        doc.content_hash = content_hash
        doc.disabled = False
        doc.status = "indexed"
        doc.error = None

        if not pieces:
            doc.status = "failed"
            doc.error = "no extractable content"
        else:
            vectors = embed_texts(pieces)
            for text, vector in zip(pieces, vectors):
                session.add(Chunk(
                    tenant_id=source.tenant_id, bot_id=source.bot_id, document_id=doc.id,
                    visibility=source.visibility, text=text, embedding=vector,
                ))
                stats["chunks"] += 1
            stats["pages"] += 1

        await session.commit()
        return {"document_id": doc.id, "status": doc.status, "stats": stats}


async def _set_document_disabled(document_id: str, user: CurrentUser, disabled: bool) -> dict:
    async with SessionLocal() as session:
        doc, source = await _get_document_for_user(document_id=document_id, session=session, user=user, min_role="admin")
        doc.disabled = disabled
        await session.execute(delete(Chunk).where(Chunk.document_id == doc.id))

        if not disabled and doc.raw_text:
            pieces = chunk_text(doc.raw_text)
            if pieces:
                vectors = embed_texts(pieces)
                for text, vector in zip(pieces, vectors):
                    session.add(Chunk(
                        tenant_id=source.tenant_id, bot_id=source.bot_id, document_id=doc.id,
                        visibility=source.visibility, text=text, embedding=vector,
                    ))
            doc.status = "indexed"
        elif disabled:
            doc.status = "disabled"

        await session.commit()
        return {"document_id": doc.id, "disabled": doc.disabled, "status": doc.status}


@app.post("/v1/documents/{document_id}/disable")
async def disable_document(document_id: str, user: CurrentUser = Depends(get_current_user)):
    """Removes one page from retrieval without deleting it (SAN-1087,
    FR-K9) — deletes its chunks (so the hybrid retrieval query just finds
    nothing for it, no query-side filtering needed) but keeps raw_text so
    re-enabling is a re-chunk/re-embed, not a full re-crawl."""
    return await _set_document_disabled(document_id, user, disabled=True)


@app.post("/v1/documents/{document_id}/enable")
async def enable_document(document_id: str, user: CurrentUser = Depends(get_current_user)):
    return await _set_document_disabled(document_id, user, disabled=False)


@app.delete("/v1/documents/{document_id}")
async def delete_document(document_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        doc, _ = await _get_document_for_user(session, document_id, user, min_role="admin")
        await session.execute(delete(Chunk).where(Chunk.document_id == doc.id))
        await session.delete(doc)
        await session.commit()
        return {"deleted": True}


@app.delete("/v1/sources/{source_id}")
async def delete_source(source_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        source = await session.get(Source, source_id)
        if source is None:
            raise HTTPException(404, "Source not found")
        bot = await session.get(Bot, source.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="admin")

        # Chunks reference bot_id, not source_id directly, but every chunk
        # for this source came from one of its documents — look those up
        # before deleting the documents, so a re-crawled source's other
        # documents stay untouched.
        doc_ids = (await session.execute(select(Document.id).where(Document.source_id == source_id))).scalars().all()
        if doc_ids:
            await session.execute(delete(Chunk).where(Chunk.document_id.in_(doc_ids)))
        await session.execute(delete(IngestJob).where(IngestJob.source_id == source_id))
        await session.execute(delete(Document).where(Document.source_id == source_id))
        await session.delete(source)
        await session.commit()
        return {"deleted": True}


# ─── Public widget API — no user auth; bot_id's tenant is looked up ──────
# server-side, never trusted from the request body. FR-I2 domain allow-list:
# an empty Bot.allowed_domains means unrestricted (default, back-compat);
# once set, only requests whose Origin/Referer host matches are served.


def _request_hostname(request: Request) -> str | None:
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin:
        return None
    try:
        return urlparse(origin).hostname
    except ValueError:
        return None


def _domain_allowed(hostname: str | None, allowed: list[str]) -> bool:
    if not allowed:
        return True
    if not hostname:
        return False
    hostname = hostname.lower()
    return any(hostname == d or hostname.endswith("." + d) for d in allowed)


def _enforce_domain_allowlist(bot: Bot, request: Request) -> None:
    if not _domain_allowed(_request_hostname(request), bot.allowed_domains):
        raise HTTPException(403, "This bot is not permitted to be embedded on this domain")


@app.get("/public/w/{bot_id}/config")
async def public_widget_config(bot_id: str, request: Request):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        _enforce_domain_allowlist(bot, request)
        # FR-I3 install check: every real page load of the widget hits this
        # endpoint, so recording it here (not the chat endpoint, which only
        # fires once a visitor actually sends a message) is what lets the
        # dashboard say "yes, we've seen the script tag load" right after
        # install, before anyone's asked it anything.
        bot.widget_last_seen_at = datetime.utcnow()
        bot.widget_last_seen_host = _request_hostname(request)
        await session.commit()
        config = await session.get(WidgetConfig, bot_id)
        texts = (config.texts_json if config else None) or DEFAULT_WIDGET_TEXTS
        return {
            "business_name": texts.get("header") or bot.name,
            "primary_color": config.primary_color if config else "#3D46C9",
            "position": config.position if config else "right",
            "welcome_message": texts.get("welcome", DEFAULT_WIDGET_TEXTS["welcome"]),
            "require_consent": config.require_consent if config else True,
            "consent_text": (config.consent_text if config else "") or DEFAULT_CONSENT_TEXT,
            "avatar_id": bot.avatar_id,
            "avatar_name": bot.avatar_name,
        }


class ChatRequest(BaseModel):
    business_name: str = "this business"
    message: str
    history: list[dict] = []
    conversation_id: str | None = None
    visitor_id: str | None = None
    page_url: str = ""


@app.post("/public/w/{bot_id}/chat")
async def public_chat(bot_id: str, body: ChatRequest, request: Request):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        workspace = await session.get(Workspace, bot.workspace_id) if bot else None
    if bot is None:
        raise HTTPException(404, "Bot not found")
    if bot.status != "live":
        # Was previously never checked anywhere — a super admin "suspending"
        # a bot updated this field but the widget kept answering regardless.
        raise HTTPException(403, "This assistant isn't currently available")
    if workspace is None or not workspace.is_active:
        raise HTTPException(403, "This assistant isn't currently available")
    _enforce_domain_allowlist(bot, request)

    async with SessionLocal() as session:
        await enforce_trial_or_plan(session, workspace)
        await enforce_message_limit(session, workspace)

    async with SessionLocal() as session:
        conv = await get_or_create_conversation(
            session, conversation_id=body.conversation_id, tenant_id=bot.tenant_id,
            bot_id=bot_id, visitor_id=body.visitor_id, page_url=body.page_url, language="en",
        )
        await add_message(session, conversation_id=conv.id, tenant_id=bot.tenant_id, role="visitor", content=body.message)
        await session.commit()
        conversation_id = conv.id
        already_handed_off = conv.status in ("waiting", "human")

    async def event_stream():
        yield f"data: {json.dumps({'type': 'conversation', 'conversation_id': conversation_id})}\n\n"

        if already_handed_off:
            # A human has already taken over (or is queued to) — the bot stays
            # quiet so it doesn't talk over the agent; the message above is
            # just stored for them to see in the Inbox.
            yield f"data: {json.dumps({'type': 'done', 'no_answer': False, 'sources': [], 'handed_off': True})}\n\n"
            return

        full_text = ""
        sources: list[dict] = []
        handoff = False
        within_hours = True
        routed_team_id: str | None = None
        routed_team_name: str | None = None
        no_answer = False
        async with SessionLocal() as session:
            async for event in answer_stream(
                session, tenant_id=bot.tenant_id, bot_id=bot_id,
                business_name=body.business_name, message=body.message, history=body.history,
                conversation_id=conversation_id, visitor_id=body.visitor_id,
            ):
                if event["type"] == "delta":
                    full_text += event.get("text") or ""
                elif event["type"] == "handoff":
                    handoff = True
                    # Business hours + routing (SAN-1112, FR-H3) are decided
                    # once, right here, from the conversation's state as of
                    # the handoff — not re-evaluated later if rules/hours
                    # change, same as any other point-in-time decision in
                    # this flow (e.g. consecutive_low_confidence resetting).
                    within_hours = is_within_business_hours(bot.business_hours_json)
                    conv_now = await session.get(Conversation, conversation_id)
                    if conv_now is not None:
                        routed_team_id = await route_team(
                            session, bot_id=bot_id, page_url=conv_now.page_url, language=conv_now.language,
                        )
                        if routed_team_id:
                            team = await session.get(Team, routed_team_id)
                            routed_team_name = team.name if team else None
                    event = {**event, "within_business_hours": within_hours, "team": routed_team_name}
                elif event["type"] == "done":
                    sources = event.get("sources") or []
                    no_answer = bool(event.get("no_answer"))
                yield f"data: {json.dumps(event)}\n\n"

        async with SessionLocal() as session:
            if handoff:
                conv2 = await session.get(Conversation, conversation_id)
                if conv2 is not None:
                    conv2.status = "waiting"
                    conv2.routed_team_id = routed_team_id
                if within_hours:
                    reply = (
                        f"Connecting you with our {routed_team_name} team — someone will be with you shortly."
                        if routed_team_name
                        else "Connecting you with our team — someone will be with you shortly."
                    )
                else:
                    reply = (
                        "We're currently outside business hours — leave your details and our"
                        f" {routed_team_name} team will get back to you as soon as we're back."
                        if routed_team_name
                        else "We're currently outside business hours — leave your details and we'll get back to you as soon as we're back."
                    )
                await add_message(
                    session, conversation_id=conversation_id, tenant_id=bot.tenant_id,
                    role="bot", content=reply,
                )
            elif full_text:
                # confidence is a crude proxy (0.0/1.0), not a real score — just
                # enough to power the "unanswered/low-confidence" report (FR-R2).
                # mask_pii is a backstop for the *stored* transcript (Inbox,
                # analytics, exports) — ANSWER_SYSTEM already tells the model
                # not to echo contact details back, which is what actually
                # protects the live-streamed response already sent above.
                msg = await add_message(
                    session, conversation_id=conversation_id, tenant_id=bot.tenant_id,
                    role="bot", content=mask_pii(full_text), sources=sources,
                    confidence=0.0 if no_answer else 1.0,
                )
                await session.commit()
                # Sent after "done" so the widget can attach thumbs up/down to
                # the exact persisted message without blocking the stream on
                # the DB write.
                yield f"data: {json.dumps({'type': 'message_saved', 'message_id': msg.id})}\n\n"
                return
            await session.commit()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/public/w/{bot_id}/conversations/{conversation_id}/messages")
async def public_conversation_messages(bot_id: str, conversation_id: str, request: Request, after: str | None = None):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        _enforce_domain_allowlist(bot, request)

        conv = await session.get(Conversation, conversation_id)
        if conv is None or conv.bot_id != bot_id:
            raise HTTPException(404, "Conversation not found")

        rows = await list_messages(session, conversation_id=conversation_id, after_id=after)
        return {
            "status": conv.status,
            "messages": [
                {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
                for m in rows
            ],
        }


class RatingRequest(BaseModel):
    rating: int  # 1 (thumbs up) or -1 (thumbs down)


@app.post("/public/w/{bot_id}/messages/{message_id}/rating")
async def public_rate_message(bot_id: str, message_id: str, body: RatingRequest, request: Request):
    if body.rating not in (1, -1):
        raise HTTPException(400, "rating must be 1 or -1")

    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        _enforce_domain_allowlist(bot, request)

        msg = await session.get(Message, message_id)
        if msg is None:
            raise HTTPException(404, "Message not found")
        conv = await session.get(Conversation, msg.conversation_id)
        if conv is None or conv.bot_id != bot_id:
            raise HTTPException(404, "Message not found")

        msg.rating = body.rating
        await session.commit()
        return {"message_id": msg.id, "rating": msg.rating}


class LeadRequest(BaseModel):
    conversation_id: str
    name: str = ""
    email: str = ""
    phone: str = ""


async def _push_lead_and_record(bot_id: str, bot_name: str, webhook_url: str, lead_id: str, name: str, email: str, phone: str) -> None:
    ok = await crm.push_lead(webhook_url, lead_id=lead_id, bot_id=bot_id, bot_name=bot_name, name=name, email=email, phone=phone)
    if ok:
        async with SessionLocal() as session:
            lead = await session.get(Lead, lead_id)
            if lead is not None:
                lead.pushed_to_crm = True
                await session.commit()


@app.post("/public/w/{bot_id}/lead")
async def public_create_lead(bot_id: str, body: LeadRequest, request: Request, background_tasks: BackgroundTasks):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        _enforce_domain_allowlist(bot, request)

        conv = await session.get(Conversation, body.conversation_id)
        if conv is None or conv.bot_id != bot_id:
            raise HTTPException(404, "Conversation not found")

        lead = Lead(
            tenant_id=bot.tenant_id, conversation_id=conv.id,
            name=body.name, email=body.email, phone=body.phone,
        )
        session.add(lead)
        await session.commit()

        if bot.crm_webhook_url:
            # Fire-and-forget: the visitor's response shouldn't wait on (or
            # fail because of) some third-party webhook being slow/down.
            background_tasks.add_task(
                _push_lead_and_record, bot_id, bot.name, bot.crm_webhook_url, lead.id, body.name, body.email, body.phone,
            )
        return {"lead_id": lead.id}


# ─── Inbox (FR-H1) — dashboard-side, auth required ───────────────────────


@app.get("/v1/bots/{bot_id}/conversations")
async def list_conversations(
    bot_id: str, status: str | None = None, team_id: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        stmt = select(Conversation).where(Conversation.bot_id == bot_id).order_by(Conversation.started_at.desc())
        if status:
            stmt = stmt.where(Conversation.status == status)
        if team_id:
            stmt = stmt.where(Conversation.routed_team_id == team_id)
        convs = (await session.execute(stmt)).scalars().all()

        team_ids = {c.routed_team_id for c in convs if c.routed_team_id}
        teams = {}
        if team_ids:
            team_rows = (await session.execute(select(Team).where(Team.id.in_(team_ids)))).scalars().all()
            teams = {t.id: t.name for t in team_rows}

        result = []
        for c in convs:
            last = (
                await session.execute(
                    select(Message).where(Message.conversation_id == c.id).order_by(Message.created_at.desc())
                )
            ).scalars().first()
            result.append({
                "conversation_id": c.id, "status": c.status, "visitor_id": c.visitor_id,
                "page_url": c.page_url, "started_at": c.started_at.isoformat(),
                "last_message": last.content[:140] if last else None,
                "team": teams.get(c.routed_team_id),
            })
        return result


@app.get("/v1/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        conv = await session.get(Conversation, conversation_id)
        if conv is None:
            raise HTTPException(404, "Conversation not found")
        bot = await session.get(Bot, conv.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        rows = await list_messages(session, conversation_id=conversation_id)
        leads = (
            await session.execute(select(Lead).where(Lead.conversation_id == conversation_id))
        ).scalars().all()
        team = await session.get(Team, conv.routed_team_id) if conv.routed_team_id else None
        return {
            "conversation_id": conv.id, "status": conv.status, "visitor_id": conv.visitor_id,
            "page_url": conv.page_url, "started_at": conv.started_at.isoformat(),
            "team": team.name if team else None,
            "messages": [
                {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
                for m in rows
            ],
            "leads": [{"name": lead.name, "email": lead.email, "phone": lead.phone} for lead in leads],
        }


class ReplyRequest(BaseModel):
    message: str


@app.post("/v1/conversations/{conversation_id}/reply")
async def reply_conversation(conversation_id: str, body: ReplyRequest, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        conv = await session.get(Conversation, conversation_id)
        if conv is None:
            raise HTTPException(404, "Conversation not found")
        bot = await session.get(Bot, conv.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        conv.status = "human"
        conv.assigned_agent_id = user.user_id
        msg = await add_message(
            session, conversation_id=conversation_id, tenant_id=conv.tenant_id,
            role="agent", content=body.message,
        )
        await session.commit()
        return {"id": msg.id, "role": "agent", "content": msg.content, "created_at": msg.created_at.isoformat()}


@app.post("/v1/conversations/{conversation_id}/close")
async def close_conversation(conversation_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        conv = await session.get(Conversation, conversation_id)
        if conv is None:
            raise HTTPException(404, "Conversation not found")
        bot = await session.get(Bot, conv.bot_id)
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        conv.status = "closed"
        await session.commit()
        return {"conversation_id": conv.id, "status": conv.status}


@app.get("/v1/bots/{bot_id}/leads")
async def list_leads(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        rows = (
            await session.execute(
                select(Lead)
                .join(Conversation, Lead.conversation_id == Conversation.id)
                .where(Conversation.bot_id == bot_id)
                .order_by(Lead.created_at.desc())
            )
        ).scalars().all()
        return [
            {
                "lead_id": lead.id, "conversation_id": lead.conversation_id, "name": lead.name,
                "email": lead.email, "phone": lead.phone, "created_at": lead.created_at.isoformat(),
                "pushed_to_crm": lead.pushed_to_crm,
            }
            for lead in rows
        ]


# ─── Analytics (FR-R1) + unanswered-question loop (FR-R2) ────────────────


@app.get("/v1/bots/{bot_id}/analytics/summary")
async def analytics_summary(bot_id: str, days: int = 30, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        cutoff = datetime.utcnow() - timedelta(days=days)
        convs = (
            await session.execute(
                select(Conversation).where(Conversation.bot_id == bot_id, Conversation.started_at >= cutoff)
            )
        ).scalars().all()
        conv_ids = [c.id for c in convs]

        total_conversations = len(convs)
        handoff_count = sum(1 for c in convs if c.status != "bot")
        resolution_rate = (
            (total_conversations - handoff_count) / total_conversations if total_conversations else None
        )

        total_messages = 0
        visitor_texts: list[str] = []
        rated_up = rated_down = 0
        if conv_ids:
            msgs = (
                await session.execute(select(Message).where(Message.conversation_id.in_(conv_ids)))
            ).scalars().all()
            total_messages = len(msgs)
            for m in msgs:
                if m.role == "visitor":
                    visitor_texts.append(m.content.strip().lower())
                if m.rating == 1:
                    rated_up += 1
                elif m.rating == -1:
                    rated_down += 1

        leads_count = (
            await session.execute(
                select(func.count(Lead.id))
                .join(Conversation, Lead.conversation_id == Conversation.id)
                .where(Conversation.bot_id == bot_id, Conversation.started_at >= cutoff)
            )
        ).scalar_one()

        top_questions = [
            {"question": q, "count": n} for q, n in Counter(visitor_texts).most_common(10)
        ]

        rated_total = rated_up + rated_down
        return {
            "days": days,
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "handoff_count": handoff_count,
            "resolution_rate": resolution_rate,
            "leads_count": leads_count,
            # Proxy from message thumbs up/down, not a real post-chat CSAT
            # survey — no such survey is built. Null when nothing's rated yet.
            "message_satisfaction_rate": (rated_up / rated_total) if rated_total else None,
            "top_questions": top_questions,
        }


@app.get("/v1/bots/{bot_id}/analytics/unanswered")
async def analytics_unanswered(bot_id: str, days: int = 30, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        cutoff = datetime.utcnow() - timedelta(days=days)
        bot_msgs = (
            await session.execute(
                select(Message)
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.bot_id == bot_id, Message.role == "bot",
                    Message.confidence == 0.0, Message.created_at >= cutoff,
                )
                .order_by(Message.created_at.desc())
                .limit(100)
            )
        ).scalars().all()

        results = []
        for bm in bot_msgs:
            prev = (
                await session.execute(
                    select(Message)
                    .where(
                        Message.conversation_id == bm.conversation_id,
                        Message.created_at < bm.created_at, Message.role == "visitor",
                    )
                    .order_by(Message.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            results.append({
                "message_id": bm.id, "question": prev.content if prev else None,
                "bot_answer": bm.content, "created_at": bm.created_at.isoformat(),
            })
        return results


@app.get("/v1/bots/{bot_id}/analytics/crawl-success")
async def analytics_crawl_success(bot_id: str, days: int = 30, user: CurrentUser = Depends(get_current_user)):
    """Crawl success rate KPI (SAN-1117) — done/failed/cancelled counts for
    this bot's website-source ingest jobs over the window, so a customer
    can see at a glance whether their sources are actually indexing
    cleanly rather than silently failing."""
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        cutoff = datetime.utcnow() - timedelta(days=days)
        rows = (
            await session.execute(
                select(IngestJob.status, func.count())
                .join(Source, IngestJob.source_id == Source.id)
                .where(Source.bot_id == bot_id, Source.type == "website", IngestJob.created_at >= cutoff)
                .group_by(IngestJob.status)
            )
        ).all()
        by_status = {status: count for status, count in rows}
        total = sum(by_status.values())
        done = by_status.get("done", 0)
        return {
            "days": days, "total_jobs": total, "by_status": by_status,
            "success_rate": round(done / total, 4) if total else None,
        }


class QAPairRequest(BaseModel):
    question: str
    answer: str


@app.post("/v1/bots/{bot_id}/qa-pairs")
async def add_qa_pair(bot_id: str, body: QAPairRequest, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        qa = await create_qa_pair(
            session, bot_id=bot_id, tenant_id=bot.tenant_id, question=body.question, answer=body.answer,
        )
        return {"qa_pair_id": qa.id, "question": qa.question, "answer": qa.answer}


@app.get("/v1/bots/{bot_id}/qa-pairs")
async def list_qa_pairs(bot_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        await require_workspace_role(bot.workspace_id, user, min_role="agent")

        rows = (
            await session.execute(
                select(QAPair).where(QAPair.bot_id == bot_id).order_by(QAPair.created_at.desc())
            )
        ).scalars().all()
        return [{"qa_pair_id": q.id, "question": q.question, "answer": q.answer} for q in rows]


# ─── Billing & plan (pricing shown on the Billing page + public landing
# page; editable only by a super admin, see deps.require_super_admin) ──────


def _plan_out(p: Plan) -> dict:
    return {
        "plan_id": p.id, "name": p.name, "price_text": p.price_text, "tagline": p.tagline,
        "features": p.features_json or [], "is_active": p.is_active, "sort_order": p.sort_order,
        "amount": p.amount, "currency": p.currency, "purchasable": p.amount is not None,
    }


@app.get("/public/plans")
async def list_public_plans():
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.sort_order, Plan.created_at)
            )
        ).scalars().all()
        return [_plan_out(p) for p in rows]


@app.get("/v1/plans")
async def list_plans(user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        rows = (await session.execute(select(Plan).order_by(Plan.sort_order, Plan.created_at))).scalars().all()
        return [_plan_out(p) for p in rows]


class PlanRequest(BaseModel):
    name: str
    price_text: str = ""
    tagline: str = ""
    features: list[str] = []
    is_active: bool = True
    sort_order: int = 0
    amount: float | None = None  # None = display-only, not self-serve purchasable
    currency: str = "INR"


@app.post("/v1/plans")
async def create_plan(body: PlanRequest, _admin: User = Depends(require_super_admin)):
    async with SessionLocal() as session:
        plan = Plan(
            name=body.name, price_text=body.price_text, tagline=body.tagline,
            features_json=body.features, is_active=body.is_active, sort_order=body.sort_order,
            amount=body.amount, currency=body.currency,
        )
        session.add(plan)
        await session.commit()
        return _plan_out(plan)


class UpdatePlanRequest(BaseModel):
    name: str | None = None
    price_text: str | None = None
    tagline: str | None = None
    features: list[str] | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    amount: float | None = None
    clear_amount: bool = False  # amount=None alone is ambiguous with "don't change" — this disambiguates
    currency: str | None = None


@app.patch("/v1/plans/{plan_id}")
async def update_plan(plan_id: str, body: UpdatePlanRequest, _admin: User = Depends(require_super_admin)):
    async with SessionLocal() as session:
        plan = await session.get(Plan, plan_id)
        if plan is None:
            raise HTTPException(404, "Plan not found")
        if body.name is not None:
            plan.name = body.name
        if body.price_text is not None:
            plan.price_text = body.price_text
        if body.tagline is not None:
            plan.tagline = body.tagline
        if body.features is not None:
            plan.features_json = body.features
        if body.is_active is not None:
            plan.is_active = body.is_active
        if body.sort_order is not None:
            plan.sort_order = body.sort_order
        if body.clear_amount:
            plan.amount = None
        elif body.amount is not None:
            plan.amount = body.amount
        if body.currency is not None:
            plan.currency = body.currency
        await session.commit()
        return _plan_out(plan)


@app.delete("/v1/plans/{plan_id}")
async def delete_plan(plan_id: str, _admin: User = Depends(require_super_admin)):
    async with SessionLocal() as session:
        plan = await session.get(Plan, plan_id)
        if plan is None:
            raise HTTPException(404, "Plan not found")
        await session.delete(plan)
        await session.commit()
        return {"deleted": True}


# ─── Payments: gateway config, billing profile (both super-admin-only to
# write), order creation/confirmation, GST invoices ─────────────────────────

GATEWAY_NAMES = {"razorpay": "Razorpay", "stripe": "Stripe"}


@app.get("/v1/billing/gateways")
async def list_gateways(_admin: User = Depends(require_super_admin)):
    async with SessionLocal() as session:
        rows = (await session.execute(select(PaymentGateway))).scalars().all()
        by_code = {r.code: r for r in rows}
        # Always show both known gateways, even before a row exists for one,
        # so the dashboard has something to render a form against.
        out = []
        for code, name in GATEWAY_NAMES.items():
            row = by_code.get(code)
            out.append(gateway_out(row) if row else {
                "code": code, "name": name, "is_primary": False, "enabled": False,
                "test_client_id": "", "test_configured": False,
                "live_client_id": "", "live_configured": False,
            })
        return out


@app.get("/v1/billing/gateways/available")
async def list_available_gateways(user: CurrentUser = Depends(get_current_user)):
    """Unlike /v1/billing/gateways (super-admin only, returns client IDs for
    editing), this is what the checkout UI itself needs: just which gateways
    a regular customer can actually pay through right now, with no
    credentials in the response.
    """
    async with SessionLocal() as session:
        rows = (await session.execute(select(PaymentGateway))).scalars().all()
    configured_field = "test_configured" if settings.payment_mode == "test" else "live_configured"
    out = []
    for row in rows:
        if row.enabled and gateway_out(row)[configured_field]:
            out.append({"code": row.code, "name": GATEWAY_NAMES.get(row.code, row.code)})
    return out


class GatewayUpsertRequest(BaseModel):
    test_client_id: str | None = None
    test_client_secret: str | None = None
    live_client_id: str | None = None
    live_client_secret: str | None = None
    is_primary: bool | None = None
    enabled: bool | None = None


@app.put("/v1/billing/gateways/{code}")
async def put_gateway(code: str, body: GatewayUpsertRequest, _admin: User = Depends(require_super_admin)):
    if code not in GATEWAY_NAMES:
        raise HTTPException(404, f"Unknown gateway '{code}'")
    async with SessionLocal() as session:
        row = await upsert_gateway(
            session, code=code, name=GATEWAY_NAMES[code],
            test_client_id=body.test_client_id, test_client_secret=body.test_client_secret,
            live_client_id=body.live_client_id, live_client_secret=body.live_client_secret,
            is_primary=body.is_primary, enabled=body.enabled,
        )
        await session.commit()
        return gateway_out(row)


def _billing_profile_out(p: BillingProfile | None) -> dict:
    if p is None:
        return {
            "supplier_name": "", "supplier_gstin": "", "supplier_address": "", "supplier_city": "",
            "supplier_state": "", "supplier_country": "India", "supplier_pincode": "",
            "supplier_email": "", "supplier_phone": "",
        }
    return {
        "supplier_name": p.supplier_name, "supplier_gstin": p.supplier_gstin,
        "supplier_address": p.supplier_address, "supplier_city": p.supplier_city,
        "supplier_state": p.supplier_state, "supplier_country": p.supplier_country,
        "supplier_pincode": p.supplier_pincode, "supplier_email": p.supplier_email,
        "supplier_phone": p.supplier_phone,
    }


async def _get_or_create_billing_profile(session: AsyncSession) -> BillingProfile:
    profile = (await session.execute(select(BillingProfile))).scalars().first()
    if profile is None:
        profile = BillingProfile()
        session.add(profile)
        await session.flush()
    return profile


@app.get("/v1/billing/profile")
async def get_billing_profile(user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        profile = (await session.execute(select(BillingProfile))).scalars().first()
        return _billing_profile_out(profile)


class BillingProfileRequest(BaseModel):
    supplier_name: str = ""
    supplier_gstin: str = ""
    supplier_address: str = ""
    supplier_city: str = ""
    supplier_state: str = ""
    supplier_country: str = "India"
    supplier_pincode: str = ""
    supplier_email: str = ""
    supplier_phone: str = ""


@app.put("/v1/billing/profile")
async def put_billing_profile(body: BillingProfileRequest, _admin: User = Depends(require_super_admin)):
    async with SessionLocal() as session:
        profile = await _get_or_create_billing_profile(session)
        for field in (
            "supplier_name", "supplier_gstin", "supplier_address", "supplier_city", "supplier_state",
            "supplier_country", "supplier_pincode", "supplier_email", "supplier_phone",
        ):
            setattr(profile, field, getattr(body, field))
        await session.commit()
        return _billing_profile_out(profile)


def _order_out(o: Order) -> dict:
    return {
        "order_id": o.id, "workspace_id": o.workspace_id, "plan_id": o.plan_id,
        "gateway_code": o.gateway_code, "payment_mode": o.payment_mode,
        "amount": o.amount, "currency": o.currency, "status": o.status,
        "invoice_number": o.invoice_number, "created_at": o.created_at.isoformat(),
        "paid_at": o.paid_at.isoformat() if o.paid_at else None,
    }


class CreateOrderRequest(BaseModel):
    plan_id: str
    gateway_code: str  # 'razorpay' | 'stripe'
    customer_name: str = ""
    customer_gstin: str = ""
    customer_address: str = ""
    customer_city: str = ""
    customer_state: str = ""
    customer_country: str = "India"
    customer_pincode: str = ""
    # Stripe Checkout needs somewhere to redirect to; unused by Razorpay
    # (its checkout is a JS modal, not a redirect).
    success_url: str = ""
    cancel_url: str = ""


@app.post("/v1/workspaces/{workspace_id}/orders")
async def create_order(workspace_id: str, body: CreateOrderRequest, user: CurrentUser = Depends(get_current_user)):
    if body.gateway_code not in GATEWAY_NAMES:
        raise HTTPException(400, f"Unknown gateway '{body.gateway_code}'")
    await require_workspace_role(workspace_id, user, min_role="admin")

    async with SessionLocal() as session:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(404, "Workspace not found")
        plan = await session.get(Plan, body.plan_id)
        if plan is None:
            raise HTTPException(404, "Plan not found")
        if plan.amount is None:
            raise HTTPException(400, "This plan isn't available for self-serve purchase — contact sales")

        order = Order(
            tenant_id=workspace.tenant_id, workspace_id=workspace_id, plan_id=plan.id,
            gateway_code=body.gateway_code, payment_mode=settings.payment_mode,
            amount=plan.amount, currency=plan.currency,
            customer_name=body.customer_name, customer_gstin=body.customer_gstin,
            customer_address=body.customer_address, customer_city=body.customer_city,
            customer_state=body.customer_state, customer_country=body.customer_country,
            customer_pincode=body.customer_pincode,
        )
        session.add(order)
        await session.flush()

        if body.gateway_code == "razorpay":
            gw = await razorpay_gateway.create_order(
                session, settings.payment_mode, amount=plan.amount, currency=plan.currency,
            )
            order.gateway_order_id = gw["gateway_order_id"]
            await session.commit()
            return {**_order_out(order), "razorpay": gw}

        gw = await stripe_gateway.create_order(
            session, settings.payment_mode, amount=plan.amount, currency=plan.currency,
            product_name=plan.name, success_url=body.success_url, cancel_url=body.cancel_url,
        )
        order.gateway_order_id = gw["gateway_order_id"]
        await session.commit()
        return {**_order_out(order), "stripe": gw}


@app.post("/v1/orders/{order_id}/confirm")
async def confirm_order(order_id: str, user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        order = await session.get(Order, order_id)
        if order is None:
            raise HTTPException(404, "Order not found")
        await require_workspace_role(order.workspace_id, user, min_role="admin")

        if order.status == "paid":
            return _order_out(order)  # idempotent — already confirmed

        if order.gateway_code == "razorpay":
            transaction_id = await razorpay_gateway.verify_and_capture(
                session, order.payment_mode, order.gateway_order_id,
            )
        else:
            transaction_id = await stripe_gateway.verify_and_capture(
                session, order.payment_mode, order.gateway_order_id,
            )

        profile = await _get_or_create_billing_profile(session)
        order.tax_json = compute_gst_split(order.amount, profile.supplier_state, order.customer_state)
        order.is_intra_state = order.tax_json["is_intra_state"]
        order.invoice_number = await next_invoice_number(session, prefix="INV")
        order.gateway_transaction_id = transaction_id
        order.status = "paid"
        order.paid_at = datetime.utcnow()

        # Moves the workspace off trial onto this plan's caps (SAN-1063/1119,
        # FR-A4) — trial_ends_at is left alone as a historical record; it's
        # simply never consulted again once plan_id is set.
        workspace = await session.get(Workspace, order.workspace_id)
        if workspace is not None and order.plan_id:
            workspace.plan_id = order.plan_id

        await session.commit()
        return _order_out(order)


@app.get("/v1/workspaces/{workspace_id}/usage")
async def workspace_usage(workspace_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_workspace_role(workspace_id, user, min_role="viewer")
    async with SessionLocal() as session:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(404, "Workspace not found")
        return await get_usage_summary(session, workspace)


@app.get("/v1/workspaces/{workspace_id}/orders")
async def list_orders(workspace_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_workspace_role(workspace_id, user, min_role="viewer")
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(Order).where(Order.workspace_id == workspace_id).order_by(Order.created_at.desc())
            )
        ).scalars().all()
        return [_order_out(o) for o in rows]


@app.get("/v1/orders/{order_id}/invoice")
async def get_order_invoice(order_id: str, format: str = "html", user: CurrentUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        order = await session.get(Order, order_id)
        if order is None:
            raise HTTPException(404, "Order not found")
        await require_workspace_role(order.workspace_id, user, min_role="viewer")
        if order.status != "paid":
            raise HTTPException(400, "Invoice isn't available until this order is paid")

        plan = await session.get(Plan, order.plan_id) if order.plan_id else None
        profile = await _get_or_create_billing_profile(session)
        html = generate_invoice_html(order=order, billing_profile=profile, plan_name=plan.name if plan else "Subscription")

        if format == "pdf":
            pdf_bytes = await render_invoice_pdf(html)
            return Response(
                content=pdf_bytes, media_type="application/pdf",
                headers={"Content-Disposition": f'inline; filename="{order.invoice_number}.pdf"'},
            )
        return Response(content=html, media_type="text/html")


# ---------------------------------------------------------------------------
# Staff / Super Admin — a separate platform-operator login and read surface
# across every tenant. Deliberately its own token type (staff_access, see
# create_staff_access_token/get_current_staff_user) so a staff session can
# never be reused on a customer-scoped route or vice versa, and never
# reachable from inside a customer's own dashboard.
# ---------------------------------------------------------------------------


class StaffLoginRequest(BaseModel):
    email: EmailStr
    password: str


@app.post("/v1/staff/login")
async def staff_login(body: StaffLoginRequest):
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
        if user is None or not verify_password(body.password, user.password_hash):
            raise HTTPException(401, "Invalid email or password")
        if not user.is_active:
            raise HTTPException(403, "This account has been deactivated")
        if not user.is_super_admin:
            raise HTTPException(403, "This account doesn't have platform staff access")
        return {"access_token": create_staff_access_token(user.id)}


@app.get("/v1/staff/me")
async def staff_me(staff: User = Depends(get_current_staff_user)):
    return {"email": staff.email}


async def _workspace_plan_name(session: AsyncSession, workspace_id: str) -> str:
    order = (
        await session.execute(
            select(Order)
            .where(Order.workspace_id == workspace_id, Order.status == "paid")
            .order_by(Order.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if order is None or order.plan_id is None:
        return "Free"
    plan = await session.get(Plan, order.plan_id)
    return plan.name if plan else "Free"


@app.get("/v1/staff/overview")
async def staff_overview(_staff: User = Depends(get_current_staff_user)):
    async with SessionLocal() as session:
        workspace_count = (await session.execute(select(func.count()).select_from(Workspace))).scalar_one()
        bot_count = (await session.execute(select(func.count()).select_from(Bot))).scalar_one()
        since = datetime.utcnow() - timedelta(days=30)
        conversations_30d = (
            await session.execute(
                select(func.count()).select_from(Conversation).where(Conversation.started_at >= since)
            )
        ).scalar_one()
        db_size = (await session.execute(text("select pg_size_pretty(pg_database_size(current_database()))"))).scalar_one()
    return {
        "workspace_count": workspace_count,
        "bot_count": bot_count,
        "conversations_30d": conversations_30d,
        "db_size": db_size,
    }


@app.get("/v1/staff/workspaces")
async def staff_list_workspaces(q: str = "", _staff: User = Depends(get_current_staff_user)):
    async with SessionLocal() as session:
        stmt = select(Workspace).order_by(Workspace.created_at.desc())
        if q:
            stmt = stmt.where(Workspace.name.ilike(f"%{q}%"))
        workspaces = (await session.execute(stmt)).scalars().all()

        out = []
        for ws in workspaces:
            owner_membership = (
                await session.execute(
                    select(Membership).where(Membership.workspace_id == ws.id, Membership.role == "owner")
                )
            ).scalar_one_or_none()
            owner = await session.get(User, owner_membership.user_id) if owner_membership else None
            if q and owner and q.lower() not in ws.name.lower() and q.lower() not in owner.email.lower():
                continue
            bot_count = (
                await session.execute(select(func.count()).select_from(Bot).where(Bot.workspace_id == ws.id))
            ).scalar_one()
            out.append(
                {
                    "id": ws.id,
                    "name": ws.name,
                    "owner_email": owner.email if owner else "—",
                    "bot_count": bot_count,
                    "plan": await _workspace_plan_name(session, ws.id),
                    "created_at": ws.created_at.isoformat(),
                    "is_active": ws.is_active,
                }
            )
        return out


@app.get("/v1/staff/workspaces/{workspace_id}")
async def staff_get_workspace(workspace_id: str, _staff: User = Depends(get_current_staff_user)):
    async with SessionLocal() as session:
        ws = await session.get(Workspace, workspace_id)
        if ws is None:
            raise HTTPException(404, "Workspace not found")

        memberships = (
            await session.execute(select(Membership).where(Membership.workspace_id == workspace_id))
        ).scalars().all()
        members = []
        owner_email = "—"
        for m in memberships:
            member_user = await session.get(User, m.user_id)
            if member_user is None:
                continue
            if m.role == "owner":
                owner_email = member_user.email
            members.append({
                "user_id": member_user.id, "name": member_user.email.split("@")[0], "email": member_user.email,
                "role": m.role, "active": bool(member_user.password_hash),
                "account_active": member_user.is_active,
            })

        bots = (await session.execute(select(Bot).where(Bot.workspace_id == workspace_id))).scalars().all()
        since = datetime.utcnow() - timedelta(days=30)
        bot_out = []
        for bot in bots:
            conversations_30d = (
                await session.execute(
                    select(func.count())
                    .select_from(Conversation)
                    .where(Conversation.bot_id == bot.id, Conversation.started_at >= since)
                )
            ).scalar_one()
            bot_out.append(
                {"id": bot.id, "name": bot.name, "status": bot.status, "conversations_30d": conversations_30d}
            )

        return {
            "id": ws.id,
            "name": ws.name,
            "owner_email": owner_email,
            "plan": await _workspace_plan_name(session, ws.id),
            "created_at": ws.created_at.isoformat(),
            "is_active": ws.is_active,
            "bots": bot_out,
            "members": members,
        }


STAFF_BOT_STATUSES = {"live", "pending", "draft", "suspended"}


class StaffBotStatusRequest(BaseModel):
    status: str


@app.patch("/v1/staff/bots/{bot_id}/status")
async def staff_set_bot_status(bot_id: str, body: StaffBotStatusRequest, _staff: User = Depends(get_current_staff_user)):
    if body.status not in STAFF_BOT_STATUSES:
        raise HTTPException(422, f"status must be one of {sorted(STAFF_BOT_STATUSES)}")
    async with SessionLocal() as session:
        bot = await session.get(Bot, bot_id)
        if bot is None:
            raise HTTPException(404, "Bot not found")
        # Moderation action only — never touches persona/instructions/knowledge.
        bot.status = body.status
        await session.commit()
        return {"id": bot.id, "status": bot.status}


# Staff-scoped membership management — same actions a workspace's own
# Owner/Admin has for their own team (resend/change role/remove), but staff
# have no membership row of their own in a customer's workspace to check via
# require_workspace_role, so these are separate routes gated purely by
# get_current_staff_user. A support action, same boundary as bot moderation
# above: never touches a bot's content, never reads conversation transcripts.


@app.post("/v1/staff/workspaces/{workspace_id}/members/{target_user_id}/resend-invite")
async def staff_resend_invite(workspace_id: str, target_user_id: str, _staff: User = Depends(get_current_staff_user)):
    async with SessionLocal() as session:
        membership, target_user = await _get_membership_and_target(session, workspace_id, target_user_id)
        if target_user.password_hash:
            raise HTTPException(400, "This person has already accepted their invite")
        workspace = await session.get(Workspace, workspace_id)
        invite_token = create_invite_token(target_user.id, workspace_id, membership.role)
        email_sent = await send_invite_email(target_user.email, invite_token, workspace.name)
        return {"email_sent": email_sent}


@app.patch("/v1/staff/workspaces/{workspace_id}/members/{target_user_id}")
async def staff_update_membership(
    workspace_id: str, target_user_id: str, body: UpdateMembershipRequest, _staff: User = Depends(get_current_staff_user)
):
    if body.role not in ("admin", "agent", "viewer"):
        raise HTTPException(422, "role must be admin, agent or viewer")
    async with SessionLocal() as session:
        membership, _ = await _get_membership_and_target(session, workspace_id, target_user_id)
        if membership.role == "owner":
            raise HTTPException(400, "Can't change the workspace owner's role")
        membership.role = body.role
        await session.commit()
        return {"user_id": target_user_id, "role": membership.role}


@app.delete("/v1/staff/workspaces/{workspace_id}/members/{target_user_id}")
async def staff_remove_member(workspace_id: str, target_user_id: str, _staff: User = Depends(get_current_staff_user)):
    async with SessionLocal() as session:
        membership, _ = await _get_membership_and_target(session, workspace_id, target_user_id)
        if membership.role == "owner":
            raise HTTPException(400, "Can't remove the workspace owner")
        await session.delete(membership)
        await session.commit()
        return {"removed": True}


# Staff-scoped account-credential actions — deliberately separate from the
# membership endpoints above. Editing a user's email/password/active status
# is account-level (affects every workspace they belong to), not scoped to
# one workspace the way role/remove/resend-invite are, and it's identity-
# level enough that it's worth its own explicit, narrow set of routes rather
# than folding it into staff_update_membership.


class StaffUpdateEmailRequest(BaseModel):
    email: EmailStr


@app.patch("/v1/staff/users/{target_user_id}/email")
async def staff_update_email(target_user_id: str, body: StaffUpdateEmailRequest, _staff: User = Depends(get_current_staff_user)):
    async with SessionLocal() as session:
        target_user = await session.get(User, target_user_id)
        if target_user is None:
            raise HTTPException(404, "User not found")
        existing = (await session.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
        if existing is not None and existing.id != target_user_id:
            raise HTTPException(400, "That email is already in use by another account")
        old_email = target_user.email
        target_user.email = body.email
        await session.commit()
        await send_email(
            old_email,
            "Your SanchiJawab account email was changed",
            f"<p>Your login email was changed from {old_email} to {body.email} by SanchiJawab support. "
            f"If you didn't request this, contact {settings.support_email} immediately.</p>",
        )
        return {"user_id": target_user_id, "email": target_user.email}


class StaffResetPasswordRequest(BaseModel):
    new_password: str


@app.post("/v1/staff/users/{target_user_id}/reset-password")
async def staff_reset_password(target_user_id: str, body: StaffResetPasswordRequest, _staff: User = Depends(get_current_staff_user)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    async with SessionLocal() as session:
        target_user = await session.get(User, target_user_id)
        if target_user is None:
            raise HTTPException(404, "User not found")
        target_user.password_hash = hash_password(body.new_password)
        await session.commit()
        email_sent = await send_email(
            target_user.email,
            "Your SanchiJawab password was reset",
            f"<p>Your password was reset by SanchiJawab support. If you didn't request this, "
            f"contact {settings.support_email} immediately.</p>",
        )
        return {"user_id": target_user_id, "email_sent": email_sent}


@app.post("/v1/staff/users/{target_user_id}/deactivate")
async def staff_deactivate_user(target_user_id: str, _staff: User = Depends(get_current_staff_user)):
    if target_user_id == _staff.id:
        raise HTTPException(400, "Can't deactivate your own account")
    async with SessionLocal() as session:
        target_user = await session.get(User, target_user_id)
        if target_user is None:
            raise HTTPException(404, "User not found")
        target_user.is_active = False
        await session.commit()
        return {"user_id": target_user_id, "is_active": False}


@app.post("/v1/staff/users/{target_user_id}/reactivate")
async def staff_reactivate_user(target_user_id: str, _staff: User = Depends(get_current_staff_user)):
    async with SessionLocal() as session:
        target_user = await session.get(User, target_user_id)
        if target_user is None:
            raise HTTPException(404, "User not found")
        target_user.is_active = True
        await session.commit()
        return {"user_id": target_user_id, "is_active": True}


@app.post("/v1/staff/workspaces/{workspace_id}/deactivate")
async def staff_deactivate_workspace(workspace_id: str, _staff: User = Depends(get_current_staff_user)):
    async with SessionLocal() as session:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(404, "Workspace not found")
        workspace.is_active = False
        await session.commit()
        return {"workspace_id": workspace_id, "is_active": False}


@app.post("/v1/staff/workspaces/{workspace_id}/reactivate")
async def staff_reactivate_workspace(workspace_id: str, _staff: User = Depends(get_current_staff_user)):
    async with SessionLocal() as session:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(404, "Workspace not found")
        workspace.is_active = True
        await session.commit()
        return {"workspace_id": workspace_id, "is_active": True}


@app.delete("/v1/staff/workspaces/{workspace_id}")
async def staff_delete_workspace(workspace_id: str, _staff: User = Depends(get_current_staff_user)):
    """Irreversible — deletes the workspace and everything in it (bots,
    knowledge, conversations, leads, orders) plus any user whose only
    membership was here. Same cascade order as delete_bot (Chunk before
    Document, same FK reason), just scoped to every bot in the workspace
    instead of one.
    """
    async with SessionLocal() as session:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(404, "Workspace not found")

        bot_ids = (await session.execute(select(Bot.id).where(Bot.workspace_id == workspace_id))).scalars().all()
        source_ids = (await session.execute(select(Source.id).where(Source.bot_id.in_(bot_ids)))).scalars().all()
        conversation_ids = (
            await session.execute(select(Conversation.id).where(Conversation.bot_id.in_(bot_ids)))
        ).scalars().all()
        member_user_ids = (
            await session.execute(select(Membership.user_id).where(Membership.workspace_id == workspace_id))
        ).scalars().all()

        if conversation_ids:
            await session.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
            await session.execute(delete(Lead).where(Lead.conversation_id.in_(conversation_ids)))
        if bot_ids:
            await session.execute(delete(Chunk).where(Chunk.bot_id.in_(bot_ids)))
        if source_ids:
            await session.execute(delete(IngestJob).where(IngestJob.source_id.in_(source_ids)))
            await session.execute(delete(Document).where(Document.source_id.in_(source_ids)))
        if bot_ids:
            await session.execute(delete(Source).where(Source.bot_id.in_(bot_ids)))
            await session.execute(delete(Conversation).where(Conversation.bot_id.in_(bot_ids)))
            await session.execute(delete(QAPair).where(QAPair.bot_id.in_(bot_ids)))
            await session.execute(delete(WidgetConfig).where(WidgetConfig.bot_id.in_(bot_ids)))
            await session.execute(delete(ToolConnection).where(ToolConnection.bot_id.in_(bot_ids)))
        await session.execute(delete(Bot).where(Bot.workspace_id == workspace_id))
        await session.execute(delete(Order).where(Order.workspace_id == workspace_id))
        await session.execute(delete(Membership).where(Membership.workspace_id == workspace_id))
        await session.delete(workspace)

        if member_user_ids:
            remaining = select(Membership.user_id).distinct()
            await session.execute(
                delete(User).where(
                    User.id.in_(member_user_ids), User.id.notin_(remaining), User.is_super_admin.is_(False)
                )
            )

        await session.commit()
        return {"deleted": True}


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    company: str = ""
    message: str

    @field_validator("name", "message")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("can't be blank")
        return v.strip()[:5000]


@app.post("/public/contact")
async def submit_contact(body: ContactRequest):
    html = f"""
    <p><strong>From:</strong> {body.name} &lt;{body.email}&gt;</p>
    <p><strong>Company:</strong> {body.company or "—"}</p>
    <p><strong>Message:</strong></p>
    <p>{body.message.replace(chr(10), "<br>")}</p>
    """
    email_sent = await send_email(settings.support_email, f"Contact form: {body.name}", html)
    return {"email_sent": email_sent}


@app.get("/health")
async def health():
    return {"status": "ok"}
