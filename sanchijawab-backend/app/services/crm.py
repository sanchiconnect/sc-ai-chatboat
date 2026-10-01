"""Generic outbound webhook push for captured leads — deliberately not tied
to one CRM vendor's SDK. A plain POST works as the inbound side of Zapier,
Make.com, n8n, or most CRMs' own "inbound webhook"/"web-to-lead" endpoints,
which covers far more real setups than hardcoding e.g. HubSpot's API would.
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger("sanchijawab.crm")

TIMEOUT_SECONDS = 8.0


async def push_lead(webhook_url: str, *, lead_id: str, bot_id: str, bot_name: str, name: str, email: str, phone: str) -> bool:
    if not webhook_url:
        return False

    payload = {
        "event": "lead.captured",
        "lead_id": lead_id,
        "bot_id": bot_id,
        "bot_name": bot_name,
        "name": name,
        "email": email,
        "phone": phone,
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            resp = await client.post(webhook_url, json=payload)
        if resp.status_code >= 400:
            logger.warning("CRM webhook for lead %s returned %d", lead_id, resp.status_code)
            return False
        return True
    except httpx.HTTPError as e:
        logger.warning("CRM webhook for lead %s failed: %s", lead_id, e)
        return False
