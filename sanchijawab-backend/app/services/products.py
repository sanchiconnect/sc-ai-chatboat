"""Product catalogue (SAN-1800, FR-K12): store products per bot, import them
from CSV, and find the ones relevant to a visitor's question so the chat can
show them as cards. Search is by meaning (the same local embedding model used
for website content), with a minimum similarity so unrelated products are not
pushed at visitors."""
from __future__ import annotations

import csv
import io
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Product
from .embeddings import embed_one, embed_texts

# Cosine similarity needed before a product counts as relevant. Measured with the
# bge-small model on sample products: an on-topic product scores 0.70-0.74, a
# loosely related one 0.58-0.60, an unrelated one 0.39-0.51. So 0.65 keeps the
# first group only; MARGIN also drops products well below the best match.
MIN_SIMILARITY = 0.65
MARGIN = 0.08
MAX_CARDS = 3
MAX_IMPORT_ROWS = 500
MAX_PRODUCTS_PER_BOT = 2000


class ProductError(ValueError):
    pass


def clean_url(value: str, field: str) -> str:
    """Empty is fine; anything else must be a plain http(s) link. Visitors click
    these, so javascript:/data: links must never be stored."""
    value = (value or "").strip()
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or len(value) > 1024:
        raise ProductError(f"{field} must be a full http(s) link")
    return value


def _embedding_text(name: str, description: str) -> str:
    return f"{name}. {description}".strip()


def clean_fields(name: str, price: str, description: str, image_url: str, product_url: str) -> dict:
    name = (name or "").strip()
    if not name or len(name) > 255:
        raise ProductError("name is required (up to 255 characters)")
    return {
        "name": name, "price_text": (price or "").strip()[:50], "description": (description or "").strip()[:2000],
        "image_url": clean_url(image_url, "image link"), "product_url": clean_url(product_url, "product link"),
    }


async def count_products(session: AsyncSession, bot_id: str) -> int:
    return len((await session.execute(select(Product.id).where(Product.bot_id == bot_id))).all())


async def create_product(session: AsyncSession, *, tenant_id: str, bot_id: str, **fields) -> Product:
    p = Product(tenant_id=tenant_id, bot_id=bot_id, embedding=embed_one(_embedding_text(fields["name"], fields["description"])), **fields)
    session.add(p)
    return p


async def update_product(session: AsyncSession, product: Product, **fields) -> None:
    for k, v in fields.items():
        setattr(product, k, v)
    product.embedding = embed_one(_embedding_text(product.name, product.description))


def parse_csv(raw: bytes) -> tuple[list[dict], list[str]]:
    """Returns (valid rows, human-readable problems). Columns (header row required,
    any order): name, price, description, image_url, url."""
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ProductError("The file must be UTF-8 text (save the CSV as 'CSV UTF-8').")
    reader = csv.DictReader(io.StringIO(text))
    headers = {(h or "").strip().lower() for h in (reader.fieldnames or [])}
    if "name" not in headers:
        raise ProductError("The first row must be a header with at least a 'name' column (optional: price, description, image_url, url).")
    rows, problems = [], []
    for i, row in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "") for k, v in row.items()}
        if not any(v.strip() for v in row.values()):
            continue
        if len(rows) >= MAX_IMPORT_ROWS:
            problems.append(f"Stopped at {MAX_IMPORT_ROWS} rows; split the file to import more.")
            break
        try:
            rows.append(clean_fields(row.get("name", ""), row.get("price", ""), row.get("description", ""),
                                     row.get("image_url", ""), row.get("url", "")))
        except ProductError as e:
            problems.append(f"Row {i}: {e}")
    return rows, problems


async def import_rows(session: AsyncSession, *, tenant_id: str, bot_id: str, rows: list[dict]) -> int:
    room = MAX_PRODUCTS_PER_BOT - await count_products(session, bot_id)
    if room <= 0:
        raise ProductError(f"This assistant already has {MAX_PRODUCTS_PER_BOT} products, the maximum.")
    rows = rows[:room]
    vectors = embed_texts([_embedding_text(r["name"], r["description"]) for r in rows]) if rows else []
    for r, v in zip(rows, vectors):
        session.add(Product(tenant_id=tenant_id, bot_id=bot_id, embedding=v, **r))
    return len(rows)


async def search(session: AsyncSession, *, tenant_id: str, bot_id: str, query: str, limit: int = MAX_CARDS) -> list[dict]:
    """Products related to `query`, best first, each with its similarity."""
    if not query.strip():
        return []
    qv = embed_one(query)
    similarity = (1 - Product.embedding.cosine_distance(qv)).label("similarity")
    rows = (await session.execute(
        select(Product, similarity)
        .where(Product.tenant_id == tenant_id, Product.bot_id == bot_id)
        .order_by(Product.embedding.cosine_distance(qv)).limit(limit)
    )).all()
    found = [(p, float(s)) for p, s in rows if s >= MIN_SIMILARITY]
    if not found:
        return []
    best = found[0][1]
    return [to_card(p) | {"similarity": s} for p, s in found if s >= best - MARGIN]


def to_card(p: Product) -> dict:
    return {"product_id": p.id, "name": p.name, "price": p.price_text, "description": p.description[:300],
            "image_url": p.image_url, "url": p.product_url}
