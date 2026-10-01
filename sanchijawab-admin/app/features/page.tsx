import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileSearch, Users, Palette, ShieldCheck, BarChart3, Plug, Globe, Languages, Webhook } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Features",
  description: "Everything SanchiJawab does: crawling, retrieval, citations, human handoff, analytics, and more.",
};

const groups = [
  {
    heading: "Crawling & knowledge",
    items: [
      { icon: Globe, title: "Breadth-first site crawl", body: "Walks every reachable page from your domain, not just the ones it happens to link-hop into first, and respects robots.txt and your sitemap." },
      { icon: FileSearch, title: "Files too, not just pages", body: "PDFs, DOCX, PPTX, spreadsheets, and plain text — upload them alongside a crawl to fill gaps a public site can't cover." },
      { icon: Languages, title: "Multilingual out of the box", body: "A visitor writing in Hindi, Hinglish, or English gets an answer in that language, even when your source content is only in one." },
    ],
  },
  {
    heading: "Answering",
    items: [
      { icon: FileSearch, title: "Cited, grounded answers", body: "Every response links back to the exact page or document it came from — never a free-floating guess." },
      { icon: Users, title: "Human handoff", body: "When confidence drops, or a visitor explicitly asks, the conversation routes to your team's inbox with full context attached." },
      { icon: BarChart3, title: "Unanswered-question tracking", body: "See exactly what your bot couldn't answer, and add the missing knowledge in one click." },
    ],
  },
  {
    heading: "Customization",
    items: [
      { icon: Palette, title: "Matches your brand", body: "Avatar, color, header text, and welcome message — the widget looks like it was built in-house, not bolted on." },
      { icon: ShieldCheck, title: "Persona & guardrails", body: "Set a name, tone, and custom instructions so the bot sounds like your team, not a generic assistant." },
    ],
  },
  {
    heading: "Operating it",
    items: [
      { icon: BarChart3, title: "Real conversation analytics", body: "Resolution rate, handoff volume, and the exact questions visitors ask most — not vanity metrics." },
      { icon: Plug, title: "Team roles", body: "Owner, Admin, Agent, and Viewer roles so the right people can manage the bot without touching billing." },
      { icon: Webhook, title: "CRM webhooks", body: "Push captured leads straight into whatever CRM or automation tool you already run." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 text-center md:py-20">
          <div className="container">
            <h1 className="font-display mx-auto max-w-[22ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[46px]">
              Built for answers you can trust
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] text-fg-muted">
              Not a generic chatbot shell — a retrieval system with your own content at the center of every
              answer.
            </p>
          </div>
        </section>

        {groups.map((group) => (
          <section key={group.heading} className="border-b border-border py-16">
            <div className="container">
              <h2 className="font-display mb-8 text-[22px] font-semibold text-fg">{group.heading}</h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <Card key={item.title} className="flex flex-col gap-3 p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-accent-soft text-accent-ink">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-[15.5px] font-semibold text-fg">{item.title}</h3>
                    <p className="text-[14px] leading-relaxed text-fg-muted">{item.body}</p>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="py-20 text-center">
          <div className="container flex flex-col items-center gap-6">
            <h2 className="font-display max-w-[24ch] text-[28px] font-semibold tracking-tight text-fg sm:text-[34px]">
              See it answer your own content
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" variant="warm" asChild>
                <Link href="/signup">
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <Link href="/demo">See a live example</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
