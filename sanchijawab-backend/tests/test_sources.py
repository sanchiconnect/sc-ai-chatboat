from app.services.rag import pick_sources


def test_sources_are_deduped_and_capped_in_rank_order():
    chunks = [{"chunk_id": str(i), "url": f"https://x.com/{u}"} for i, u in enumerate("aabcdef")]
    out = pick_sources(chunks)
    assert [s["url"] for s in out] == ["https://x.com/a", "https://x.com/b", "https://x.com/c"]


def test_chunks_without_url_are_skipped():
    assert pick_sources([{"chunk_id": "1", "url": None}]) == []
