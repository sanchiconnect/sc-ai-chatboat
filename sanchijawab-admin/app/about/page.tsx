import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Target, Users, Globe2 } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About",
  description: "Why Sanchiconnect Technologies built SanchiJawab, and what we believe about AI support.",
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 text-center md:py-20">
          <div className="container">
            <h1 className="font-display mx-auto max-w-[20ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[46px]">
              Built in India, answering the world
            </h1>
            <p className="mx-auto mt-4 max-w-[56ch] text-[16px] text-fg-muted">
              Sanchiconnect Technologies builds SanchiJawab because we got tired of watching small teams
              answer the same five questions by hand, forever.
            </p>
          </div>
        </section>

        <section className="border-b border-border py-16">
          <div className="container max-w-3xl">
            <h2 className="font-display mb-4 text-[22px] font-semibold text-fg">Why this exists</h2>
            <p className="text-[15px] leading-relaxed text-fg-muted">
              Most support questions aren&apos;t hard — they&apos;re repetitive. &ldquo;What&apos;s your return
              policy?&rdquo; &ldquo;Is this covered under warranty?&rdquo; &ldquo;What&apos;s the deadline to
              apply?&rdquo; The answer already exists somewhere on the business&apos;s own website. The visitor
              just can&apos;t find it fast enough, and the team answering it by hand would rather be doing
              something harder.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">
              SanchiJawab exists to close that gap without asking a business to write a single line of training
              data by hand. Point it at your site, and it learns what you&apos;ve already published.
            </p>
          </div>
        </section>

        <section className="border-b border-border bg-surface-2 py-16">
          <div className="container grid grid-cols-1 gap-5 md:grid-cols-3">
            <Card className="flex flex-col gap-3 p-6">
              <Target className="h-5 w-5 text-accent-ink" />
              <h3 className="text-[15px] font-semibold text-fg">Grounded, not generic</h3>
              <p className="text-[13.5px] leading-relaxed text-fg-muted">
                We&apos;d rather a bot say &ldquo;I don&apos;t know, let me connect you&rdquo; than guess. Every
                answer traces back to something you actually published.
              </p>
            </Card>
            <Card className="flex flex-col gap-3 p-6">
              <Users className="h-5 w-5 text-accent-ink" />
              <h3 className="text-[15px] font-semibold text-fg">Built for the team, not just the visitor</h3>
              <p className="text-[13.5px] leading-relaxed text-fg-muted">
                Analytics and unanswered-question tracking exist because a support team shouldn&apos;t have to
                guess what&apos;s working.
              </p>
            </Card>
            <Card className="flex flex-col gap-3 p-6">
              <Globe2 className="h-5 w-5 text-accent-ink" />
              <h3 className="text-[15px] font-semibold text-fg">India-first, not India-only</h3>
              <p className="text-[13.5px] leading-relaxed text-fg-muted">
                Built with GST-compliant billing and Hindi/Hinglish support from day one — and multilingual
                for every market beyond that.
              </p>
            </Card>
          </div>
        </section>

        <section className="py-20 text-center">
          <div className="container flex flex-col items-center gap-6">
            <h2 className="font-display max-w-[24ch] text-[28px] font-semibold tracking-tight text-fg sm:text-[34px]">
              Questions about the company, not the product?
            </h2>
            <Button size="lg" variant="warm" asChild>
              <Link href="/contact">
                Get in touch <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
