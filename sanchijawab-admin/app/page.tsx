"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

// This app has no public landing page of its own anymore — the marketing
// site (sanchijawab-website) owns that job. "/" here only decides where to
// send a visitor: back into their dashboard if they're already signed in,
// or out to the marketing site if not.
export default function RootRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
    } else {
      window.location.href = process.env.NEXT_PUBLIC_MARKETING_URL ?? "/login";
    }
  }, [router]);

  return null;
}
