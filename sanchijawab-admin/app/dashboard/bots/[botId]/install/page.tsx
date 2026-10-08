"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

// The widget isn't served from the API origin yet (that's a Phase 1
// packaging/deploy step, not built) — this points at where it runs in
// local dev (see sanchijawab-widget's own dev server / test setup).
const WIDGET_SRC = process.env.NEXT_PUBLIC_WIDGET_URL || "http://localhost:5500/widget.js";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PLATFORMS: { name: string; steps: string[]; note?: string }[] = [
  {
    name: "WordPress",
    steps: [
      "Easiest: ask your developer for the SanchiJawab Chat plugin (a zip file), then Plugins > Add New > Upload Plugin and activate it.",
      "Open Settings > SanchiJawab Chat and paste your Bot ID plus the two addresses shown at the top of this page.",
      "No plugin? Paste the code above into your theme's footer, or use a header/footer plugin.",
    ],
  },
  {
    name: "Shopify",
    steps: [
      "Online Store > Themes > the three dots > Edit code.",
      "Open layout/theme.liquid and paste the code just before </body>.",
      "Save, then open your store to see the chat bubble.",
    ],
  },
  {
    name: "Webflow",
    steps: [
      "Project settings > Custom code.",
      "Paste the code into Footer code and save.",
      "Publish the site (custom code only runs on the published site).",
    ],
    note: "Custom code needs a paid Webflow site plan.",
  },
  {
    name: "Google Tag Manager",
    steps: [
      "Tags > New > Tag configuration > Custom HTML.",
      "Paste the code above, then set the trigger to All Pages.",
      "Save, then Submit and Publish the container.",
    ],
  },
  {
    name: "Wix",
    steps: [
      "Settings > Custom code > Add custom code.",
      "Paste the code, choose Body - end, and apply it to All pages.",
    ],
    note: "Needs a Wix Premium plan.",
  },
  {
    name: "Squarespace",
    steps: ["Settings > Advanced > Code injection.", "Paste the code into the Footer box and save."],
    note: "Needs a Business plan or higher.",
  },
  {
    name: "React, Next.js and other single-page apps",
    steps: [
      "Paste the code into your main HTML file (index.html) or root layout, before </body>.",
      "The chat stays open as visitors move between pages. Call SanchiJawab.open() from a button if you want one.",
    ],
  },
];

type CheckResult = { installed: boolean; last_seen_at: string | null; last_seen_host: string | null };

export default function InstallPage() {
  const { botId } = useParams<{ botId: string }>();
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Self-contained loader in the style of other chat products' snippets: it
  // sets the bot id, queues SanchiJawab.open()/close()/identify() calls made
  // before the widget has loaded, then injects widget.js asynchronously.
  const snippet = `<!-- Start of SanchiJawab code -->
<script>
  window.__sj = window.__sj || {};
  window.__sj.botId = "${botId}";
  window.__sj.api = "${API_URL}";
  (function (w, d) {
    var q = [];
    function stub(m) { return function () { q.push([m, [].slice.call(arguments)]); }; }
    w.SanchiJawab = w.SanchiJawab || { _q: q, open: stub("open"), close: stub("close"), identify: stub("identify") };
    var s = d.createElement("script");
    s.async = true;
    s.src = "${WIDGET_SRC}";
    s.setAttribute("data-bot", w.__sj.botId);
    s.setAttribute("data-api", w.__sj.api);
    d.head.appendChild(s);
  })(window, document);
</script>
<noscript>Chat with us, powered by SanchiJawab</noscript>
<!-- End of SanchiJawab code -->`;
  const simpleSnippet = `<script src="${WIDGET_SRC}" data-bot="${botId}" data-api="${API_URL}" async></script>`;

  async function checkInstall() {
    setChecking(true);
    setCheckError(null);
    try {
      setResult(await api.installCheck(botId));
    } catch (err) {
      setCheckError(err instanceof ApiError ? err.message : "Couldn't check installation status");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl font-semibold mb-1.5">Put the bot on your website</h2>
      <p className="text-sm text-fg-muted mb-5">
        Paste this just before the closing <code>&lt;/body&gt;</code> tag on every page.
      </p>

      <pre
        tabIndex={0}
        role="region"
        aria-label="Install snippet"
        className="bg-[#14122a] text-gray-100 text-sm rounded-xl2 border border-border shadow-card p-5 overflow-x-auto"
      >
        {snippet}
      </pre>

      <button
        onClick={() => {
          navigator.clipboard.writeText(snippet);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-3 bg-accent text-white rounded-btn px-4 py-2 font-semibold shadow-card hover:brightness-90 active:scale-[0.98] transition-all"
      >
        {copied ? "Copied!" : "Copy code"}
      </button>

      <details className="mt-4 text-sm text-fg-muted">
        <summary className="cursor-pointer font-medium">Prefer a one-line tag?</summary>
        <p className="mt-2">Does the same job; paste it just before <code>&lt;/body&gt;</code>.</p>
        <pre
          tabIndex={0}
          role="region"
          aria-label="One-line install snippet"
          className="mt-2 bg-[#14122a] text-gray-100 text-sm rounded-xl2 border border-border p-4 overflow-x-auto"
        >
          {simpleSnippet}
        </pre>
      </details>

      <div className="mt-8 bg-surface border border-border rounded-2xl shadow-card p-5">
        <h3 className="font-display text-lg font-semibold text-fg mb-1">Install on your platform</h3>
        <p className="text-[13px] text-fg-muted mb-3">
          The code above goes on every page. Here is where to put it on common website builders.
        </p>
        <div className="divide-y divide-border text-[13px]">
          {PLATFORMS.map((p) => (
            <details key={p.name} className="py-2">
              <summary className="cursor-pointer font-medium">{p.name}</summary>
              <ol className="list-decimal ml-5 mt-2 space-y-1 text-fg-muted">
                {p.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {p.note && <p className="mt-2 text-[12px] text-fg-faint">{p.note}</p>}
            </details>
          ))}
        </div>
      </div>

      <div className="mt-8 bg-surface border border-border rounded-2xl shadow-card p-5">
        <h3 className="font-display text-lg font-semibold text-fg mb-1">Is it actually live?</h3>
        <p className="text-[13px] text-fg-muted mb-3">
          We can&apos;t reach into your site to check — this looks for real evidence the script tag has
          loaded: the widget calling home for its config.
        </p>

        <button
          onClick={checkInstall}
          disabled={checking}
          className="bg-accent text-white rounded-btn px-4 py-2 text-[13px] font-semibold shadow-card hover:brightness-90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check installation"}
        </button>

        {checkError && <p className="mt-3 text-[13px] text-danger">{checkError}</p>}

        {result && (
          <div
            className={`mt-4 rounded-lg p-3 text-[13px] ${
              result.installed ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
            }`}
          >
            {result.installed ? (
              <>
                ✓ Seen on <strong>{result.last_seen_host ?? "your site"}</strong>, last confirmed{" "}
                {new Date(result.last_seen_at!).toLocaleString()}.
              </>
            ) : (
              <>Not seen yet — paste the snippet above, visit your site, then check again.</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
