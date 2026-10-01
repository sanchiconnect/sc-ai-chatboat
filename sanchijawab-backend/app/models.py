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
from sqlalchemy import BigInteger, Boolean, Computed, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    bots: Mapped[list["Bot"]] = relationship(back_populates="workspace")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_super_admin: Mapped[bool] = mapped_column(Boolean, default=False)
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
    mode: Mapped[str] = mapped_column(String(16), default="single_page")
    include_patterns: Mapped[str] = mapped_column(Text, default="")
    exclude_patterns: Mapped[str] = mapped_column(Text, default="")
    max_pages: Mapped[int] = mapped_column(Integer, default=5000)
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
    consent_text: Mapped[str] = mapped_column(Text, default="")
    require_consent: Mapped[bool] = mapped_column(Boolean, default=True)
    locale: Mapped[str] = mapped_column(String(16), default="en")


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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
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
