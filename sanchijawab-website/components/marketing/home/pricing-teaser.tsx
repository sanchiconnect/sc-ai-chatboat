import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const tiers = [
  {
    name: "Starter",
    price: "$0",
    period: "/mo",
    blurb: "One site, 500 resolutions a month.",
    features: ["1 crawled domain", "500 AI resolutions/mo", "Email support"],
  },
  {
    name: "Growth",
    price: "$79",
    period: "/mo",
    blurb: "For teams ready to deflect real volume.",
    features: ["5 crawled domains", "5,000 resolutions/mo", "Human handoff", "Slack + Zendesk"],
    featured: true,
  },
  {
    name: "Scale",
    price: "Custom",
    period: "",
    blurb: "Multi-brand, SSO, and dedicated support.",
    features: ["Unlimited domains", "Custom resolution volume", "SSO & audit logs", "Dedicated CSM"],
  },
];

export function PricingTeaser() {
  return (
    <section id="pricing" className="border-b border-border bg-surface-2 py-20">
      <div className="container">
        <div className="mx-auto mb-14 max-w-[52ch] text-center">
          <h2 className="font-display text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
            Simple pricing, no resolution surprises
          </h2>
          <p className="mt-3 text-[15.5px] text-fg-muted">Start free. Upgrade only when visitors start relying on it.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={`flex flex-col gap-5 p-7 ${tier.featured ? "border-accent ring-1 ring-accent" : ""}`}
            >
              {tier.featured && <Badge variant="warm" className="w-fit">Most popular</Badge>}
              <div>
                <h3 className="text-[16px] font-semibold text-fg">{tier.name}</h3>
                <p className="mt-1 text-[13.5px] text-fg-muted">{tier.blurb}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-display text-[38px] font-semibold text-fg">{tier.price}</span>
                <span className="text-[14px] text-fg-muted">{tier.period}</span>
              </div>
              <ul className="flex flex-1 flex-col gap-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[14px] text-fg-muted">
                    <Check className="h-4 w-4 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Button variant={tier.featured ? "warm" : "ghost"} asChild>
                <Link href="/pricing">
                  {tier.name === "Scale" ? "Talk to sales" : "Start free"}
                </Link>
              </Button>
            </Card>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button variant="link" asChild>
            <Link href="/pricing">
              Compare full plan details <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
