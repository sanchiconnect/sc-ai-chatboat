"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";

function initialsFor(email: string | null): string {
  if (!email) return "?";
  const local = email.split("@")[0];
  return local.slice(0, 2).toUpperCase();
}

export function ProfileMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <NotificationBell />
      <ThemeToggle />
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          className="w-9 h-9 rounded-full bg-accent-soft text-accent-ink border border-border flex items-center justify-center font-bold text-sm"
        >
          {initialsFor(email)}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 w-52 bg-surface border border-border rounded-xl shadow-card p-1.5 z-50">
            {email && <div className="text-xs text-fg-faint px-2.5 py-1.5 truncate">{email}</div>}
            <button
              onClick={() => {
                setOpen(false);
                router.push("/dashboard/profile");
              }}
              className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-fg hover:bg-surface-2"
            >
              Profile
            </button>
            <button
              onClick={() => {
                setOpen(false);
                router.push("/dashboard/workspace-settings");
              }}
              className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-fg hover:bg-surface-2"
            >
              Workspace settings
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => {
                setOpen(false);
                clearToken();
                // Back to the sign-in page, not the marketing site.
                window.location.href = "/login";
              }}
              className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-danger hover:bg-surface-2"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
