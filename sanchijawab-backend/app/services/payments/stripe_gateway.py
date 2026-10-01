"""Stripe integration. Flow: create a Checkout Session server-side ->
redirect the customer to session.url -> on return, we re-retrieve the
session (expanding payment_intent) and verify payment status server-side —
never trust the redirect alone.

The reference implementation this was modeled on had an inverted check
(`payment_status === 'paid' || paymentIntent.status !== 'succeeded'`, which
is true for almost any session and effectively never blocks an unpaid one).
This version requires BOTH to be true.
"""
from __future__ import annotations

import stripe
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .gateways import get_gateway_credentials


async def _client(session: AsyncSession, payment_mode: str) -> stripe.StripeClient:
    creds = await get_gateway_credentials(session, "stripe", payment_mode)
    return stripe.StripeClient(creds.client_secret)


async def create_order(
    session: AsyncSession, payment_mode: str, *, amount: float, currency: str,
    product_name: str, success_url: str, cancel_url: str,
) -> dict:
    client = await _client(session, payment_mode)
    amount_smallest_unit = int(round(amount * 100))  # cents/paise
    try:
        checkout_session = client.v1.checkout.sessions.create(
            {
                "mode": "payment",
                # payment_method_types was removed by Stripe (verified live,
                # 2026-10) — a current API now manages enabled payment
                # methods from the Dashboard instead of per-request; omitting
                # it lets Stripe pick whatever the account has enabled.
                "line_items": [
                    {
                        "price_data": {
                            "currency": currency.lower(),
                            "product_data": {"name": product_name},
                            "unit_amount": amount_smallest_unit,
                        },
                        "quantity": 1,
                    }
                ],
                "success_url": success_url,
                "cancel_url": cancel_url,
            }
        )
    except stripe.StripeError as e:
        raise HTTPException(502, f"Stripe checkout session creation failed: {e}") from e
    return {"gateway_order_id": checkout_session.id, "checkout_url": checkout_session.url}


async def verify_and_capture(session: AsyncSession, payment_mode: str, gateway_order_id: str) -> str:
    """Returns the PaymentIntent id if genuinely paid, or raises."""
    client = await _client(session, payment_mode)
    try:
        checkout_session = client.v1.checkout.sessions.retrieve(
            gateway_order_id, params={"expand": ["payment_intent"]}
        )
    except stripe.StripeError as e:
        raise HTTPException(502, f"Stripe session lookup failed: {e}") from e
    payment_intent = checkout_session.payment_intent
    intent_id = payment_intent.id if hasattr(payment_intent, "id") else payment_intent
    intent_status = payment_intent.status if hasattr(payment_intent, "status") else None

    is_paid = checkout_session.payment_status == "paid" and intent_status == "succeeded"
    if not is_paid or not intent_id:
        raise HTTPException(402, "Stripe checkout session is not a completed, successful payment")
    return intent_id
