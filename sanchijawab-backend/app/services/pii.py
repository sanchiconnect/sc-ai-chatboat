"""PII masking (SAN-1095, FR-C7) — a regex-based backstop on *stored* bot
replies. ANSWER_SYSTEM already instructs the model not to repeat a visitor's
contact details back verbatim (the real first line of defense — it's what
actually protects the live streamed response, since masking can't un-send
characters already streamed to the browser); this is defense in depth for
the permanent transcript (staff Inbox, analytics exports, Langfuse traces)
in case the model doesn't fully comply.

Only applied to the bot's own messages, not the visitor's — a visitor's own
contact details in their own message are the whole point of lead capture,
not something to redact.
"""
from __future__ import annotations

import re

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# Phone: a run of 7-15 digits allowing separators (spaces, dashes, dots,
# parens) between them — permissive on purpose, since under-masking a real
# number is worse here than over-masking a long order/reference number.
_PHONE_RE = re.compile(r"(?<!\d)(\+?\d[\d\-.\s()]{6,}\d)(?!\d)")
# Credit/debit card: 13-19 digits, optionally grouped in 4s with spaces/dashes.
# Separators are sandwiched between \d(?:[ -]?\d)* rather than trailing each
# digit, so a trailing space/dash right after the last digit (e.g. "...1111
# for the deposit") is never swallowed into the match.
_CARD_RE = re.compile(r"(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)")


def _mask_email(m: re.Match) -> str:
    local, _, domain = m.group(0).partition("@")
    return f"{local[:1]}***@{domain}"


def _mask_digits(m: re.Match) -> str:
    digits = re.sub(r"\D", "", m.group(0))
    if len(digits) < 4:
        return m.group(0)
    return "*" * (len(digits) - 4) + digits[-4:]


def mask_pii(text: str) -> str:
    """Replace emails/phone numbers/card numbers with masked forms, keeping
    just enough (first letter of an email's local part, last 4 digits of a
    number) to be recognizable without being usable or storable in the
    clear."""
    if not text:
        return text
    text = _CARD_RE.sub(_mask_digits, text)
    text = _PHONE_RE.sub(_mask_digits, text)
    text = _EMAIL_RE.sub(_mask_email, text)
    return text
