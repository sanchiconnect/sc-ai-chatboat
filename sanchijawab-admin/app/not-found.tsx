import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/marketing/logo";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center">
        <LogoMark className="h-12 w-12 opacity-40" />
        <p className="font-display mt-6 text-[64px] font-semibold leading-none text-fg-faint">404</p>
        <h1 className="font-display mt-3 text-[24px] font-semibold text-fg">
          Even our crawler couldn&apos;t find this page
        </h1>
        <p className="mt-2 max-w-[44ch] text-[14.5px] text-fg-muted">
          The page you&apos;re looking for doesn&apos;t exist, or has moved.
        </p>
        <Button size="lg" variant="warm" className="mt-6" asChild>
          <Link href="/">
            Back to home <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </main>
      <SiteFooter />
    </>
  );
}
