"""Server-side rules for a customer's billing details. The dashboard checks
the same rules before it lets someone reach a payment screen, but the server
never relies on that: an order can't be created without these."""
from __future__ import annotations

import re

from fastapi import HTTPException

GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
IN_PIN_RE = re.compile(r"^\d{6}$")
OTHER_PIN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$")
DIAL_RE = re.compile(r"^\+\d{1,4}$")

FIELD_LABELS = {
    "name": "Billing name", "address": "Address", "country": "Country", "state": "State", "city": "City",
    "pincode": "Pincode", "phone_country_code": "Country code", "phone": "Mobile number", "gstin": "GSTIN",
}


def billing_errors(*, name: str, gstin: str, address: str, city: str, state: str, country: str,
                   pincode: str, phone_country_code: str, phone: str) -> dict[str, str]:
    errors: dict[str, str] = {}
    for field, value in (("name", name), ("address", address), ("country", country), ("state", state), ("city", city), ("pincode", pincode)):
        if not value.strip():
            errors[field] = f"{FIELD_LABELS[field]} is required"
    is_india = country.strip().lower() == "india"
    if pincode.strip() and "pincode" not in errors:
        if is_india and not IN_PIN_RE.match(pincode.strip()):
            errors["pincode"] = "Enter a 6-digit pincode"
        elif not is_india and not OTHER_PIN_RE.match(pincode.strip()):
            errors["pincode"] = "Enter a valid postal code"
    if not DIAL_RE.match(phone_country_code.strip()):
        errors["phone_country_code"] = "Choose a country code"
    digits = re.sub(r"\D", "", phone)
    if not digits:
        errors["phone"] = "Mobile number is required"
    elif not 6 <= len(digits) <= 14:
        errors["phone"] = "Enter a valid mobile number"
    if gstin.strip() and (not is_india or not GSTIN_RE.match(gstin.strip().upper())):
        errors["gstin"] = "Enter a valid 15-character GSTIN (Indian businesses only), or leave it blank"
    return errors


def require_valid_billing(**fields: str) -> None:
    errors = billing_errors(**fields)
    if errors:
        raise HTTPException(422, "Please fix: " + "; ".join(errors.values()))
