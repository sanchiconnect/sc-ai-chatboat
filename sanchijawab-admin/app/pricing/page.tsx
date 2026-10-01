import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent pricing for SanchiJawab — no resolution surprises.",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type PublicPlan = {
  plan_id: string;
  name: string;
  price_text: string;
  tagline: string;
  features: string[];
  sort_order: number;
  purchasable: boolean;
};

async function getPlans(): Promise<PublicPlan[]> {
  try {
    const res = await fetch(`${API_URL}/public/plans`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const plans: PublicPlan[] = await res.json();
    return plans.sort((a, b) => a.sort_order - b.sort_order);
  } catch {
    return [];
  }
}

const faqs = [
  { q: "What's a \"resolution\"?", a: "One conversation where the bot either answered the visitor's question or captured a lead, whether or not it handed off to a human afterward." },
  { q: "What happens if I go over my plan's limit?", a: "We'll email you before you hit it. The widget keeps working — you won't be cut off mid-conversation with a live visitor." },
  { q: "Can I change plans later?", a: "Yes, any time from the Billing page in your dashboard. Changes take effect on your next billing cycle." },
  { q: "Do you offer annual billing?", a: "Not yet in self-serve checkout — contact us if you'd like to discuss an annual plan." },
  { q: "Is there a contract?", a: "No. Every plan is month-to-month; cancel whenever." },
];

export default async function PricingPage() {
  const plans = await getPlans();

  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 text-center md:py-20">
          <div className="container">
            <h1 className="font-display mx-auto max-w-[20ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[46px]">
              Simple pricing, no resolution surprises
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] text-fg-muted">
              Start free. Upgrade only once visitors start relying on it.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="container">
            {plans.length === 0 ? (
              <p className="text-center text-[14px] text-fg-faint">No plans published yet — check back soon.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {plans.map((plan, i) => {
                  const featured = plans.length >= 3 && i === 1;
                  return (
                    <Card
                      key={plan.plan_id}
                      className={`flex flex-col gap-5 p-7 ${featured ? "border-accent ring-1 ring-accent" : ""}`}
                    >
                      {featured && <Badge variant="warm" className="w-fit">Most popular</Badge>}
                      <div>
                        <h3 className="text-[17px] font-semibold text-fg">{plan.name}</h3>
                        <p className="mt-1 text-[13.5px] text-fg-muted">{plan.tagline}</p>
                      </div>
                      <div className="font-display text-[34px] font-semibold text-fg">{plan.price_text || "Custom"}</div>
                      <ul className="flex flex-1 flex-col gap-2.5">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2.5 text-[14px] text-fg-muted">
                            <Check className="h-4 w-4 shrink-0 text-success" /> {f}
                          </li>
                        ))}
                      </ul>
                      <Button variant={featured ? "warm" : "ghost"} asChild>
                        <Link href={plan.purchasable ? "/signup" : "/contact"}>
                          {plan.purchasable ? "Start free" : "Talk to sales"}
                        </Link>
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
            <p className="mt-8 text-center text-[13px] text-fg-faint">
              All prices in INR. GST applied at checkout where applicable.
            </p>
          </div>
        </section>

        <section className="border-t border-border bg-surface-2 py-16">
          <div className="container max-w-3xl">
            <h2 className="font-display mb-8 text-center text-[26px] font-semibold text-fg">Pricing questions</h2>
            <Accordion type="single" collapsible className="rounded-xl2 border border-border bg-surface px-6">
              {faqs.map((f) => (
                <AccordionItem key={f.q} value={f.q}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent>{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
