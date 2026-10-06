"""Password hashing + JWT issuing/verification (FR-A1).

Email verification and invite tokens are sent for real via services/email.py
when SMTP_* is configured in .env; the token is also still returned in the
API response as a local-dev fallback for when it isn't.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from ..config import settings

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRES_HOURS = 24 * 7
EMAIL_VERIFY_TOKEN_EXPIRES_HOURS = 48
INVITE_TOKEN_EXPIRES_HOURS = 24 * 7
STAFF_ACCESS_TOKEN_EXPIRES_HOURS = 8


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: str, tenant_id: str) -> str:
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRES_HOURS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_staff_access_token(user_id: str) -> str:
    """Separate token type from create_access_token so a staff session can
    never be replayed against ordinary customer-scoped routes (and vice
    versa) — decode_token's expected_type check rejects a mismatch outright.
    Shorter-lived than a customer session since it grants cross-tenant read
    access.
    """
    payload = {
        "sub": user_id,
        "type": "staff_access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=STAFF_ACCESS_TOKEN_EXPIRES_HOURS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_email_verify_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "email_verify",
        "exp": datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFY_TOKEN_EXPIRES_HOURS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_invite_token(user_id: str, workspace_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "workspace_id": workspace_id,
        "role": role,
        "type": "invite",
        "exp": datetime.now(timezone.utc) + timedelta(hours=INVITE_TOKEN_EXPIRES_HOURS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload
