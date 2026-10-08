"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useLive } from "@/lib/use-live";

type NotificationItem = {
  notification_id: string;
  bot_id: string | null;
  conversation_id: string | null;
  kind: string;
  message: string;
  link?: string;
  read: boolean;
  created_at: string;
};

const POLL_MS = 8_000;

const KIND_LABEL: Record<string, string> = {
  handoff: "Needs a human", team: "Team", lead: "New lead", payment: "Billing",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function load() {
    api
      .listNotifications()
      .then((res) => {
        setItems(res.notifications as NotificationItem[]);
        setUnreadCount(res.unread_count);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
    // Pages ping this after an action so the count changes straight away.
    window.addEventListener("sj:notifications", load);
    return () => window.removeEventListener("sj:notifications", load);
  }, []);

  // Count goes up when something happens and down when it's handled, without a refresh.
  useLive(load, POLL_MS);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function openItem(item: NotificationItem) {
    setOpen(false);
    if (!item.read) {
      await api.markNotificationRead(item.notification_id).catch(() => {});
      setItems((prev) => prev.map((i) => (i.notification_id === item.notification_id ? { ...i, read: true } : i)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    router.push(item.link || (item.bot_id ? `/dashboard/bots/${item.bot_id}/inbox` : "/dashboard"));
  }

  async function markAllRead() {
    await api.markAllNotificationsRead().catch(() => {});
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnreadCount(0);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); load(); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        className="relative w-9 h-9 rounded-full border border-border bg-surface flex items-center justify-center text-fg-muted hover:bg-surface-2 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-danger text-[10px] leading-[17px] text-[color:var(--on-danger)] text-center font-semibold ring-2 ring-[var(--bg)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] bg-surface border border-border rounded-xl shadow-card p-1.5 z-50 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-xs font-semibold text-fg-faint uppercase tracking-wide">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-accent-ink font-medium">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && <p className="text-sm text-fg-muted px-2.5 py-3">Nothing yet.</p>}
          {items.map((item) => (
            <button
              key={item.notification_id}
              onClick={() => openItem(item)}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-sm hover:bg-surface-2 ${
                item.read ? "text-fg-muted" : "text-fg font-medium"
              }`}
            >
              <div className="flex items-start gap-1.5">
                {!item.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-none" />}
                <span className="min-w-0">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-fg-faint">
                    {KIND_LABEL[item.kind] ?? "Update"}
                  </span>
                  <span className="block">{item.message}</span>
                </span>
              </div>
              <span className="text-[11px] text-fg-faint">{new Date(item.created_at + "Z").toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
