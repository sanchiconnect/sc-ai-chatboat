"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

// The widget isn't served from the API origin yet (that's a Phase 1
// packaging/deploy step, not built) — this points at where it runs in
// local dev (see sanchijawab-widget's own dev server / test setup).
const WIDGET_SRC = process.env.NEXT_PUBLIC_WIDGET_URL || "http://localhost:5500/widget.js";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function InstallPage() {
  const { botId } = useParams<{ botId: string }>();
  const [copied, setCopied] = useState(false);

  const snippet = `<script src="${WIDGET_SRC}" data-bot="${botId}" data-api="${API_URL}" async></script>`;

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold mb-4">Put the bot on your website</h2>
      <p className="text-sm text-fg-muted mb-4">
        Paste this just before the closing <code>&lt;/body&gt;</code> tag on every page.
      </p>

      <pre className="bg-gray-900 text-gray-100 text-sm rounded-lg p-4 overflow-x-auto">{snippet}</pre>

      <button
        onClick={() => {
          navigator.clipboard.writeText(snippet);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-3 bg-accent text-white rounded-lg px-4 py-2 font-medium"
      >
        {copied ? "Copied!" : "Copy code"}
      </button>
    </div>
  );
}
