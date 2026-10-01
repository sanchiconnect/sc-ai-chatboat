import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's shipped in SanchiJawab, most recent first.",
};

const entries = [
  {
    date: "2026-10-01",
    tag: "New",
    title: "Self-serve billing and checkout",
    body: "Subscribe to a plan directly from the dashboard and pay via Razorpay or Stripe — invoices generate automatically with GST handled correctly for intra- and inter-state orders.",
  },
  {
    date: "2026-10-01",
    tag: "New",
    title: "Platform staff console",
    body: "A separate, platform-operator view for support and billing visibility across every workspace — independent from any customer's own dashboard.",
  },
  {
    date: "2026-09-28",
    tag: "Improved",
    title: "Full team management",
    body: "Change a teammate's role, remove someone who's left, or resend a stuck invite — directly from the Team page.",
  },
  {
    date: "2026-09-28",
    tag: "Improved",
    title: "Bots and knowledge sources are now deletable",
    body: "Remove a test bot or a crawled source you no longer want the assistant drawing from, with everything cleaned up behind it.",
  },
  {
    date: "2026-09-20",
    tag: "Fixed",
    title: "Breadth-first site crawling",
    body: "The crawler now walks an entire site, not just the first level of links from the homepage — most sites index dramatically more completely as a result.",
  },
  {
    date: "2026-09-10",
    tag: "New",
    title: "Human handoff in the inbox",
    body: "Conversations the bot can't resolve, or that a visitor explicitly asks about, route into a real inbox your team can reply from.",
  },
  {
    date: "2026-08-15",
    tag: "New",
    title: "Widget customization",
    body: "Pick an avatar, brand color, header text, and welcome message — matched exactly between the dashboard preview and the live widget.",
  },
  {
    date: "2026-08-01",
    tag: "New",
    title: "SanchiJawab launches",
    body: "Crawl a site, chunk and embed it, and answer visitor questions with citations — the core product, live.",
  },
];

const TAG_STYLE: Record<string, "accent" | "success" | "warning"> = {
  New: "accent",
  Improved: "success",
  Fixed: "warning",
};

export default function ChangelogPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 text-center md:py-20">
          <div className="container">
            <h1 className="font-display mx-auto max-w-[20ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[46px]">
              Changelog
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] text-fg-muted">What&apos;s shipped, most recent first.</p>
          </div>
        </section>

        <section className="py-16">
          <div className="container max-w-2xl">
            <div className="flex flex-col divide-y divide-border">
              {entries.map((e) => (
                <div key={e.title} className="flex gap-5 py-6 first:pt-0">
                  <div className="w-24 shrink-0 pt-0.5 text-[12.5px] text-fg-faint">
                    {new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </div>
                  <div>
                    <Badge variant={TAG_STYLE[e.tag]} className="mb-2">{e.tag}</Badge>
                    <h2 className="text-[16px] font-semibold text-fg">{e.title}</h2>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{e.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
