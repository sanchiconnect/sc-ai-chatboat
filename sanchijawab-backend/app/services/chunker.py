"""Turns page/file text into the pieces that get embedded and searched.

Two things matter here, and both were wrong before:

1. **Clean the text first.** Crawled pages are markdown full of image tags and long link URLs. In real
   crawls 66-90% of the characters were URLs, which are useless for search and bury the real sentences.
2. **Cut by tokens, not words.** The embedding model (bge-small) only reads the first 512 tokens of
   whatever it is given and silently ignores the rest. The old 250-word chunks measured a median of
   ~1,900 tokens once URLs were counted, so about two thirds of every chunk never reached the vector.
   Chunks are now sized in the model's own tokens and stay well inside that limit.
"""
from __future__ import annotations

import re
from functools import lru_cache

# Comfortably inside the model's 512-token window (leaves room for its special tokens).
MAX_TOKENS = 380
OVERLAP_TOKENS = 40

_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]*)\)")
_AUTOLINK_RE = re.compile(r"<(?:https?://|www\.)[^>\s]*>")
_BARE_URL_RE = re.compile(r"(?:https?://|www\.)[^\s)>\]]+")
_BLANKS_RE = re.compile(r"[ \t\f\v]+")


def _link_to_text(match: re.Match[str]) -> str:
    label, target = match.group(1).strip(), match.group(2).strip()
    if target.lower().startswith(("mailto:", "tel:")):
        contact = target.split(":", 1)[1].split("?")[0]
        return f"{label} ({contact})" if label and label != contact else contact
    return label  # an ordinary link: keep the words people read, drop the address


def clean_markdown(text: str) -> str:
    """Removes image tags, link addresses and bare URLs, keeping the readable words (and any email or
    phone number). The page's own URL is stored separately on the document, so nothing is lost."""
    text = _IMAGE_RE.sub(" ", text)
    text = _LINK_RE.sub(_link_to_text, text)
    text = _AUTOLINK_RE.sub(" ", text)
    text = _BARE_URL_RE.sub(" ", text)
    text = _BLANKS_RE.sub(" ", text)
    text = re.sub(r"\n[ ]+", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


@lru_cache(maxsize=1)
def _tokenizer():
    """A private copy of the embedding model's tokenizer that does NOT truncate. (The model's own
    instance truncates at 512 and must stay that way, so it is copied, not modified.)"""
    from tokenizers import Tokenizer

    from .embeddings import _model

    tok = Tokenizer.from_str(_model().model.tokenizer.to_str())
    tok.no_truncation()
    tok.no_padding()
    return tok


def chunk_text(text: str, max_tokens: int = MAX_TOKENS, overlap_tokens: int = OVERLAP_TOKENS) -> list[str]:
    """Cleans `text` and splits it into overlapping pieces of at most `max_tokens` tokens, cut at word
    boundaries. Returns [] for empty text."""
    text = clean_markdown(text)
    if not text:
        return []
    encoding = _tokenizer().encode(text, add_special_tokens=False)
    offsets = encoding.offsets
    n = len(offsets)
    if n == 0:
        return []
    if n <= max_tokens:
        return [" ".join(text.split())]

    chunks: list[str] = []
    start = 0
    while start < n:
        end = min(start + max_tokens, n)
        a = offsets[start][0]
        b = offsets[end - 1][1]
        # Never end in the middle of a word: extend to the next space (a word piece, not a page).
        while b < len(text) and not text[b].isspace() and b - offsets[end - 1][1] < 30:
            b += 1
        piece = " ".join(text[a:b].split())
        if piece:
            chunks.append(piece)
        if end == n:
            break
        start = end - overlap_tokens
    return chunks
