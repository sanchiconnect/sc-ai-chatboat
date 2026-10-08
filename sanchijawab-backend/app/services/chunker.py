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
# Number counters are built from separate pieces ("3" "L+", "60" "+"), which read as "3 L+" / "60 +": rejoin
# them so "3L+ startups" and "60+ partners" read the way the page shows them.
_NUMBER_SUFFIX_RE = re.compile(r"(?<![\w,.])(\d[\d,]*(?:\.\d+)?)\s+((?:L|K|M|B|Cr|Lakh|Million|Billion)?\s*\+)")


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
    text = _NUMBER_SUFFIX_RE.sub(lambda m: m.group(1) + m.group(2).replace(" ", ""), text)
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


# Sections are packed together up to this size. Small, focused passages match a question better than one
# long passage that mixes five topics (a "how many startups" counter buried in a whole home page never
# ranked), while still being big enough to hold a complete thought.
MERGE_TOKENS = 240

_SECTION_SPLIT_RE = re.compile(r"(?m)^(?=#{1,4}\s)")


def _count(text: str) -> int:
    return len(_tokenizer().encode(text, add_special_tokens=False).ids)


def _token_windows(text: str, size: int, overlap: int) -> list[str]:
    """Overlapping windows of at most `size` tokens, cut at word boundaries."""
    offsets = _tokenizer().encode(text, add_special_tokens=False).offsets
    n = len(offsets)
    if n == 0:
        return []
    if n <= size:
        return [" ".join(text.split())]
    windows: list[str] = []
    start = 0
    while start < n:
        end = min(start + size, n)
        a = offsets[start][0]
        b = offsets[end - 1][1]
        # Never end in the middle of a word: extend to the next space (a word piece, not a page).
        while b < len(text) and not text[b].isspace() and b - offsets[end - 1][1] < 30:
            b += 1
        piece = " ".join(text[a:b].split())
        if piece:
            windows.append(piece)
        if end == n:
            break
        start = max(end - overlap, start + 1)
    return windows


def chunk_text(
    text: str, max_tokens: int = MAX_TOKENS, overlap_tokens: int = OVERLAP_TOKENS, merge_tokens: int = MERGE_TOKENS,
) -> list[str]:
    """Cleans `text`, splits it at its headings, and packs neighbouring sections into passages of up to
    `merge_tokens` tokens. A section longer than `max_tokens` is cut into overlapping windows, each one
    starting with the section's heading so it is still clear what it is about. Returns [] for empty text."""
    text = clean_markdown(text)
    if not text:
        return []
    sections = [s.strip() for s in _SECTION_SPLIT_RE.split(text) if s.strip()]

    chunks: list[str] = []
    group: list[str] = []
    group_tokens = 0

    def flush() -> None:
        nonlocal group, group_tokens
        if group:
            chunks.append(" ".join(" ".join(group).split()))
        group, group_tokens = [], 0

    for section in sections:
        tokens = _count(section)
        if tokens > max_tokens:
            flush()
            first_line, _, rest = section.partition("\n")
            has_heading = first_line.lstrip().startswith("#") and bool(rest.strip())
            heading = " ".join(first_line.split()) if has_heading else ""
            body = rest if has_heading else section
            room = max_tokens - (_count(heading) + 2 if heading else 0)
            for i, window in enumerate(_token_windows(body, max(room, 80), overlap_tokens)):
                chunks.append(f"{heading} {window}".strip() if heading else window)
            continue
        if group and group_tokens + tokens > merge_tokens:
            flush()
        group.append(section)
        group_tokens += tokens
    flush()
    return chunks
