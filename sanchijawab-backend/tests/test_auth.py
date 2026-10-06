"""Auth flows (FR-A1/A2/A3): signup, login, email verification, and the
invite -> accept-invite -> login path for new team members."""
from __future__ import annotations

import uuid

from httpx import AsyncClient


async def test_signup_returns_token_and_dev_fallback_verify_token(client: AsyncClient):
    email = f"pytest_{uuid.uuid4().hex[:10]}@example.com"
    resp = await client.post(
        "/v1/auth/signup",
        json={"email": email, "password": "Passw0rd!23", "business_name": "PytestCo"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["access_token"]
    assert data["workspace_id"]
    assert "email_sent" in data  # False unless SMTP_HOST is configured
    assert data["email_verify_token"]


async def test_signup_rejects_duplicate_email(client: AsyncClient, signed_up_owner: dict):
    resp = await client.post(
        "/v1/auth/signup",
        json={"email": signed_up_owner["email"], "password": "Whatever123", "business_name": "Dupe"},
    )
    assert resp.status_code == 400


async def test_login_with_wrong_password_is_rejected(client: AsyncClient, signed_up_owner: dict):
    resp = await client.post(
        "/v1/auth/login", json={"email": signed_up_owner["email"], "password": "WrongPassword"}
    )
    assert resp.status_code == 401


async def test_verify_email_with_real_token(client: AsyncClient):
    email = f"pytest_{uuid.uuid4().hex[:10]}@example.com"
    signup = (
        await client.post(
            "/v1/auth/signup",
            json={"email": email, "password": "Passw0rd!23", "business_name": "PytestCo"},
        )
    ).json()

    resp = await client.post("/v1/auth/verify-email", json={"token": signup["email_verify_token"]})
    assert resp.status_code == 200
    assert resp.json()["verified"] is True


async def test_verify_email_rejects_garbage_token(client: AsyncClient):
    resp = await client.post("/v1/auth/verify-email", json={"token": "not-a-real-token"})
    assert resp.status_code == 400


async def test_invite_new_user_then_accept_invite_then_login(client: AsyncClient, signed_up_owner: dict):
    invitee_email = f"invitee_{uuid.uuid4().hex[:10]}@example.com"
    invite = (
        await client.post(
            f"/v1/workspaces/{signed_up_owner['workspace_id']}/invitations",
            json={"email": invitee_email, "role": "agent"},
            headers=signed_up_owner["headers"],
        )
    ).json()
    # email_sent depends on whether SMTP is configured in this environment
    # (local dev with real creds vs. CI without) — not a constant, so don't
    # assert either way; invite_token is returned unconditionally.
    assert invite["invite_token"]

    accept = await client.post(
        "/v1/auth/accept-invite", json={"token": invite["invite_token"], "password": "InviteePass!23"}
    )
    assert accept.status_code == 200
    assert accept.json()["workspace_id"] == signed_up_owner["workspace_id"]

    login = await client.post("/v1/auth/login", json={"email": invitee_email, "password": "InviteePass!23"})
    assert login.status_code == 200

    workspaces = await client.get(
        "/v1/workspaces", headers={"Authorization": f"Bearer {accept.json()['access_token']}"}
    )
    roles = {w["workspace_id"]: w["role"] for w in workspaces.json()}
    assert roles[signed_up_owner["workspace_id"]] == "agent"


async def test_accept_invite_cannot_be_used_twice(client: AsyncClient, signed_up_owner: dict):
    invitee_email = f"invitee_{uuid.uuid4().hex[:10]}@example.com"
    invite = (
        await client.post(
            f"/v1/workspaces/{signed_up_owner['workspace_id']}/invitations",
            json={"email": invitee_email, "role": "viewer"},
            headers=signed_up_owner["headers"],
        )
    ).json()

    first = await client.post(
        "/v1/auth/accept-invite", json={"token": invite["invite_token"], "password": "First123456"}
    )
    assert first.status_code == 200

    second = await client.post(
        "/v1/auth/accept-invite", json={"token": invite["invite_token"], "password": "Second123456"}
    )
    assert second.status_code == 400
