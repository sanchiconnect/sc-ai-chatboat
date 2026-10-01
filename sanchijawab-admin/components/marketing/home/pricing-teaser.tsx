import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    return []; // backend not reachable at build/request time — fail quiet, not with a broken page
  }
}

export async function PricingTeaser() {
  const plans = await getPlans();
  if (plans.length === 0) return null;

  const featuredIndex = plans.length >= 3 ? 1 : -1;

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
          {plans.map((plan, i) => {
            const featured = i === featuredIndex;
            return (
              <Card
                key={plan.plan_id}
                className={`flex flex-col gap-5 p-7 ${featured ? "border-accent ring-1 ring-accent" : ""}`}
              >
                {featured && <Badge variant="warm" className="w-fit">Most popular</Badge>}
                <div>
                  <h3 className="text-[16px] font-semibold text-fg">{plan.name}</h3>
                  <p className="mt-1 text-[13.5px] text-fg-muted">{plan.tagline}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-[32px] font-semibold text-fg">{plan.price_text || "Custom"}</span>
                </div>
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
