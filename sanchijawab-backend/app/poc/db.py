"""Minimal pgvector storage for the Phase 0 PoC.

Real schema (SAN-1064/SAN-1121) has bot_id, visibility, heading_path, etc.
This has one deliberate concession to realism though: `site` scoping. Even
in a PoC, storing multiple sites' chunks in one table without a tenant
filter would reproduce the exact cross-tenant leak FR-K13 exists to
prevent, so every read/write here is scoped by site.
"""
from __future__ import annotations

import os
from urllib.parse import urlparse

import asyncpg
from pgvector.asyncpg import register_vector

EMBED_DIM = int(os.environ.get("EMBED_DIM", "384"))

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://sanchijawab:sanchijawab@localhost:5432/sanchijawab",
).replace("postgresql+asyncpg://", "postgresql://")


def site_of(url: str) -> str:
    """Derive the tenant key from a URL's hostname (strips leading www.)."""
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


async def get_connection() -> asyncpg.Connection:
    conn = await asyncpg.connect(DATABASE_URL)
    await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    await register_vector(conn)
    await conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS poc_chunks (
            id BIGSERIAL PRIMARY KEY,
            site TEXT NOT NULL,
            url TEXT NOT NULL,
            chunk_index INT NOT NULL,
            text TEXT NOT NULL,
            embedding VECTOR({EMBED_DIM}),
            tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
        )
        """
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS poc_chunks_site_idx ON poc_chunks (site)"
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS poc_chunks_tsv_idx ON poc_chunks USING GIN (tsv)"
    )
    return conn


async def clear_url(conn: asyncpg.Connection, url: str) -> None:
    await conn.execute("DELETE FROM poc_chunks WHERE url = $1", url)


async def insert_chunk(
    conn: asyncpg.Connection, url: str, chunk_index: int, text: str, embedding: list[float]
) -> None:
    await conn.execute(
        "INSERT INTO poc_chunks (site, url, chunk_index, text, embedding) VALUES ($1, $2, $3, $4, $5)",
        site_of(url),
        url,
        chunk_index,
        text,
        embedding,
    )


async def site_stats(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(
        "SELECT site, COUNT(*) AS chunks, COUNT(DISTINCT url) AS pages FROM poc_chunks GROUP BY site ORDER BY site"
    )
    return [dict(r) for r in rows]
