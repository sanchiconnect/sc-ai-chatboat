"""Chunks must be clean text and short enough that the embedding model actually reads all of them."""
from __future__ import annotations

from app.services.chunker import MAX_TOKENS, _tokenizer, chunk_text, clean_markdown

PAGE = (
    "![](https://example.com/wp-content/uploads/2026/05/Rahul-Bhasin.png) "
    "[Nirmal Singh](https://example.com/leadership-team/<https:/www.linkedin.com/in/nirmal-singh-64b0/>) "
    "Associate Director Tech. Email [Support](mailto:help@example.com) or visit https://example.com/contact now."
)


def test_clean_markdown_keeps_words_and_contacts_drops_urls():
    out = clean_markdown(PAGE)
    assert "Nirmal Singh Associate Director Tech." in out
    assert "help@example.com" in out
    assert "http" not in out and "![" not in out and "png" not in out


def test_every_chunk_fits_the_embedding_window():
    long_text = ("The quick brown fox jumps over the lazy dog near the riverbank. " * 400) + PAGE
    chunks = chunk_text(long_text)
    assert len(chunks) > 3
    tok = _tokenizer()
    for c in chunks:
        assert len(tok.encode(c, add_special_tokens=False).ids) <= MAX_TOKENS + 8  # + a word finished at the boundary
    assert "Associate Director Tech" in " ".join(chunks)  # nothing is lost off the end


def test_short_text_is_one_chunk_and_empty_is_none():
    assert chunk_text("Open Monday to Saturday, 9am to 6pm.") == ["Open Monday to Saturday, 9am to 6pm."]
    assert chunk_text("   ") == []
    assert chunk_text("![](https://x.test/a.png)") == []
