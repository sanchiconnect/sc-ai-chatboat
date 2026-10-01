import { Sparkles, FileText } from "lucide-react";
import { LogoMark } from "@/components/marketing/logo";

const sources = [
  { title: "Shipping & Returns", path: "/help/shipping" },
  { title: "Order Tracking", path: "/help/tracking" },
];

/**
 * A built, static mock of the SanchiJawab widget UI — not a screenshot —
 * so it always matches the live design tokens and both themes exactly.
 */
export function ChatPreview() {
  return (
    <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-xl2 border border-border bg-surface shadow-card">
      <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-5 py-4">
        <LogoMark className="h-7 w-7" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-fg">Ask Northwind</p>
          <p className="flex items-center gap-1.5 text-[12px] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Answers from northwindgoods.com
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-6">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-[13.5px] text-white">
          Where is my order #10482, and can I still change the size?
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex max-w-[88%] items-start gap-2.5">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft">
              <Sparkles className="h-3.5 w-3.5 text-accent-ink" />
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] leading-relaxed text-fg">
              Order #10482 shipped yesterday and is on track to arrive <strong>Thu, Oct 3</strong>. Size changes
              aren&apos;t possible once an order ships — but you can start a free exchange from your order page.
            </div>
          </div>

          <div className="ml-[34px] flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <span
                key={s.path}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-fg-muted"
              >
                <FileText className="h-3 w-3" />
                {s.title}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft">
            <Sparkles className="h-3.5 w-3.5 text-accent-ink" />
          </div>
          <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-surface-2 px-4 py-3">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-blink rounded-full bg-fg-faint"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <div className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2 text-[13px] text-fg-faint">
          Ask about pricing, sizing, returns…
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
