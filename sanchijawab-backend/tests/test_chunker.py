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


def test_embeddings_are_768d_unit_vectors_and_query_failure_is_not_fatal(monkeypatch):
    from app.services import embeddings

    docs = embeddings.embed_documents(["alpha beta", "gamma delta"])
    assert len(docs) == 2 and len(docs[0]) == 768
    assert abs(sum(x * x for x in docs[0]) - 1.0) < 1e-6

    def boom(texts, task_type):
        raise RuntimeError("embedding service unavailable: test")

    monkeypatch.setattr(embeddings, "_embed_remote", boom)
    assert embeddings.embed_query("anything") is None  # the chat falls back to keyword search
    import pytest

    with pytest.raises(RuntimeError):
        embeddings.embed_documents(["x"])  # ingestion must fail loudly, not store unsearchable passages


def test_number_counters_are_rejoined():
    raw = "Startups/MSMEs 3 L+ Corporate Partners 60 + Institutional Funds 450 + DeepTech Startups 4,000 + Funding ₹250 + Cr"
    out = clean_markdown(raw)
    assert "3L+" in out and "60+" in out and "450+" in out and "4,000+" in out
    assert "page 12 of 40" == clean_markdown("page 12 of 40")  # ordinary numbers are left alone


def test_every_chunk_fits_the_embedding_window():
    long_text = ("The quick brown fox jumps over the lazy dog near the riverbank. " * 400) + PAGE
    chunks = chunk_text(long_text)
    assert len(chunks) > 3
    tok = _tokenizer()
    for c in chunks:
        assert len(tok.encode(c, add_special_tokens=False).ids) <= MAX_TOKENS + 8  # + a word finished at the boundary
    assert "Associate Director Tech" in " ".join(chunks)  # nothing is lost off the end


def test_sections_are_packed_by_heading_not_cut_through():
    filler = "Our programs combine mentorship and investor introductions for deeptech founders. " * 12  # ~170 tokens
    page = (
        "# Home\nWelcome to the platform.\n\n"
        f"## The Ecosystem we've Built\nStartups/MSMEs 3 L+ Corporate Partners 60 + DeepTech Startups 4,000 +\n\n"
        f"## Who We Work With\n{filler}\n\n"
        f"## Insights\n{filler}\n"
    )
    chunks = chunk_text(page)
    counters = [c for c in chunks if "Ecosystem we've Built" in c]
    assert len(counters) == 1
    # the counters stay together with their own heading and read the way the page shows them
    assert "Startups/MSMEs 3L+" in counters[0] and "4,000+" in counters[0]
    # two ~170-token sections do not get squeezed into one passage
    assert not any("Who We Work With" in c and "Insights" in c for c in chunks)


def test_long_section_windows_each_start_with_the_heading():
    body = "Fact about the program and its funding rounds. " * 300
    chunks = chunk_text(f"## Funding Rounds\n{body}")
    assert len(chunks) > 2
    assert all(c.startswith("## Funding Rounds") for c in chunks)
    tok = _tokenizer()
    assert all(len(tok.encode(c, add_special_tokens=False).ids) <= MAX_TOKENS + 8 for c in chunks)


def test_short_text_is_one_chunk_and_empty_is_none():
    assert chunk_text("Open Monday to Saturday, 9am to 6pm.") == ["Open Monday to Saturday, 9am to 6pm."]
    assert chunk_text("   ") == []
    assert chunk_text("![](https://x.test/a.png)") == []
