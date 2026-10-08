"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen app-backdrop flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-border border-t-accent animate-spin" />
      </div>
    );
  }

  // No visual chrome here — each route level (workspace vs. a specific
  // bot) renders its own full sidebar+topbar shell, since they show
  // different navigation. This layout only gates on auth and adds the
  // backdrop. (The page-enter animation is keyed per shell, not here —
  // keying here would remount the sidebars on every navigation.)
  return <div className="min-h-screen px-4 py-5 app-backdrop">{children}</div>;
}
