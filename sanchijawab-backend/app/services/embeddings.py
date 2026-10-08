"""Embedding generation — separate from where vectors are stored (a pgvector column on the `chunks` table,
see models.py/retrieval.py).

Two models live here:

* **Gemini `gemini-embedding-001` (768 dimensions)** embeds the knowledge passages and the visitor's question
  (`embed_documents` / `embed_query`). Measured on SanchiConnect's real crawled site with 18 factual questions,
  the correct passage was in the top 8 for 17 of 18 questions, against 9 of 18 for the small local model
  (`bge-small`), which also did not improve with a bigger local model (`bge-base`, 9 of 18, and 8 times slower
  to run on a CPU). It understands many languages (Hindi, Hinglish) and reads long passages in full.
* **bge-small (local, 384 dimensions)** is still used for the product catalogue (`embed_texts` / `embed_one`,
  tuned thresholds) and as the word counter the chunker sizes passages with.
"""
from __future__ import annotations

import logging
import math
import time
from functools import lru_cache

from fastembed import TextEmbedding
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types

from ..config import settings

logger = logging.getLogger("sanchijawab.embeddings")

MODEL_NAME = "BAAI/bge-small-en-v1.5"  # local, 384 dims (products, token counting)
GEMINI_EMBED_MODEL = "gemini-embedding-001"
GEMINI_DIMENSIONS = 768  # must match the chunks.embedding_v2 column (settings.embed_dim_v2)
_BATCH = 50
_MAX_CHARS = 9000  # far above any passage the chunker makes (about 380 tokens)
_ATTEMPTS = 4


@lru_cache(maxsize=1)
def _model() -> TextEmbedding:
    return TextEmbedding(model_name=MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Local bge-small vectors (384-d). Used for products."""
    return [vec.tolist() for vec in _model().embed(texts)]


def embed_one(text: str) -> list[float]:
    return embed_texts([text])[0]


# ── Gemini ────────────────────────────────────────────────────────────────────────────────────────────


def _normalize(vec: list[float]) -> list[float]:
    # Gemini only returns unit-length vectors at its full size; smaller sizes must be normalised by us.
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _embed_remote(texts: list[str], task_type: str) -> list[list[float]]:
    client = genai.Client(api_key=settings.cloud_api_key)
    last: Exception | None = None
    for attempt in range(_ATTEMPTS):
        try:
            resp = client.models.embed_content(
                model=GEMINI_EMBED_MODEL,
                contents=[t[:_MAX_CHARS] for t in texts],
                config=genai_types.EmbedContentConfig(task_type=task_type, output_dimensionality=GEMINI_DIMENSIONS),
            )
            return [_normalize(list(e.values)) for e in resp.embeddings]
        except genai_errors.APIError as e:  # 429 (rate limit) and 5xx are worth another try; other 4xx are not
            last = e
            if e.code not in (429, 500, 502, 503, 504) or attempt + 1 == _ATTEMPTS:
                break
        except Exception as e:  # network hiccups
            last = e
            if attempt + 1 == _ATTEMPTS:
                break
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"embedding service unavailable: {last}")


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Vectors for passages that will be stored and searched later (768-d, unit length). Blocking: call it
    with asyncio.to_thread. Raises if the service stays unavailable, so a crawl fails loudly instead of
    storing passages that can never be found."""
    out: list[list[float]] = []
    for i in range(0, len(texts), _BATCH):
        out.extend(_embed_remote(texts[i:i + _BATCH], "RETRIEVAL_DOCUMENT"))
    return out


def embed_query(text: str) -> list[float] | None:
    """Vector for a visitor's question, or None if the service is unavailable (the caller then searches by
    keywords only rather than failing the chat)."""
    try:
        return _embed_remote([text], "RETRIEVAL_QUERY")[0]
    except Exception as e:  # noqa: BLE001
        logger.warning("query embedding unavailable, using keyword search only: %s", e)
        return None
