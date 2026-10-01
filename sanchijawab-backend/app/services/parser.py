"""File parsing (FR-K6) — PDF/DOCX/PPTX via docling, TXT/MD as plain text.

CSV/TSV/XLSX are handled separately by tabular.py (row-per-chunk, not
word-count windows — see its module docstring for why) — not through
parse_to_markdown below.
"""
from __future__ import annotations

import io

from docling.document_converter import DocumentConverter
from docling_core.types.io import DocumentStream

DOCLING_EXTENSIONS = {".pdf", ".docx", ".pptx"}
PLAIN_TEXT_EXTENSIONS = {".txt", ".md"}
TABULAR_EXTENSIONS = {".csv", ".tsv", ".xlsx"}

_converter: DocumentConverter | None = None


def _get_converter() -> DocumentConverter:
    global _converter
    if _converter is None:
        _converter = DocumentConverter()
    return _converter


def extension_of(filename: str) -> str:
    return "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def parse_to_markdown(filename: str, data: bytes) -> str:
    ext = extension_of(filename)

    if ext in PLAIN_TEXT_EXTENSIONS:
        return data.decode("utf-8", errors="replace")

    if ext in DOCLING_EXTENSIONS:
        # docling needs its own DocumentStream wrapper, not a raw BytesIO
        # (that fails pydantic validation — a real bug caught in testing,
        # not assumed) — this avoids round-tripping the upload to disk.
        stream = DocumentStream(name=filename, stream=io.BytesIO(data))
        result = _get_converter().convert(stream)
        return result.document.export_to_markdown()

    if ext in TABULAR_EXTENSIONS:
        raise ValueError(f"{ext} files go through tabular.parse_tabular_to_chunks(), not parse_to_markdown()")

    raise ValueError(f"Unrecognized file type: {filename!r}")
