"""In-app notifications for team events: invite, accept, role change, removal."""
from __future__ import annotations

import uuid

from httpx import AsyncClient


async def _notes(client: AsyncClient, headers: dict) -> list[dict]:
    return (await client.get("/v1/notifications", headers=headers)).json()["notifications"]


async def test_team_events_notify_the_right_people(client: AsyncClient, signed_up_owner: dict):
    ws, owner_h = signed_up_owner["workspace_id"], signed_up_owner["headers"]
    mate = f"invitee_{uuid.uuid4().hex[:8]}@example.com"  # invitee_ is swept up by the after-tests cleanup

    invite = await client.post(f"/v1/workspaces/{ws}/invitations", json={"email": mate, "role": "agent"}, headers=owner_h)
    assert invite.status_code == 200
    assert any(n["kind"] == "team" and mate in n["message"] and n["link"] == "/dashboard/team" for n in await _notes(client, owner_h))

    accepted = await client.post("/v1/auth/accept-invite", json={"token": invite.json()["invite_token"], "password": "Passw0rd!23"})
    assert accepted.status_code == 200
    mate_h = {"Authorization": f"Bearer {accepted.json()['access_token']}"}
    assert any("accepted the invitation" in n["message"] for n in await _notes(client, owner_h))

    members = (await client.get(f"/v1/workspaces/{ws}/members", headers=owner_h)).json()
    mate_id = next(m["user_id"] for m in members if m["email"] == mate)
    assert (await client.patch(f"/v1/workspaces/{ws}/members/{mate_id}", json={"role": "viewer"}, headers=owner_h)).status_code == 200
    assert any("is now viewer" in n["message"] for n in await _notes(client, mate_h))

    # A viewer can't manage the team (the dashboard hides the controls; the server enforces it).
    assert (await client.patch(f"/v1/workspaces/{ws}/members/{mate_id}", json={"role": "admin"}, headers=mate_h)).status_code == 403
    assert (await client.delete(f"/v1/workspaces/{ws}/members/{mate_id}", headers=mate_h)).status_code == 403
