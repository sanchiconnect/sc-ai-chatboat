"""Async SQLAlchemy engine/session for the app database (PostgreSQL).

Deliberately only one engine here — the tenants registry (sc_tenants) is
not modeled or connected to from application code until its schema is
provided; see config.py and knowledge.md.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings

engine = create_async_engine(settings.postgres_url, pool_pre_ping=True, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
