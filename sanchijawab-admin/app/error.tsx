"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/marketing/logo";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center">
      <LogoMark className="h-12 w-12 opacity-40" />
      <p className="font-display mt-6 text-[64px] font-semibold leading-none text-fg-faint">500</p>
      <h1 className="font-display mt-3 text-[24px] font-semibold text-fg">Something went wrong on our end</h1>
      <p className="mt-2 max-w-[44ch] text-[14.5px] text-fg-muted">
        This has been logged. Try again, or head back home if it keeps happening.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="warm" onClick={reset}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">
            <Home className="h-4 w-4" /> Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
}
