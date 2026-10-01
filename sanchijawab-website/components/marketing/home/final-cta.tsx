import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="bg-dot-grid py-24">
      <div className="container flex flex-col items-center gap-6 text-center">
        <h2 className="font-display max-w-[24ch] text-[32px] font-semibold tracking-tight text-fg sm:text-[42px]">
          Give your website the last word it needs.
        </h2>
        <p className="max-w-[46ch] text-[16px] text-fg-muted">
          Free to set up, live in minutes, and grounded in content you already wrote.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" variant="warm" asChild>
            <Link href="/auth/signup">
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="ghost" asChild>
            <Link href="/contact">Talk to us first</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
