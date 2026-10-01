"""GST invoice generation: tax split, HTML template, PDF rendering.

The reference implementation this was modeled on had a CGST+SGST-vs-IGST
branch in its template, but nothing anywhere in that codebase ever actually
set `is_intra_state` — no supplier-state-vs-customer-state comparison
existed, so the branch was dead code that always fell through to IGST. This
version does the real comparison (compute_gst_split) and persists the
result on the order at confirm-time, not left to the client.
"""
from __future__ import annotations

from playwright.async_api import async_playwright

GST_RATE_PERCENT = 18.0  # standard GST rate for SaaS/services in India


def compute_gst_split(amount: float, supplier_state: str, customer_state: str) -> dict:
    is_intra_state = bool(
        supplier_state.strip() and customer_state.strip()
        and supplier_state.strip().lower() == customer_state.strip().lower()
    )
    if is_intra_state:
        half = round(GST_RATE_PERCENT / 2, 2)
        cgst = round(amount * half / 100, 2)
        sgst = round(amount * half / 100, 2)
        lines = [
            {"name": "CGST", "percent": half, "amount": cgst},
            {"name": "SGST", "percent": half, "amount": sgst},
        ]
        total_tax = round(cgst + sgst, 2)
    else:
        igst = round(amount * GST_RATE_PERCENT / 100, 2)
        lines = [{"name": "IGST", "percent": GST_RATE_PERCENT, "amount": igst}]
        total_tax = igst

    return {
        "is_intra_state": is_intra_state,
        "tax_percent": GST_RATE_PERCENT,
        "lines": lines,
        "total_tax": total_tax,
        "grand_total": round(amount + total_tax, 2),
    }


def _tax_rows_html(tax_json: dict) -> str:
    rows = "".join(
        f'<tr><td>{line["name"]} ({line["percent"]}%)</td>'
        f'<td style="text-align:right">{line["amount"]:.2f}</td></tr>'
        for line in tax_json.get("lines", [])
    )
    return rows


def generate_invoice_html(
    *, order, billing_profile, plan_name: str, is_proforma: bool = False,
) -> str:
    tax = order.tax_json or {}
    header_color = "#D3453C" if is_proforma else "#1C1A2E"
    title = "PROFORMA INVOICE" if is_proforma else "TAX INVOICE"
    disclaimer = (
        '<p style="color:#D3453C;font-size:12px;margin-top:4px">'
        "This is a proforma invoice — not a demand for payment and not a tax invoice."
        "</p>"
        if is_proforma
        else ""
    )
    invoice_date = (order.paid_at or order.created_at).strftime("%d %b %Y")

    return f"""
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: Arial, Helvetica, sans-serif; color: #1C1A2E; font-size: 13px; padding: 32px; }}
  h1 {{ color: {header_color}; font-size: 20px; letter-spacing: 1px; margin: 0 0 4px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
  td, th {{ padding: 6px 4px; border-bottom: 1px solid #e3e1ef; }}
  .right {{ text-align: right; }}
  .muted {{ color: #6b6880; }}
  .totals td {{ border-bottom: none; padding-top: 8px; }}
  .grand {{ font-weight: bold; font-size: 15px; border-top: 2px solid #1C1A2E; }}
</style>
</head>
<body>
  <h1>{title}</h1>
  {disclaimer}
  <table style="margin-top:16px">
    <tr>
      <td style="border:none;width:50%">
        <strong>{billing_profile.supplier_name}</strong><br>
        {billing_profile.supplier_address}<br>
        {billing_profile.supplier_city}, {billing_profile.supplier_state} {billing_profile.supplier_pincode}<br>
        {billing_profile.supplier_country}<br>
        GSTIN: {billing_profile.supplier_gstin or '—'}<br>
        {billing_profile.supplier_email}
      </td>
      <td style="border:none;width:50%" class="right">
        Invoice #: <strong>{order.invoice_number}</strong><br>
        Date: {invoice_date}<br>
        {'' if is_proforma else f'Transaction ID: {order.gateway_transaction_id}<br>'}
        <br>
        <span class="muted">Billed to</span><br>
        <strong>{order.customer_name}</strong><br>
        {order.customer_address}<br>
        {order.customer_city}, {order.customer_state} {order.customer_pincode}<br>
        {order.customer_country}<br>
        GSTIN: {order.customer_gstin or '—'}
      </td>
    </tr>
  </table>

  <table>
    <tr><th class="muted" style="text-align:left">Description</th><th class="muted right">Amount</th></tr>
    <tr><td>{plan_name}</td><td class="right">{order.amount:.2f}</td></tr>
    {_tax_rows_html(tax)}
    <tr class="totals grand">
      <td>Total ({order.currency})</td>
      <td class="right">{tax.get('grand_total', order.amount):.2f}</td>
    </tr>
  </table>
</body>
</html>
"""


async def render_invoice_pdf(html: str) -> bytes:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content(html, wait_until="load")
        pdf_bytes = await page.pdf(format="A4")
        await browser.close()
        return pdf_bytes
