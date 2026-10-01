"""Encrypts payment gateway secrets at rest (Fernet, symmetric) — the one
thing explicitly flagged as unsafe in the reference implementation we based
the payments module on (plain varchar client secrets). Not a general-purpose
crypto module; scoped to this one use case.
"""
from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    if not settings.payment_secret_key:
        raise RuntimeError(
            "PAYMENT_SECRET_KEY is not set — required to store or read payment gateway "
            "credentials. Generate one with: python -c \"from cryptography.fernet import "
            "Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(settings.payment_secret_key.encode())


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        raise ValueError("Stored payment credential can't be decrypted — wrong/rotated PAYMENT_SECRET_KEY?") from e
