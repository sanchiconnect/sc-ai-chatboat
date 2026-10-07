"""PostgreSQL + pgvector SQLAlchemy models (Phase 1 target stack).

Every table carries tenant_id — the id issued by the shared sc_tenants
registry (a different database on the same server; not modeled here
since its schema hasn't been provided, so no FK constraint is declared
across databases). Every query in retrieval.py/rag.py/routers filters
by it; there are no exceptions, per the migration brief.

Chunk carries both its embedding (pgvector `Vector` column, for cosine
similarity search) and a generated `tsv` column (Postgres full-text
search) in the SAME table/database — no separate vector store. Fused by
retrieval.py in a single SQL query, same pattern already proven in
app/poc/ask.py's hybrid_search().
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger, Boolean, Computed, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .config import settings


def _uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(255))
    # Deactivated by a super admin — distinct from a member's own is_active:
    # this blocks the workspace itself (every member's dashboard access to
    # it, and every one of its bots' public widgets), regardless of whether
    # any individual member account is otherwise fine.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # FR-A4 (SAN-1063/1119) — set once at signup, never moved. A workspace is
    # "on trial" exactly when plan_id is still null and trial_ends_at hasn't
    # passed; once a paid order is confirmed, plan_id is set and trial_ends_at
    # is simply no longer consulted (kept as a historical record, not cleared).
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    plan_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("plans.id"), nullable=True)

    bots: Mapped[list["Bot"]] = relationship(back_populates="workspace")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_super_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Deactivated by a super admin as an account-level support action —
    # distinct from removing a Membership (which only revokes one
    # workspace). Enforced in deps.get_current_user, not just at login, so
    # an already-issued token stops working immediately on deactivation.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Membership(Base):
    """A user's role within a workspace. FR-A3: Owner, Admin, Agent, Viewer."""

    __tablename__ = "memberships"
    __table_args__ = (Index("ix_memberships_user_workspace", "user_id", "workspace_id", unique=True),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(16), default="owner")  # owner|admin|agent|viewer
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Per-member opt-out of handoff emails (SAN-1113, FR-H4) — in-app
    # notifications always record regardless, since the member controls
    # when they're seen (unread badge) rather than being pushed anything.
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)


