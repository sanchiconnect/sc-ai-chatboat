"use client";

import { useState } from "react";
import { Sparkles, FileText, Send } from "lucide-react";
import { LogoMark } from "@/components/marketing/logo";

type Turn = { role: "visitor" | "bot"; text: string; sources?: string[] };

const SCRIPT: { prompt: string; turns: Turn[] }[] = [
  {
    prompt: "What's your return policy?",
    turns: [
      { role: "visitor", text: "What's your return policy?" },
      {
        role: "bot",
        text: "You can return any unopened item within 30 days for a full refund, or an open one within 14 days for store credit. Returns ship free using the label in your order confirmation email.",
        sources: ["Returns & Refunds", "Shipping Policy"],
      },
    ],
  },
  {
    prompt: "Do you ship internationally?",
    turns: [
      { role: "visitor", text: "Do you ship internationally?" },
      {
        role: "bot",
        text: "Yes — we ship to 40+ countries. International orders typically arrive in 7-12 business days, and duties/taxes are calculated at checkout so there's nothing to pay on delivery.",
        sources: ["Shipping Policy"],
      },
    ],
  },
  {
    prompt: "Can I talk to a human?",
    turns: [
      { role: "visitor", text: "Can I talk to a human?" },
      {
        role: "bot",
        text: "Of course — connecting you with our team now. In a real deployment this would open a live handoff into the business's own inbox, exactly like the demo bot in your dashboard once you sign up.",
      },
    ],
  },
];

export function DemoWidget() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex !== null ? SCRIPT[activeIndex] : null;

  return (
    <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-xl2 border border-border bg-surface shadow-card">
      <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-5 py-4">
        <LogoMark className="h-7 w-7" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-fg">Ask Northwind Goods</p>
          <p className="flex items-center gap-1.5 text-[12px] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Sample conversation — not a live call
          </p>
        </div>
      </div>

      <div className="flex min-h-[240px] flex-col gap-4 px-5 py-6">
        {!active && (
          <p className="text-[13px] leading-relaxed text-fg-muted">
            Pick a question below to see how SanchiJawab answers from a sample site&apos;s real policy pages, with
            citations attached.
          </p>
        )}
        {active?.turns.map((t, i) =>
          t.role === "visitor" ? (
            <div key={i} className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-[13.5px] text-white">
              {t.text}
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-2.5">
              <div className="flex max-w-[92%] items-start gap-2.5">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                  <Sparkles className="h-3.5 w-3.5 text-accent-ink" />
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] leading-relaxed text-fg">
                  {t.text}
                </div>
              </div>
              {t.sources && (
                <div className="ml-[34px] flex flex-wrap gap-1.5">
                  {t.sources.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-fg-muted"
                    >
                      <FileText className="h-3 w-3" />
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {SCRIPT.map((s, i) => (
            <button
              key={s.prompt}
              onClick={() => setActiveIndex(i)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                activeIndex === i
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-border text-fg-muted hover:bg-surface-2"
              }`}
            >
              {s.prompt}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2 text-[13px] text-fg-faint">
            Click a question above to try it
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <Send className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
