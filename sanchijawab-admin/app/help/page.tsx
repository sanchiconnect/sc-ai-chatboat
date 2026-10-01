import type { Metadata } from "next";
import Link from "next/link";
import { Rocket, CreditCard, Code2, Users, Wrench, MessageSquare } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Help center",
  description: "Getting started, billing, installation, and troubleshooting for SanchiJawab.",
};

const categories = [
  {
    icon: Rocket,
    title: "Getting started",
    items: [
      { q: "How do I create my first bot?", a: "From your dashboard, click \"Create a new bot\", give it a name, then add a knowledge source — either a website URL to crawl or a file to upload — from the Knowledge tab." },
      { q: "How long does the initial crawl take?", a: "Most sites under 2,000 pages finish in under ten minutes. The bot starts answering from whatever's indexed so far while a larger crawl continues in the background." },
      { q: "How do I go live on my site?", a: "Once your bot is set up, go to its Install tab and copy the script tag into your site before the closing </body> tag." },
    ],
  },
  {
    icon: Code2,
    title: "Installation & widget",
    items: [
      { q: "The widget isn't showing up on my site", a: "Confirm the script tag is placed before </body> on every page you want it on, and that your bot's Allowed Domains field (in Bot settings) either is empty or includes the domain you're testing on." },
      { q: "Can I change the widget's color and avatar?", a: "Yes — from the Widget tab on your bot. Changes apply immediately without re-installing the script." },
      { q: "Does the widget work on mobile?", a: "Yes, it's responsive by default on both the bottom-right and bottom-left positions." },
    ],
  },
  {
    icon: Users,
    title: "Team & roles",
    items: [
      { q: "What's the difference between Admin, Agent, and Viewer?", a: "Admins can manage bots, knowledge, and billing. Agents can reply in the inbox and manage knowledge, but not billing or team members. Viewers can see everything but change nothing." },
      { q: "Someone's invite email never arrived", a: "Check their spam folder first. If it's still missing, go to the Team page and click \"Resend\" next to their pending invite." },
      { q: "How do I remove someone from my workspace?", a: "On the Team page, click \"Remove\" next to their name. This can't be undone, though you can re-invite them later." },
    ],
  },
  {
    icon: CreditCard,
    title: "Billing",
    items: [
      { q: "How do I subscribe to a plan?", a: "From the Billing & plan page, click \"Subscribe\" on any plan and complete checkout via Razorpay or Stripe, whichever is available." },
      { q: "Where do I find my invoices?", a: "Every paid order appears in the Orders & invoices table on the Billing page, with a PDF download for each." },
      { q: "Can I change plans later?", a: "Yes, any time — subscribe to a different plan the same way, from the Billing page." },
    ],
  },
  {
    icon: Wrench,
    title: "Troubleshooting",
    items: [
      { q: "The bot gave a wrong or outdated answer", a: "Re-crawl the source from the Knowledge tab if your site has changed, or remove an outdated source entirely if it's no longer accurate." },
      { q: "A question keeps going unanswered", a: "Check the Overview tab's \"Unanswered questions\" list — add a direct answer from there and the bot will use it going forward." },
    ],
  },
];

export default function HelpPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 text-center md:py-20">
          <div className="container">
            <h1 className="font-display mx-auto max-w-[20ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[46px]">
              Help center
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] text-fg-muted">
              Can&apos;t find it here?{" "}
              <Link href="/contact" className="text-accent-ink underline underline-offset-2">
                Contact us directly
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="container grid grid-cols-1 gap-10 lg:grid-cols-[260px_1fr]">
            <div className="flex flex-col gap-2">
              {categories.map((c) => (
                <div key={c.title} className="flex items-center gap-2.5 rounded-btn px-3 py-2.5 text-[14px] font-medium text-fg-muted">
                  <c.icon className="h-4 w-4 text-accent-ink" /> {c.title}
                </div>
              ))}
              <Card className="mt-2 flex items-start gap-3 p-4">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />
                <p className="text-[12.5px] text-fg-muted">
                  Already a customer? Your own bot&apos;s Playground can usually answer product questions faster
                  than searching here.
                </p>
              </Card>
            </div>

            <div className="flex flex-col gap-10">
              {categories.map((c) => (
                <div key={c.title} id={c.title.toLowerCase().replace(/[^a-z]+/g, "-")}>
                  <h2 className="font-display mb-3 flex items-center gap-2.5 text-[19px] font-semibold text-fg">
                    <c.icon className="h-5 w-5 text-accent-ink" /> {c.title}
                  </h2>
                  <Accordion type="single" collapsible className="rounded-xl2 border border-border bg-surface px-5">
                    {c.items.map((item) => (
                      <AccordionItem key={item.q} value={item.q}>
                        <AccordionTrigger>{item.q}</AccordionTrigger>
                        <AccordionContent>{item.a}</AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
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