class Bot(Base):
    __tablename__ = "bots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    persona: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    model_tier: Mapped[str] = mapped_column(String(32), default="balanced")
    allowed_domains: Mapped[list] = mapped_column(JSON, default=list)
    # avatar_id keys into a fixed catalog of preset designs (shared constant
    # in the admin + widget frontends); avatar_name is the persona's own
    # display name (e.g. "Riya"), separate from the business/bot name.
    avatar_id: Mapped[str] = mapped_column(String(32), default="orbit")
    avatar_name: Mapped[str] = mapped_column(String(100), default="")
    # Generic outbound webhook (Zapier/Make.com/n8n/a CRM's own inbound
    # webhook all work the same way) — simpler and more interoperable than
    # hardcoding one CRM vendor's SDK, and matches how the rest of this
    # product's ecosystem already integrates with CRMs (see Make.com usage
    # elsewhere in the workspace).
    crm_webhook_url: Mapped[str] = mapped_column(String(1024), default="")
    # Optional Slack incoming-webhook URL (SAN-1113, FR-H4) — same
    # generic-webhook shape as crm_webhook_url above, posted a plain
    # {"text": ...} payload that Slack's incoming-webhooks format accepts
    # without needing the Slack SDK or an app install.
    slack_webhook_url: Mapped[str] = mapped_column(String(1024), default="")
    # Automatic conversation retention (SAN-1127) — the worker deletes
    # conversations older than this many days. NULL means keep forever.
    retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Comma/newline-separated phrases (case-insensitive substring match) —
    # deterministic escalation for things a business always wants a human
    # on, regardless of how the LLM's own ask-for-human detection reads the
    # phrasing (SAN-1111, FR-H2). Empty by default — these are business-
    # specific, not something to guess a default list for.
    handoff_keywords: Mapped[str] = mapped_column(Text, default="")
    # Weekly availability for human handoff (SAN-1112, FR-H3). Empty dict
    # means "always available" (preserves pre-FR-H3 behavior for bots that
    # never configure this). Shape when set:
    # {"timezone": "Asia/Kolkata", "hours": {"mon": [["09:00","18:00"]], ...}}
    # — a weekday key absent from "hours" is closed all day.
    business_hours_json: Mapped[dict] = mapped_column(JSON, default=dict)
    # live|pending|draft|suspended — set by the bot's own owner (live/draft
    # via Bot settings) or by a super admin as a moderation action
    # (pending/suspended); staff changes here never touch persona/
    # instructions/knowledge.
    status: Mapped[str] = mapped_column(String(16), default="live")
    # Set every time the public widget config endpoint is hit (FR-I3 install
    # check) — lets the dashboard show "yes, we've actually seen this script
    # tag load on your site" instead of just "here's the snippet, hope it
    # works."
    widget_last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    widget_last_seen_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship(back_populates="bots")


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("bots.id"), index=True)
    type: Mapped[str] = mapped_column(String(16))  # website | file | qa | connector
    visibility: Mapped[str] = mapped_column(String(16), default="customer")  # customer | internal
    url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_key: Mapped[str | None] = mapped_column(String(512), nullable=True)  # S3 key
    mode: Mapped[str] = mapped_column(String(16), default="whole_domain")
    include_patterns: Mapped[str] = mapped_column(Text, default="")
    exclude_patterns: Mapped[str] = mapped_column(Text, default="")
    max_pages: Mapped[int] = mapped_column(Integer, default=5000)
    ownership_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)  # explicit customer attestation at creation time (SAN-1083, FR-K4) — not technical verification, just an audit trail of consent
    rescan_interval_days: Mapped[int] = mapped_column(Integer, default=7)
    next_scan_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    stats_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str] = mapped_column(String(36), ForeignKey("sources.id"), index=True)
    url: Mapped[str] = mapped_column(String(1024))
    title: Mapped[str] = mapped_column(String(512), default="")
    content_hash: Mapped[str] = mapped_column(String(64), default="")
    language: Mapped[str] = mapped_column(String(16), default="en")
    status: Mapped[str] = mapped_column(String(16), default="indexed")
    error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    last_crawled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Full page text as chunked/embedded (post-crawl, pre-edit — or the
    # user's own edit once they've overridden it). Chunks only ever held
    # fragments, so there was no way to show or edit "the page" as a whole;
    # this is what the Knowledge page's view/edit UI (SAN-1087, FR-K9) reads
    # and writes.
    raw_text: Mapped[str] = mapped_column(Text, default="")
    # Disabling a document deletes its chunks (so retrieval just finds
    # nothing for it — no query-side join/filter needed) but keeps the row
    # and raw_text, so re-enabling just re-chunks/re-embeds instead of
    # requiring a full re-crawl.
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Chunk(Base):
    __tablename__ = "chunks"
    __table_args__ = (
        Index("ix_chunks_tsv", "tsv", postgresql_using="gin"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("bots.id"), index=True)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id"), index=True)
    visibility: Mapped[str] = mapped_column(String(16), default="customer", index=True)
    text: Mapped[str] = mapped_column(Text)
    heading_path: Mapped[str] = mapped_column(String(512), default="")
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embed_dim))
    tsv: Mapped[str] = mapped_column(TSVECTOR, Computed("to_tsvector('english', text)", persisted=True))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Team(Base):
    """A named destination for handoffs (SAN-1112, FR-H3) — e.g. "Sales",
    "Support (EU)". Deliberately just a name: routing only needs something
    to tag a conversation with for the Inbox to filter/sort by; assigning
    an actual agent to work it still goes through the existing Inbox
    take-over flow, unchanged."""

    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("bots.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class RoutingRule(Base):
    """First-match-wins rule routing a handed-off conversation to a Team,
    by the page it started on and/or its detected language (SAN-1112,
    FR-H3). An empty page_pattern or language matches anything, so a
    catch-all rule is just one with both left blank, placed last via
    priority. Evaluated in ascending priority order; no match leaves the
    conversation unrouted (routed_team_id stays null), same as pre-FR-H3."""

    __tablename__ = "routing_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("bots.id"), index=True)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), index=True)
    page_pattern: Mapped[str] = mapped_column(String(1024), default="")  # substring match against Conversation.page_url
    language: Mapped[str] = mapped_column(String(16), default="")  # exact match against Conversation.language
    priority: Mapped[int] = mapped_column(Integer, default=0)  # lower evaluates first
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class QAPair(Base):
    __tablename__ = "qa_pairs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("bots.id"), index=True)
    question: Mapped[str] = mapped_column(String(1024))
    answer: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("bots.id"), index=True)
    visitor_id: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="bot")  # bot|waiting|human|closed
    assigned_agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    page_url: Mapped[str] = mapped_column(String(1024), default="")
    language: Mapped[str] = mapped_column(String(16), default="en")
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Handoff trigger (SAN-1111, FR-H2) — counts consecutive turns in a row
    # where retrieval found nothing at all (not "declined after generating
    # an answer", just "no chunks to even try with"); reset to 0 the
    # moment a turn finds something. Hitting 2 escalates instead of
    # showing a second empty-handed reply.
    consecutive_low_confidence: Mapped[int] = mapped_column(Integer, default=0)
    # Set once, at the moment of handoff, from the bot's routing rules
    # (SAN-1112, FR-H3) — matched against this conversation's own page_url/
    # language, not re-evaluated afterward even if rules change later.
    routed_team_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("teams.id"), nullable=True)
    # Rolling summary of every turn older than the last 10 (SAN-1093, FR-C5)
    # — summary_msg_count is how many of the client-sent history's older
    # messages are already folded in, so a long-running conversation only
    # ever summarizes the *newly* overflowed turns, not the whole history
    # from scratch on every single message.
    summary: Mapped[str] = mapped_column(Text, default="")
    summary_msg_count: Mapped[int] = mapped_column(Integer, default=0)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    conversation_id: Mapped[str] = mapped_column(String(36), ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # visitor|bot|agent|system
    content: Mapped[str] = mapped_column(Text)
    sources_json: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # thumbs: 1 | -1
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    """In-app notification for a workspace member (SAN-1113, FR-H4) —
    recorded for every owner/admin/agent on a handoff, independent of
    whether email/Slack delivery also happened or succeeded. Read state is
    per-recipient, so one handoff creates one row per eligible member."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), index=True)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("bots.id"), index=True)
    conversation_id: Mapped[str] = mapped_column(String(36), ForeignKey("conversations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32), default="handoff")
    message: Mapped[str] = mapped_column(String(512))
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WidgetConfig(Base):
    __tablename__ = "widget_configs"

    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("bots.id"), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    theme: Mapped[str] = mapped_column(String(16), default="light")
    primary_color: Mapped[str] = mapped_column(String(16), default="#3D46C9")
    texts_json: Mapped[dict] = mapped_column(JSON, default=dict)
    position: Mapped[str] = mapped_column(String(16), default="right")
    offsets_json: Mapped[dict] = mapped_column(JSON, default=dict)
    devices_json: Mapped[dict] = mapped_column(JSON, default=lambda: {"desktop": True, "mobile": True})
    hidden_paths_json: Mapped[list] = mapped_column(JSON, default=list)
    # Shown as tappable chips before the visitor's first message (SAN-1096,
    # FR-C8) — a short list of questions the business owner picks, not
    # generated. Empty means no chips, same as the widget's current
    # behavior before this field existed.
    starter_questions_json: Mapped[list] = mapped_column(JSON, default=list)
    consent_text: Mapped[str] = mapped_column(Text, default="")
    require_consent: Mapped[bool] = mapped_column(Boolean, default=True)
    locale: Mapped[str] = mapped_column(String(16), default="en")
    # Source links under answers (FR-C3, toggleable) — the widget hides them
    # when false.
    show_sources: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class ToolConnection(Base):
    __tablename__ = "tool_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("bots.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # mcp | webhook
    server_url: Mapped[str] = mapped_column(String(1024))
    encrypted_credentials: Mapped[str] = mapped_column(Text, default="")
    enabled_tools_json: Mapped[list] = mapped_column(JSON, default=list)
    requires_confirmation: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    conversation_id: Mapped[str] = mapped_column(String(36), ForeignKey("conversations.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    phone: Mapped[str] = mapped_column(String(64), default="")
    pushed_to_crm: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Plan(Base):
    """Pricing plan shown on the Billing & plan page and the public landing
    page. Price is free text (not cents/currency columns) since pricing
    hasn't been finalized (SAN-1071) and the business wants to edit it like
    copy, not run a migration every time a number changes. Editable only by
    a super admin (see deps.require_super_admin); everyone else reads it.
    """

    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100))
    price_text: Mapped[str] = mapped_column(String(100), default="")
    tagline: Mapped[str] = mapped_column(String(255), default="")
    features_json: Mapped[list] = mapped_column(JSON, default=list)
    # price_text is display copy (can say "Contact us", "from ₹X") and isn't
    # reliably machine-parseable — amount/currency are the real, structured
    # numbers actually charged. A plan with amount=None can be shown but not
    # self-serve purchased (POST .../orders requires it).
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # Usage caps (SAN-1063/1119, FR-A4) — null means unlimited, same
    # nullable-means-"not a real number yet" convention as `amount`.
    max_messages_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_files: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ContentPage(Base):
    """Marketing content a super admin edits from the dashboard instead of
    shipping code: legal pages (kind="legal") and blog posts (kind="blog").
    `body` is plain text — blank-line separated paragraphs, and a line
    starting "## " begins a new headed section. The website falls back to its
    built-in copy when no published row exists for a slug.
    """

    __tablename__ = "content_pages"
    __table_args__ = (UniqueConstraint("kind", "slug", name="uq_content_kind_slug"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    kind: Mapped[str] = mapped_column(String(16), index=True)  # legal | blog
    slug: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(255))
    excerpt: Mapped[str] = mapped_column(String(500), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    read_minutes: Mapped[int] = mapped_column(Integer, default=3)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    # Display date: a blog post's publish date, a legal page's "last updated".
    display_date: Mapped[str] = mapped_column(String(10), default="")
    updated_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AuditLog(Base):
    """Who changed what on the platform (super admin actions). Records the
    request method + path + outcome only — never request bodies, which can
    carry passwords or gateway secrets."""

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    actor_id: Mapped[str] = mapped_column(String(36), default="")
    actor_email: Mapped[str] = mapped_column(String(255), default="")
    method: Mapped[str] = mapped_column(String(8))
    path: Mapped[str] = mapped_column(String(512))
    status_code: Mapped[int] = mapped_column(Integer)
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class PlatformSetting(Base):
    """Platform-wide knobs a super admin can change without a deploy. The
    allowed keys and their validation live in services/platform_settings.py."""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_by: Mapped[str] = mapped_column(String(255), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PaymentGateway(Base):
    """Gateway credentials, DB-stored (not env vars) so live/test keys can be
    swapped from the dashboard without a redeploy. Secrets are Fernet-
    encrypted at rest (see services/crypto.py) — the reference pattern this
    was modeled on stored them as plain varchar, which we deliberately don't
    repeat.
    """

    __tablename__ = "payment_gateways"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(32), unique=True)  # 'razorpay' | 'stripe'
    name: Mapped[str] = mapped_column(String(100))
    test_client_id: Mapped[str] = mapped_column(String(255), default="")
    test_client_secret_enc: Mapped[str] = mapped_column(Text, default="")
    live_client_id: Mapped[str] = mapped_column(String(255), default="")
    live_client_secret_enc: Mapped[str] = mapped_column(Text, default="")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BillingProfile(Base):
    """Single-row table: SanchiJawab's own GST-registration/supplier details
    used on every invoice (not the customer's — customer details live on
    Order). Editable only by a super admin, same gate as Plan.
    """

    __tablename__ = "billing_profile"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    supplier_name: Mapped[str] = mapped_column(String(255), default="")
    supplier_gstin: Mapped[str] = mapped_column(String(32), default="")
    supplier_address: Mapped[str] = mapped_column(String(512), default="")
    supplier_city: Mapped[str] = mapped_column(String(100), default="")
    supplier_state: Mapped[str] = mapped_column(String(100), default="")
    supplier_country: Mapped[str] = mapped_column(String(100), default="India")
    supplier_pincode: Mapped[str] = mapped_column(String(16), default="")
    supplier_email: Mapped[str] = mapped_column(String(255), default="")
    supplier_phone: Mapped[str] = mapped_column(String(32), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PaymentOrderSequence(Base):
    """One row per invoice/order number series (prefix -> last issued
    value). Incremented atomically via a single `INSERT ... ON CONFLICT
    DO UPDATE ... RETURNING` statement (services/payments/sequence.py) so
    concurrent orders never collide on a number — Postgres-native
    equivalent of the MySQL `LAST_INSERT_ID(expr)` trick this was modeled
    on.
    """

    __tablename__ = "payment_order_sequences"

    prefix: Mapped[str] = mapped_column(String(16), primary_key=True)
    last_value: Mapped[int] = mapped_column(BigInteger, default=0)


class Order(Base):
    """One payable thing — currently always a Plan purchase
    (module_type='subscription_plan'), kept as a free-text field like the
    reference implementation so other payable things don't need a schema
    change later.
    """

    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), index=True)
    plan_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("plans.id"), nullable=True)
    module_type: Mapped[str] = mapped_column(String(32), default="subscription_plan")

    gateway_code: Mapped[str] = mapped_column(String(32))  # razorpay | stripe
    payment_mode: Mapped[str] = mapped_column(String(16), default="test")  # test | live
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    status: Mapped[str] = mapped_column(String(16), default="created", index=True)  # created|paid|failed

    gateway_order_id: Mapped[str] = mapped_column(String(255), default="")
    gateway_transaction_id: Mapped[str] = mapped_column(String(255), default="")

    customer_name: Mapped[str] = mapped_column(String(255), default="")
    customer_gstin: Mapped[str] = mapped_column(String(32), default="")
    customer_address: Mapped[str] = mapped_column(String(512), default="")
    customer_city: Mapped[str] = mapped_column(String(100), default="")
    customer_state: Mapped[str] = mapped_column(String(100), default="")
    customer_country: Mapped[str] = mapped_column(String(100), default="India")
    customer_pincode: Mapped[str] = mapped_column(String(16), default="")

    # Computed at confirm-time from supplier_state vs customer_state (real
    # comparison — see services/payments/invoice.py) — not trusted from the
    # client and not left unset like the reference implementation.
    is_intra_state: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    tax_json: Mapped[dict] = mapped_column(JSON, default=dict)

    invoice_number: Mapped[str] = mapped_column(String(64), default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class IngestJob(Base):
    """Background job queue, claimed via SELECT ... FOR UPDATE SKIP LOCKED (Postgres)."""

    __tablename__ = "ingest_jobs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str] = mapped_column(String(36), ForeignKey("sources.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)  # queued|running|done|failed
    error: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Live crawl progress (SAN-1087, FR-K8) — pages_total is an exact count
    # for sitemap mode (the URL list is known upfront) or the max_pages
    # ceiling for whole_domain/single_page (the real total isn't knowable
    # until the crawl stops finding new links), updated as the crawl runs
    # so the frontend can poll real progress instead of just queued/running.
    pages_done: Mapped[int] = mapped_column(Integer, default=0)
    pages_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Checked between page fetches during a crawl (SAN-1088, FR-K10) — set
    # by the "Stop" action, read by the running job itself; a boolean flag
    # rather than jumping straight to a cancelled status, since the worker
    # (not the API request) is what actually stops the in-progress crawl.
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
