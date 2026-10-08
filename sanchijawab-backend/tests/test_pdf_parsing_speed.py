"""Long PDFs with a text layer are read directly (fast); short ones still use docling (keeps tables)."""
from __future__ import annotations

import pytest
from playwright.async_api import async_playwright

from app.services import parser

PARA = "SanchiConnect helps deeptech startups raise funding and meet enterprise customers. " * 8


async def _pdf(pages: int) -> bytes:
    body = "".join(
        f"<h2>Section {i}</h2><p>{PARA}</p><table border='1'><tr><td>Accelerator</td><td>6 months</td></tr></table>"
        "<div style='page-break-after:always'></div>"
        for i in range(pages)
    )
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content(f"<html><body>{body}</body></html>")
        data = await page.pdf(format="A4")
        await browser.close()
        return data


class _Docling:
    calls = 0

    def convert(self, stream):
        _Docling.calls += 1
        raise AssertionError("docling must not be used for this file")


async def test_long_pdf_is_read_from_its_text_layer_without_docling(monkeypatch):
    pdf = await _pdf(parser.FAST_PDF_ABOVE_PAGES + 5)
    monkeypatch.setattr(parser, "_get_converter", lambda: _Docling())
    text = parser.parse_to_markdown("big.pdf", pdf)
    assert "deeptech startups" in text and "Accelerator" in text
    assert f"Section {parser.FAST_PDF_ABOVE_PAGES + 4}" in text  # the last page made it too


async def test_short_pdf_still_goes_through_docling(monkeypatch):
    pdf = await _pdf(3)

    class Stub:
        def convert(self, stream):
            class R:
                class document:
                    @staticmethod
                    def export_to_markdown():
                        return "from docling"

            return R()

    monkeypatch.setattr(parser, "_get_converter", lambda: Stub())
    assert parser.parse_to_markdown("small.pdf", pdf) == "from docling"


def test_pdf_without_a_text_layer_falls_through_to_docling(monkeypatch):
    monkeypatch.setattr(parser, "_pdf_text_layer", lambda data: ("   ", parser.FAST_PDF_ABOVE_PAGES + 10))

    class Stub:
        def convert(self, stream):
            class R:
                class document:
                    @staticmethod
                    def export_to_markdown():
                        return "ocr text"

            return R()

    monkeypatch.setattr(parser, "_get_converter", lambda: Stub())
    assert parser.parse_to_markdown("scan.pdf", b"%PDF-1.4 not a real file") == "ocr text"
