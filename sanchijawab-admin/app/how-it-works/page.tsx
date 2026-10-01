import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Globe, Scissors, BrainCircuit, Code2, MessageSquare, BarChart3 } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works",
  description: "From a URL to a live, cited chat widget — the real steps, not a sales pitch.",
};

const steps = [
  {
    icon: Globe,
    title: "Point it at your domain",
    body: "Give us a URL. Our crawler walks every reachable page breadth-first — not just one level of links deep — respecting robots.txt and your sitemap. Most sites under 2,000 pages finish indexing in under ten minutes.",
  },
  {
    icon: Scissors,
    title: "We chunk, embed, and index",
    body: "Pages are split into roughly 380 semantic chunks on average, embedded, and stored in a vector index scoped to your workspace alone — never shared with, or mixed into, anyone else's data.",
  },
  {
    icon: BrainCircuit,
    title: "You set the persona",
    body: "Give the bot a name, a tone of voice, and any custom instructions (\"always mention the 2-year warranty\"). Every answer is retrieved from your indexed content first — the persona shapes how it's said, not what's true.",
  },
  {
    icon: Code2,
    title: "Ship one script tag",
    body: "Paste a single line before </body>. The widget is live immediately, themed to match your brand, on desktop and mobile.",
  },
  {
    icon: MessageSquare,
    title: "Visitors get cited answers",
    body: "Every response links back to the exact page it came from. When nothing relevant is found, the bot says so and offers to connect a human instead of guessing.",
  },
  {
    icon: BarChart3,
    title: "You see what's working",
    body: "Resolution rate, handoff volume, and every unanswered question land in your dashboard — so closing knowledge gaps takes one click, not a support ticket.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 text-center md:py-20">
          <div className="container">
            <h1 className="font-display mx-auto max-w-[20ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[46px]">
              From URL to live widget, honestly explained
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] text-fg-muted">
              No crawling scripts to write, no vector database to manage, no prompt engineering required.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="container grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-2">
            {steps.map((step, i) => (
              <div key={step.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl2 bg-accent-soft text-accent-ink">
                    <step.icon className="h-5 w-5" />
                  </div>
                  {i < steps.length - 1 && <div className="mt-2 w-px flex-1 bg-border" />}
                </div>
                <div className="pb-2">
                  <span className="tabular text-[12px] font-semibold text-fg-faint">STEP {i + 1}</span>
                  <h3 className="mt-1 text-[16.5px] font-semibold text-fg">{step.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-20 text-center">
          <div className="container flex flex-col items-center gap-6">
            <h2 className="font-display max-w-[24ch] text-[28px] font-semibold tracking-tight text-fg sm:text-[34px]">
              Fifteen minutes, start to live widget
            </h2>
            <Button size="lg" variant="warm" asChild>
              <Link href="/signup">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
