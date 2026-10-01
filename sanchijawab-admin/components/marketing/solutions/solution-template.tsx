import Link from "next/link";
import { ArrowRight, CheckCircle2, Quote } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface SolutionContent {
  badge: string;
  title: string;
  subtitle: string;
  painPoints: string[];
  helps: { title: string; body: string }[];
  stat: { value: string; label: string };
  quote: { body: string; name: string; role: string };
}

export function SolutionTemplate({ content }: { content: SolutionContent }) {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 md:py-20">
          <div className="container text-center">
            <Badge variant="accent" className="mx-auto w-fit">{content.badge}</Badge>
            <h1 className="font-display mx-auto mt-4 max-w-[22ch] text-[34px] font-semibold tracking-tight text-fg sm:text-[44px]">
              {content.title}
            </h1>
            <p className="mx-auto mt-4 max-w-[56ch] text-[16px] text-fg-muted">{content.subtitle}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button size="lg" variant="warm" asChild>
                <Link href="/signup">
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-b border-border py-16">
          <div className="container">
            <h2 className="font-display mb-8 text-center text-[22px] font-semibold text-fg">
              The questions you&apos;re already answering by hand
            </h2>
            <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
              {content.painPoints.map((p) => (
                <div key={p} className="flex items-start gap-2.5 rounded-xl2 border border-border bg-surface-2 p-4">
                  <span className="text-[14px] text-fg-muted">&ldquo;{p}&rdquo;</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-surface-2 py-16">
          <div className="container">
            <h2 className="font-display mb-8 text-center text-[22px] font-semibold text-fg">How SanchiJawab helps</h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {content.helps.map((h) => (
                <Card key={h.title} className="flex flex-col gap-2.5 p-6">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <h3 className="text-[15px] font-semibold text-fg">{h.title}</h3>
                  <p className="text-[13.5px] leading-relaxed text-fg-muted">{h.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border py-16">
          <div className="container grid grid-cols-1 items-center gap-10 md:grid-cols-2">
            <div className="text-center md:text-left">
              <span className="font-display text-[48px] font-semibold text-accent-ink">{content.stat.value}</span>
              <p className="mt-1 text-[14.5px] text-fg-muted">{content.stat.label}</p>
            </div>
            <Card className="flex flex-col gap-4 p-6">
              <Quote className="h-6 w-6 text-accent-soft" fill="currentColor" strokeWidth={0} />
              <p className="text-[14.5px] leading-relaxed text-fg">{content.quote.body}</p>
              <div>
                <p className="text-[14px] font-semibold text-fg">{content.quote.name}</p>
                <p className="text-[13px] text-fg-muted">{content.quote.role}</p>
              </div>
            </Card>
          </div>
        </section>

        <section className="py-20 text-center">
          <div className="container flex flex-col items-center gap-6">
            <h2 className="font-display max-w-[24ch] text-[28px] font-semibold tracking-tight text-fg sm:text-[34px]">
              Ready to try it on your own site?
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
