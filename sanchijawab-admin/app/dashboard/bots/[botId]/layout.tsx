"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ProfileMenu } from "@/components/ProfileMenu";

const TABS = [
  {
    href: "analytics",
    label: "Analytics",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="M7 15l4-6 4 3 5-8" />
      </svg>
    ),
  },
  {
    href: "inbox",
    label: "Inbox",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5" />
        <path d="M3 12l3.5 5h11L21 12" />
        <path d="M3 12h5l1.5 2h5L16 12h5" />
      </svg>
    ),
  },
  {
    href: "knowledge",
    label: "Knowledge",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </svg>
    ),
  },
  {
    href: "widget",
    label: "Widget",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2H17a5 5 0 0 0 5-5c0-5.5-4.5-8.4-10-8.4Z" />
      </svg>
    ),
  },
  {
    href: "settings",
    label: "Bot settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87M4.64 9a1.7 1.7 0 0 0-.34-1.87M9 4.64c.62-.26 1-.87 1-1.55M15 19.36c0-.68.38-1.29 1-1.55M4.64 15a1.7 1.7 0 0 0 1.55-1M19.36 9c-.68 0-1.29-.38-1.55-1" />
      </svg>
    ),
  },
  {
    href: "leads",
    label: "Leads",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: "install",
    label: "Install",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
      </svg>
    ),
  },
  {
    href: "playground",
    label: "Playground",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 3l14 9-14 9V3Z" />
      </svg>
    ),
  },
];

export default function BotLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { botId } = useParams<{ botId: string }>();
  const [botName, setBotName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    api.getBot(botId).then((b) => setBotName(b.name)).catch(() => setBotName(null));
    api.me().then((m) => setEmail(m.email)).catch(() => {});
  }, [botId]);

  return (
    <div className="max-w-[1240px] mx-auto grid grid-cols-1 md:grid-cols-[248px_1fr] gap-5 items-start">
      <aside className="bg-surface border border-border rounded-2xl p-4 md:sticky md:top-5">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted mb-3">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          All bots
        </Link>
        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-2 border border-border mb-3">
          <div className="w-[34px] h-[34px] rounded-lg bg-accent text-white flex items-center justify-center font-bold text-sm flex-none">
            {(botName || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{botName || "Loading…"}</div>
          </div>
        </div>
        <div className="text-[11px] uppercase tracking-wide font-semibold text-fg-faint px-2.5 pt-2 pb-1.5">
          Bot
        </div>
        <nav className="flex flex-col gap-0.5">
          {TABS.map((t) => {
            const href = `/dashboard/bots/${botId}/${t.href}`;
            const active = pathname === href;
            return (
              <Link
                key={t.href}
                href={href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium ${
                  active ? "bg-accent-soft text-accent-ink" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                <span className={active ? "opacity-100" : "opacity-80"}>{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0">
        <div className="flex justify-end mb-3">
          <ProfileMenu email={email} />
        </div>
        {children}
      </main>
    </div>
  );
}
