"""Customer billing details (admin/owner only), checkout validation, and
recording a cancelled/failed payment."""
from __future__ import annotations

import uuid

from httpx import AsyncClient

from app.db import SessionLocal
from app.models import Order, Plan
from app.services.payments.billing_validation import billing_errors

GOOD = {
    "name": "Acme Pvt Ltd", "gstin": "29ABCDE1234F1Z5", "address": "12 MG Road", "city": "Bengaluru",
    "state": "Karnataka", "country": "India", "pincode": "560001", "phone_country_code": "+91", "phone": "9876543210",
}


def test_validation_flags_every_missing_required_field():
    empty = dict.fromkeys(GOOD, "")
    errs = billing_errors(**empty)
    assert {"name", "address", "country", "state", "city", "pincode", "phone_country_code", "phone"} <= set(errs)
    assert "gstin" not in errs  # GSTIN is optional


def test_validation_rules():
    assert billing_errors(**GOOD) == {}
    assert "pincode" in billing_errors(**{**GOOD, "pincode": "56"})
    assert "gstin" in billing_errors(**{**GOOD, "gstin": "NOTAGSTIN"})
    assert "phone" in billing_errors(**{**GOOD, "phone": "12"})
    # A non-Indian address can't carry a GSTIN, and takes a looser postal code.
    assert "gstin" in billing_errors(**{**GOOD, "country": "United States"})
    assert billing_errors(**{**GOOD, "country": "United States", "gstin": "", "state": "California", "pincode": "94105"}) == {}


async def test_billing_details_save_and_read_owner_only(client: AsyncClient, signed_up_owner: dict):
    ws, h = signed_up_owner["workspace_id"], signed_up_owner["headers"]
    assert (await client.get(f"/v1/workspaces/{ws}/billing-details", headers=h)).json()["name"] == ""

    bad = await client.put(f"/v1/workspaces/{ws}/billing-details", json={**GOOD, "phone": ""}, headers=h)
    assert bad.status_code == 422

    ok = await client.put(f"/v1/workspaces/{ws}/billing-details", json=GOOD, headers=h)
    assert ok.status_code == 200
    assert (await client.get(f"/v1/workspaces/{ws}/billing-details", headers=h)).json()["gstin"] == GOOD["gstin"]

    # Someone with no membership in this workspace sees nothing.
    other = await client.post("/v1/auth/signup", json={"email": f"pytest_other_{uuid.uuid4().hex[:8]}@example.com", "password": "Passw0rd!23", "business_name": "Other"})
    other_h = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert (await client.get(f"/v1/workspaces/{ws}/billing-details", headers=other_h)).status_code == 403


async def test_order_needs_complete_billing_details(client: AsyncClient, signed_up_owner: dict):
    ws, h = signed_up_owner["workspace_id"], signed_up_owner["headers"]
    async with SessionLocal() as s:
        plan = Plan(name="BD test plan", amount=100.0, currency="INR")
        s.add(plan)
        await s.commit()
        plan_id = plan.id
    resp = await client.post(
        f"/v1/workspaces/{ws}/orders",
        json={"plan_id": plan_id, "gateway_code": "razorpay", "customer_name": "Only a name"},
        headers=h,
    )
    assert resp.status_code == 422 and "Please fix" in resp.json()["detail"]

    async with SessionLocal() as s:
        await s.delete(await s.get(Plan, plan_id))
        await s.commit()


async def test_outcome_marks_unpaid_order_and_never_downgrades_paid(client: AsyncClient, signed_up_owner: dict):
    ws, h = signed_up_owner["workspace_id"], signed_up_owner["headers"]
    async with SessionLocal() as s:
        paid = Order(tenant_id="t", workspace_id=ws, gateway_code="razorpay", amount=1.0, status="paid")
        open_ = Order(tenant_id="t", workspace_id=ws, gateway_code="razorpay", amount=1.0, status="created")
        s.add_all([paid, open_])
        await s.commit()
        paid_id, open_id = paid.id, open_.id

    assert (await client.post(f"/v1/orders/{open_id}/outcome", json={"status": "cancelled"}, headers=h)).json()["status"] == "cancelled"
    assert (await client.post(f"/v1/orders/{paid_id}/outcome", json={"status": "failed"}, headers=h)).json()["status"] == "paid"
    assert (await client.post(f"/v1/orders/{open_id}/outcome", json={"status": "bogus"}, headers=h)).status_code == 422
