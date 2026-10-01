"""Real browser test of the built widget.js — not just "it compiles".
Loads the test host page, clicks the launcher (inside Shadow DOM,
Playwright pierces open shadow roots automatically), sends a real
question, and confirms a real streamed answer with a source link shows up.
"""
import asyncio
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        page.on("console", lambda msg: print(f"[console.{msg.type}] {msg.text}"))
        page.on("pageerror", lambda exc: print(f"[pageerror] {exc}"))
        page.on("requestfailed", lambda req: print(f"[requestfailed] {req.url} — {req.failure}"))
        await page.goto("http://localhost:5500/test.html")

        launcher = page.locator(".sj-launcher")
        await launcher.wait_for(timeout=5000)
        print("[OK] launcher button rendered")

        await launcher.click()
        panel = page.locator(".sj-panel")
        await panel.wait_for(timeout=2000)
        print("[OK] chat panel opened")

        welcome = await page.locator(".sj-bubble-bot").first.inner_text()
        print(f"[OK] welcome message: {welcome!r}")

        await page.locator(".sj-input").fill("What does SanchiConnect do?")
        await page.locator(".sj-send").click()
        print("[..] message sent, waiting for streamed answer ...")

        # Wait for a bot bubble with real content (not just "…") and a source link.
        await page.wait_for_function(
            """() => {
                const host = document.querySelector('#sanchijawab-widget-host');
                const root = host.shadowRoot;
                const bubbles = root.querySelectorAll('.sj-bubble-bot');
                const last = bubbles[bubbles.length - 1];
                return last && last.textContent.length > 20 && root.querySelector('.sj-sources a');
            }""",
            timeout=20000,
        )

        answer = await page.locator(".sj-bubble-bot").last.inner_text()
        source_href = await page.locator(".sj-sources a").first.get_attribute("href")
        print(f"[OK] streamed answer received ({len(answer)} chars):")
        print(f"     {answer[:200]}")
        print(f"[OK] source link resolved to: {source_href}")

        await page.screenshot(path="widget_test_screenshot.png")
        print("[OK] screenshot saved to widget_test_screenshot.png")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
