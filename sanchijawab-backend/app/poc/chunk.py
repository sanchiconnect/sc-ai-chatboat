"""Word-count chunker for the Phase 0 PoC.

Real ingestion (SAN-1057) will use a heading-aware splitter that keeps page
title and heading path with each chunk (BRD §9.2). This is deliberately
simpler — it just proves the crawl-to-answer pipeline end to end.
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
