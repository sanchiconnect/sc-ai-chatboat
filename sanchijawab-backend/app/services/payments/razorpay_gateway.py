"""Razorpay integration. Flow: create an order server-side -> frontend opens
Razorpay Checkout with that order id -> on return, we re-fetch payments for
the order and only trust an entry with status == 'captured' — never the
frontend's own "success" callback, which an attacker can fire without
actually paying.
"""
from __future__ import annotations

import time

import razorpay
import razorpay.errors
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .gateways import get_gateway_credentials

RAZORPAY_ERRORS = (razorpay.errors.BadRequestError, razorpay.errors.GatewayError, razorpay.errors.ServerError)


async def _client(session: AsyncSession, payment_mode: str) -> razorpay.Client:
    creds = await get_gateway_credentials(session, "razorpay", payment_mode)
    return razorpay.Client(auth=(creds.client_id, creds.client_secret))


async def create_order(session: AsyncSession, payment_mode: str, *, amount: float, currency: str) -> dict:
    client = await _client(session, payment_mode)
    amount_smallest_unit = int(round(amount * 100))  # paise
    try:
        order = client.order.create(
            data={
                "amount": amount_smallest_unit,
                "currency": currency,
                "receipt": f"rcpt_{int(time.time() * 1000)}",
                "payment_capture": 1,
            }
        )
    except RAZORPAY_ERRORS as e:
        raise HTTPException(502, f"Razorpay order creation failed: {e}") from e
    creds = await get_gateway_credentials(session, "razorpay", payment_mode)
    return {
        "gateway_order_id": order["id"],
        "amount": amount_smallest_unit,
        "currency": currency,
        "key_id": creds.client_id,  # the checkout widget needs the public key id, not the secret
    }


async def verify_and_capture(session: AsyncSession, payment_mode: str, gateway_order_id: str) -> str:
    """Returns the captured payment's id, or raises if none is captured."""
    client = await _client(session, payment_mode)
    try:
        payments = client.order.payments(gateway_order_id)
    except RAZORPAY_ERRORS as e:
        raise HTTPException(502, f"Razorpay payment lookup failed: {e}") from e
    captured = next((p for p in payments.get("items", []) if p.get("status") == "captured"), None)
    if captured is None:
        raise HTTPException(402, "No captured payment found for this order yet")
    return captured["id"]
