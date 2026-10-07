"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getStaffToken, clearStaffToken, staffApi, StaffApiError } from "@/lib/staff-api";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV = [
  { href: "/staff", label: "Workspaces" },
  { href: "/staff/content", label: "Website content" },
  { href: "/staff/settings", label: "Settings & activity" },
];

export default function StaffConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!getStaffToken()) {
      router.replace("/staff/login");
      return;
    }
    staffApi
      .me()
      .then((res) => setEmail(res.email))
      .catch((err) => {
        if (err instanceof StaffApiError) clearStaffToken();
        router.replace("/staff/login");
      });
  }, [router]);

  if (!email) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-border border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border">
        <div className="max-w-[1240px] mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] rounded-lg bg-fg text-bg flex items-center justify-center font-display font-semibold text-sm flex-none">
              S
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">SanchiJawab &middot; Super Admin</div>
              <div className="text-[11px] text-fg-faint leading-tight">Platform operator view — not visible to customers</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {NAV.map((item) => {
              const active = item.href === "/staff" ? pathname === "/staff" || pathname.startsWith("/staff/workspaces") : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`text-[12.5px] font-semibold rounded-lg px-3 py-1.5 transition-colors ${
                    active ? "bg-accent-soft text-accent" : "text-fg-muted hover:text-fg hover:bg-surface-2"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <span className="text-[12px] text-fg-faint hidden sm:inline">{email}</span>
            <ThemeToggle />
            <button
              onClick={() => {
                clearStaffToken();
                router.replace("/staff/login");
              }}
              className="text-[12.5px] font-semibold text-danger border border-border rounded-lg px-3 py-1.5 hover:bg-surface-2"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[1240px] mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
