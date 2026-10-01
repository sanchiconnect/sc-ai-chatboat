"""Word-count chunker — same algorithm as Phase 0's app/poc/chunk.py,
unchanged, just placed where the real app can import it too.
"""
from __future__ import annotations


def chunk_text(text: str, target_words: int = 250, overlap_words: int = 30) -> list[str]:
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(start + target_words, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start = end - overlap_words
    return chunks
