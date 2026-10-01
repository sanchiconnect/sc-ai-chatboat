import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { DemoWidget } from "@/components/marketing/demo-widget";

export const metadata: Metadata = {
  title: "Demo",
  description: "See how SanchiJawab answers from a sample site's real policy pages, with citations.",
};

export default function DemoPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-dot-grid py-16 md:py-20">
          <div className="container grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <h1 className="font-display max-w-[16ch] text-[36px] font-semibold tracking-tight text-fg sm:text-[44px]">
                See a real conversation, not a sales reel
              </h1>
              <p className="mt-4 max-w-[48ch] text-[16px] text-fg-muted">
                This is a scripted sample so you can see the shape of an answer — citations, tone, and
                handoff — without needing your own site indexed first. Sign up and we&apos;ll crawl your
                actual site in minutes.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" variant="warm" asChild>
                  <Link href="/signup">
                    Start free with your own site <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="ghost" asChild>
                  <Link href="/how-it-works">How it actually works</Link>
                </Button>
              </div>
            </div>
            <DemoWidget />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
