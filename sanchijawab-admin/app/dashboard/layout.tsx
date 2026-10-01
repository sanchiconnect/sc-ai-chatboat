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

  if (!ready) return null;

  // No visual chrome here — each route level (workspace vs. a specific
  // bot) renders its own full sidebar+topbar shell, since they show
  // different navigation. This layout only gates on auth.
  return <div className="min-h-screen px-4 py-5">{children}</div>;
}
