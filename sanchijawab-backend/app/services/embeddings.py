"""Embedding generation — separate from where vectors are stored (a
pgvector column on the `chunks` table, see models.py/retrieval.py).

Same model as the Phase 0 PoC (app/poc/embed.py) so results are directly
comparable.
"""
from __future__ import annotations

from functools import lru_cache

from fastembed import TextEmbedding

MODEL_NAME = "BAAI/bge-small-en-v1.5"  # 384 dims — must match settings.embed_dim


@lru_cache(maxsize=1)
def _model() -> TextEmbedding:
    return TextEmbedding(model_name=MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    return [vec.tolist() for vec in _model().embed(texts)]


def embed_one(text: str) -> list[float]:
    return embed_texts([text])[0]
