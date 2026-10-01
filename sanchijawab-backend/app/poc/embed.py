"""Local embeddings for the Phase 0 PoC — no API key required.

BAAI/bge-small-en-v1.5 produces 384-dim vectors, matching EMBED_DIM in .env.
Swap for Voyage/OpenAI in real ingestion (SAN-1057) if multilingual quality
needs it (BRD §9.1).
"""
from __future__ import annotations

from functools import lru_cache

from fastembed import TextEmbedding

MODEL_NAME = "BAAI/bge-small-en-v1.5"


@lru_cache(maxsize=1)
def _model() -> TextEmbedding:
    return TextEmbedding(model_name=MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    return [vec.tolist() for vec in _model().embed(texts)]


def embed_one(text: str) -> list[float]:
    return embed_texts([text])[0]
