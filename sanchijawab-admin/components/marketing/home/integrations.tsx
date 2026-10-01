import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo, integrationBrands } from "@/components/mock-ui/brand-logo";

export function Integrations() {
  return (
    <section className="border-b border-border bg-surface-2 py-20">
      <div className="container">
        <div className="mx-auto mb-10 max-w-[52ch] text-center">
          <h2 className="font-display text-[30px] font-semibold tracking-tight text-fg sm:text-[36px]">
            Fits the stack you already run
          </h2>
          <p className="mt-3 text-[15.5px] text-fg-muted">Plus a documented REST API and webhooks for anything bespoke.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {integrationBrands.map(({ icon, label }) => (
            <div
              key={label}
              className="flex h-20 flex-col items-center justify-center gap-2 rounded-xl2 border border-border bg-surface px-3 text-center shadow-card"
            >
              <BrandLogo icon={icon} className="h-5 w-5" />
              <span className="text-[12px] font-medium text-fg-muted">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button variant="link" asChild>
            <Link href="/integrations">
              See all integrations <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
