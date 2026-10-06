"""Covers the parts of the payments module verifiable without real Razorpay/
Stripe sandbox credentials: GST split math, invoice rendering, the atomic
order-number sequence under real concurrency, and secret encryption. The
actual gateway API calls (create order, verify payment) need real test keys
— see knowledge.md.
"""
from __future__ import annotations

import asyncio

import pytest

from app.db import SessionLocal
from app.models import BillingProfile, Order, Plan, Workspace
from app.services.crypto import decrypt_secret, encrypt_secret
from app.services.payments.invoice import compute_gst_split, generate_invoice_html, render_invoice_pdf
from app.services.payments.sequence import next_invoice_number


def test_gst_split_intra_state_splits_into_cgst_and_sgst():
    result = compute_gst_split(1000.0, supplier_state="Karnataka", customer_state="karnataka")
    assert result["is_intra_state"] is True
    names = {line["name"] for line in result["lines"]}
    assert names == {"CGST", "SGST"}
    assert result["total_tax"] == pytest.approx(180.0)
    assert result["grand_total"] == pytest.approx(1180.0)


def test_gst_split_inter_state_is_single_igst_line():
    result = compute_gst_split(1000.0, supplier_state="Karnataka", customer_state="Maharashtra")
    assert result["is_intra_state"] is False
    assert len(result["lines"]) == 1
    assert result["lines"][0]["name"] == "IGST"
    assert result["total_tax"] == pytest.approx(180.0)


def test_gst_split_blank_customer_state_falls_back_to_inter_state():
    # Can't assume intra-state when we don't actually know the customer's
    # state — blank/unknown must not silently become the cheaper split.
    result = compute_gst_split(1000.0, supplier_state="Karnataka", customer_state="")
    assert result["is_intra_state"] is False


def test_encrypt_secret_roundtrips_and_is_not_plaintext():
    secret = "sk_test_abc123"
    encrypted = encrypt_secret(secret)
    assert encrypted != secret
    assert decrypt_secret(encrypted) == secret


@pytest.mark.asyncio
async def test_invoice_html_renders_correct_gst_lines_and_pdf_is_real_pdf_bytes():
    async with SessionLocal() as session:
        workspace = Workspace(tenant_id="t1", name="Test Workspace")
        session.add(workspace)
        plan = Plan(name="Test Plan", amount=1000.0, currency="INR")
        session.add(plan)
        await session.flush()

        order = Order(
            tenant_id="t1", workspace_id=workspace.id, plan_id=plan.id,
            gateway_code="razorpay", payment_mode="test", amount=1000.0, currency="INR",
            status="paid", gateway_transaction_id="pay_test123",
            customer_name="Test Customer", customer_state="Karnataka", customer_city="Bengaluru",
        )
        order.tax_json = compute_gst_split(1000.0, "Karnataka", "Karnataka")
        session.add(order)
        await session.flush()

        profile = BillingProfile(supplier_name="SanchiJawab", supplier_state="Karnataka", supplier_gstin="29ABCDE1234F1Z5")
        session.add(profile)
        await session.flush()

        html = generate_invoice_html(order=order, billing_profile=profile, plan_name=plan.name)
        assert "CGST" in html and "SGST" in html
        assert "pay_test123" in html
        assert "TAX INVOICE" in html

        proforma_html = generate_invoice_html(order=order, billing_profile=profile, plan_name=plan.name, is_proforma=True)
        assert "PROFORMA INVOICE" in proforma_html
        assert "pay_test123" not in proforma_html  # no transaction id on a proforma

        pdf_bytes = await render_invoice_pdf(html)
        assert pdf_bytes[:4] == b"%PDF"

        await session.rollback()  # don't leave test rows behind


@pytest.mark.asyncio
async def test_invoice_sequence_numbers_are_unique_under_concurrency():
    async def one():
        async with SessionLocal() as session:
            number = await next_invoice_number(session, prefix="TESTSEQ")
            await session.commit()
            return number

    numbers = await asyncio.gather(*[one() for _ in range(20)])
    assert len(set(numbers)) == 20  # no two concurrent callers got the same number
