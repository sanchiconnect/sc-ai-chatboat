import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DemoTeaser() {
  return (
    <section className="border-b border-border py-20">
      <div className="container">
        <div className="flex flex-col items-center gap-6 rounded-xl2 border border-border bg-accent-soft/40 px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-accent-ink shadow-card">
            <PlayCircle className="h-7 w-7" />
          </div>
          <h2 className="font-display max-w-[30ch] text-[28px] font-semibold tracking-tight text-fg sm:text-[34px]">
            Skip the sales call. Ask it something right now.
          </h2>
          <p className="max-w-[48ch] text-[15.5px] text-fg-muted">
            We crawled three real sites so you can see retrieval, citations, and tone-matching live, with
            no sign-up required.
          </p>
          <Button size="lg" variant="warm" asChild>
            <Link href="/demo">
              Open the live demo <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
