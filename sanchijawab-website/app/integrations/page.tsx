import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Webhook, Code2 } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/mock-ui/brand-logo";
import {
  siSlack,
  siZendesk,
  siHubspot,
  siShopify,
  siWordpress,
  siSalesforce,
  siNotion,
  siWebflow,
  siZapier,
  siDiscord,
  siIntercom,
  siZoho,
} from "simple-icons";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Connect SanchiJawab to the tools your team already runs — Slack, Zendesk, HubSpot, Shopify, and more.",
};

const categories = [
  {
    heading: "Support & helpdesk",
    blurb: "Route conversations the widget can't resolve straight into your existing queue.",
    items: [
      { icon: siZendesk, name: "Zendesk", body: "Escalate unresolved chats as tickets with full conversation history attached." },
      { icon: siIntercom, name: "Intercom", body: "Sync conversations both ways so agents see the AI's answers in context." },
      { icon: siZoho, name: "Zoho Desk", body: "Create tickets automatically when a visitor asks for a human." },
      { icon: siDiscord, name: "Discord", body: "Get a live alert in a channel whenever SanchiJawab hands off a conversation." },
    ],
  },
  {
    heading: "Sales & CRM",
    blurb: "Turn qualified conversations into pipeline without re-typing a thing.",
    items: [
      { icon: siHubspot, name: "HubSpot", body: "Push captured leads and full chat transcripts straight into HubSpot contacts." },
      { icon: siSalesforce, name: "Salesforce", body: "Create or update Salesforce leads the moment a visitor shares their email." },
    ],
  },
  {
    heading: "Commerce & CMS",
    blurb: "Crawl and re-crawl the platforms your storefront or site already runs on.",
    items: [
      { icon: siShopify, name: "Shopify", body: "Index product pages, policies, and FAQs directly from your store." },
      { icon: siWordpress, name: "WordPress", body: "One-click install keeps your knowledge base in sync as posts change." },
      { icon: siWebflow, name: "Webflow", body: "Embed the widget with a single custom-code block, no rebuild required." },
    ],
  },
  {
    heading: "Productivity & automation",
    blurb: "Keep your team in the loop and wire up the rest yourself.",
    items: [
      { icon: siSlack, name: "Slack", body: "Get notified of handoffs and low-confidence answers in a channel of your choice." },
      { icon: siNotion, name: "Notion", body: "Index an entire Notion workspace as a source alongside your public site." },
      { icon: siZapier, name: "Zapier", body: "Connect SanchiJawab to 6,000+ apps with triggers for every conversation event." },
    ],
  },
];

export default function IntegrationsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 text-center md:py-20">
          <div className="container">
            <h1 className="font-display mx-auto max-w-[20ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[46px]">
              Fits the stack you already run
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] text-fg-muted">
              SanchiJawab plugs into support, CRM, commerce, and automation tools you&apos;ve already paid for —
              plus a documented REST API for everything else.
            </p>
          </div>
        </section>

        {categories.map((cat) => (
          <section key={cat.heading} className="border-b border-border py-16">
            <div className="container">
              <div className="mb-8 max-w-[56ch]">
                <h2 className="font-display text-[22px] font-semibold text-fg">{cat.heading}</h2>
                <p className="mt-1.5 text-[14.5px] text-fg-muted">{cat.blurb}</p>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {cat.items.map((item) => (
                  <Card key={item.name} className="flex flex-col gap-3 p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-btn border border-border bg-surface-2">
                      <BrandLogo icon={item.icon} className="h-5 w-5" />
                    </div>
                    <h3 className="text-[15px] font-semibold text-fg">{item.name}</h3>
                    <p className="text-[13.5px] leading-relaxed text-fg-muted">{item.body}</p>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="bg-surface-2 py-20">
          <div className="container grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="flex flex-col gap-4 p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl2 bg-accent-soft text-accent-ink">
                <Code2 className="h-5 w-5" />
              </div>
              <h3 className="text-[18px] font-semibold text-fg">REST API</h3>
              <p className="text-[14.5px] leading-relaxed text-fg-muted">
                Trigger crawls, query conversation history, and manage sources programmatically. Every
                action available in the dashboard has an API equivalent.
              </p>
              <Button variant="ghost" className="w-fit" asChild>
                <Link href="/contact">
                  Request API docs access <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Card>
            <Card className="flex flex-col gap-4 p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl2 bg-warm-soft text-warm">
                <Webhook className="h-5 w-5" />
              </div>
              <h3 className="text-[18px] font-semibold text-fg">Webhooks</h3>
              <p className="text-[14.5px] leading-relaxed text-fg-muted">
                Subscribe to conversation-started, handoff-requested, and crawl-completed events to
                build your own automations beyond Zapier.
              </p>
              <Button variant="ghost" className="w-fit" asChild>
                <Link href="/contact">
                  Talk to us about webhooks <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Card>
          </div>
        </section>

        <section className="py-20 text-center">
          <div className="container flex flex-col items-center gap-6">
            <h2 className="font-display max-w-[24ch] text-[28px] font-semibold tracking-tight text-fg sm:text-[34px]">
              Don&apos;t see your tool? We probably still connect.
            </h2>
            <Button size="lg" variant="warm" asChild>
              <Link href="/contact">
                Ask about an integration <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
