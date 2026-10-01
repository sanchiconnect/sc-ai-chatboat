"""Gateway credential storage/lookup — DB-backed (payment_gateways table),
not env vars, so a super admin can swap live/test keys per gateway from the
dashboard without a redeploy. Secrets are encrypted at rest (services/crypto.py).
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models import PaymentGateway
from ..crypto import decrypt_secret, encrypt_secret


@dataclass
class GatewayCredentials:
    client_id: str
    client_secret: str


async def get_gateway_credentials(session: AsyncSession, code: str, payment_mode: str) -> GatewayCredentials:
    row = (await session.execute(select(PaymentGateway).where(PaymentGateway.code == code))).scalar_one_or_none()
    if row is None or not row.enabled:
        raise HTTPException(400, f"Payment gateway '{code}' is not configured")

    is_live = payment_mode == "live"
    client_id = row.live_client_id if is_live else row.test_client_id
    secret_enc = row.live_client_secret_enc if is_live else row.test_client_secret_enc
    if not client_id or not secret_enc:
        raise HTTPException(400, f"Payment gateway '{code}' has no {payment_mode} credentials configured")

    return GatewayCredentials(client_id=client_id, client_secret=decrypt_secret(secret_enc))


async def upsert_gateway(
    session: AsyncSession,
    *,
    code: str,
    name: str,
    test_client_id: str | None = None,
    test_client_secret: str | None = None,
    live_client_id: str | None = None,
    live_client_secret: str | None = None,
    is_primary: bool | None = None,
    enabled: bool | None = None,
) -> PaymentGateway:
    row = (await session.execute(select(PaymentGateway).where(PaymentGateway.code == code))).scalar_one_or_none()
    if row is None:
        row = PaymentGateway(code=code, name=name)
        session.add(row)

    row.name = name
    if test_client_id is not None:
        row.test_client_id = test_client_id
    if test_client_secret is not None:
        row.test_client_secret_enc = encrypt_secret(test_client_secret)
    if live_client_id is not None:
        row.live_client_id = live_client_id
    if live_client_secret is not None:
        row.live_client_secret_enc = encrypt_secret(live_client_secret)
    if is_primary is not None:
        row.is_primary = is_primary
    if enabled is not None:
        row.enabled = enabled

    await session.flush()
    return row


def gateway_out(row: PaymentGateway) -> dict:
    """Never returns decrypted secrets — just enough to show configuration
    state in the dashboard (e.g. 'test keys set, live keys missing')."""
    return {
        "code": row.code,
        "name": row.name,
        "is_primary": row.is_primary,
        "enabled": row.enabled,
        "test_client_id": row.test_client_id,
        "test_configured": bool(row.test_client_id and row.test_client_secret_enc),
        "live_client_id": row.live_client_id,
        "live_configured": bool(row.live_client_id and row.live_client_secret_enc),
    }
