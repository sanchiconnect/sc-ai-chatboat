"""FastAPI auth dependencies — extract + verify the bearer token, and
check workspace role membership (FR-A3).
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select

from .db import SessionLocal
from .models import Membership, User, Workspace
from .services.auth import decode_token

ROLE_RANK = {"viewer": 0, "agent": 1, "admin": 2, "owner": 3}


@dataclass
class CurrentUser:
    user_id: str
    tenant_id: str


async def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header")
    token = authorization.removeprefix("Bearer ")
    payload = decode_token(token, expected_type="access")
    if payload is None:
        raise HTTPException(401, "Invalid or expired token")
    # Deliberately hits the DB on every request (not just at login) so a
    # super admin deactivating a user takes effect immediately, instead of
    # waiting out that user's already-issued token (up to 7 days).
    async with SessionLocal() as session:
        db_user = await session.get(User, payload["sub"])
    if db_user is None or not db_user.is_active:
        raise HTTPException(401, "This account has been deactivated")
    return CurrentUser(user_id=payload["sub"], tenant_id=payload["tenant_id"])


async def require_workspace_role(workspace_id: str, user: CurrentUser, min_role: str) -> Membership:
    async with SessionLocal() as session:
        workspace = await session.get(Workspace, workspace_id)
        membership = (
            await session.execute(
                select(Membership).where(
                    Membership.workspace_id == workspace_id, Membership.user_id == user.user_id
                )
            )
        ).scalar_one_or_none()

    # Checked even before membership, so a deactivated workspace blocks every
    # member equally — this is a workspace-wide gate, separate from any one
    # member's own User.is_active.
    if workspace is not None and not workspace.is_active:
        raise HTTPException(403, "This workspace has been deactivated")
    if membership is None:
        raise HTTPException(403, "Not a member of this workspace")
    if ROLE_RANK.get(membership.role, -1) < ROLE_RANK.get(min_role, 99):
        raise HTTPException(403, f"Requires role >= {min_role}, has {membership.role}")
    return membership


async def require_super_admin(user: CurrentUser = Depends(get_current_user)) -> User:
    """Platform-level gate, independent of any workspace membership/role —
    for actions like editing pricing plans that aren't scoped to one tenant.
    """
    async with SessionLocal() as session:
        db_user = await session.get(User, user.user_id)
    if db_user is None or not db_user.is_super_admin:
        raise HTTPException(403, "Requires super admin")
    return db_user


async def get_current_staff_user(authorization: str = Header(default="")) -> User:
    """Gate for the staff/super-admin dashboard routes. Requires a token
    minted by POST /v1/staff/login (type=staff_access), not an ordinary
    customer access token — the two are not interchangeable even for the
    same super-admin user, so a staff session can't leak into customer-scoped
    requests or vice versa. Re-checks is_super_admin on every call in case it
    was revoked after the token was issued.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header")
    token = authorization.removeprefix("Bearer ")
    payload = decode_token(token, expected_type="staff_access")
    if payload is None:
        raise HTTPException(401, "Invalid or expired staff token")
    async with SessionLocal() as session:
        db_user = await session.get(User, payload["sub"])
    if db_user is None or not db_user.is_active or not db_user.is_super_admin:
        raise HTTPException(403, "Requires super admin")
    return db_user
