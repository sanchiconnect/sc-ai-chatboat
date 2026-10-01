import Link from "next/link";
import { ArrowRight, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatPreview } from "@/components/mock-ui/chat-preview";

export function Hero() {
  return (
    <section className="bg-dot-grid relative overflow-hidden border-b border-border">
      <div className="container grid grid-cols-1 items-center gap-14 py-16 md:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div className="flex flex-col items-start gap-6">
          <Badge variant="accent">
            <Globe2 className="h-3.5 w-3.5" /> Now crawling 40M+ pages a month
          </Badge>
          <h1 className="font-display max-w-[16ch] text-[40px] font-semibold leading-[1.08] tracking-tight text-fg sm:text-[52px] lg:text-[58px]">
            Your website, turned into an <span className="text-accent-ink">answer engine</span>.
          </h1>
          <p className="max-w-[48ch] text-[17px] leading-relaxed text-fg-muted sm:text-[18px]">
            Point SanchiJawab at your domain. We crawl it, chunk it, embed it, and give every visitor
            instant, cited answers — in a widget that ships in an afternoon, not a sprint.
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button size="lg" variant="warm" asChild>
              <Link href="/signup">
                Start free — no card <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <Link href="/demo">Try it on a live site</Link>
            </Button>
          </div>
          <p className="pt-1 text-[13px] text-fg-faint">Free up to 500 resolutions/mo · Cancel anytime · 4.9/5 from 310 teams</p>
        </div>

        <div className="relative">
          <div className="absolute -inset-10 -z-10 rounded-full bg-accent-soft/60 blur-3xl" aria-hidden="true" />
          <ChatPreview />
        </div>
      </div>
    </section>
  );
}
