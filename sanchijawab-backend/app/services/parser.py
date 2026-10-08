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


# Docling reads layout and tables well but costs about 1.2 s per PDF page on a normal CPU (a 200-page
# report took over four minutes). Longer PDFs that have a real text layer are read straight from it
# instead (about 0.001 s per page): tables come out as plain lines rather than markdown tables, which is
# a fair price for minutes saved. Scanned PDFs (no text layer) still go through docling's OCR.
FAST_PDF_ABOVE_PAGES = 30
MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER = 40


def _pdf_text_layer(data: bytes) -> tuple[str, int] | None:
    """(text, page_count) read straight from the PDF's text layer, or None if that can't be done."""
    try:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(data)
        pages = len(pdf)
        parts = []
        for i in range(pages):
            page = pdf[i]
            parts.append(page.get_textpage().get_text_bounded().replace("\r\n", "\n"))
            page.close()
        pdf.close()
        return "\n\n".join(parts), pages
    except Exception:
        return None


def parse_to_markdown(filename: str, data: bytes) -> str:
    ext = extension_of(filename)

    if ext in PLAIN_TEXT_EXTENSIONS:
        return data.decode("utf-8", errors="replace")

    if ext == ".pdf":
        layer = _pdf_text_layer(data)
        if layer is not None:
            text, pages = layer
            if pages > FAST_PDF_ABOVE_PAGES and len(text.strip()) >= pages * MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER:
                return text

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
