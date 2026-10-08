"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { staffApi, StaffApiError, StaffAuditEntry, StaffSetting } from "@/lib/staff-api";

const PAGE_SIZE = 20;

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<StaffSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [log, setLog] = useState<StaffAuditEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [days, setDays] = useState(30);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function apply(list: StaffSetting[]) {
    setSettings(list);
    setValues(Object.fromEntries(list.map((s) => [s.key, s.value])));
  }

  async function loadFirstPage() {
    const rows = await staffApi.auditLog(PAGE_SIZE, 0);
    setLog(rows);
    setHasMore(rows.length === PAGE_SIZE);
  }

  useEffect(() => {
    Promise.all([staffApi.getSettings(), loadFirstPage()])
      .then(([s]) => apply(s))
      .catch((err) => setError(err instanceof StaffApiError ? err.message : "Failed to load"));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const rows = await staffApi.auditLog(PAGE_SIZE, log.length);
      setLog((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Couldn't load more");
    } finally {
      setLoadingMore(false);
    }
  }

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await staffApi.downloadAuditLog(days);
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function save(key: string) {
    setSavingKey(key);
    setError(null);
    setNotice(null);
    try {
      apply(await staffApi.putSetting(key, values[key]));
      setNotice("Saved.");
      await loadFirstPage();
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Failed to save");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/staff" className="text-[13px] font-semibold text-fg-muted hover:text-fg">&larr; Workspaces</Link>
        <h1 className="mt-2 text-[24px] font-semibold font-display">Platform settings &amp; activity</h1>
      </div>

      {error && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-lg p-3">{error}</div>}
      {notice && <div role="status" className="text-sm text-success bg-success-soft rounded-lg p-3">{notice}</div>}

      <section className="max-w-xl space-y-5">
        <h2 className="font-display text-[18px] font-semibold">Settings</h2>
        {settings.map((s) => (
          <div key={s.key}>
            <label htmlFor={`s-${s.key}`} className="text-[13px] font-medium">
              {s.label} {s.is_default && <span className="text-fg-faint font-normal">(default)</span>}
            </label>
            <p className="text-[11.5px] text-fg-faint">{s.help}</p>
            <div className="mt-1 flex gap-2">
              <input
                id={`s-${s.key}`}
                disabled={savingKey === s.key}
                className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px] disabled:opacity-60"
                value={values[s.key] ?? ""}
                onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
              />
              <button
                onClick={() => save(s.key)}
                disabled={savingKey === s.key || values[s.key] === s.value}
                className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
              >
                {savingKey === s.key ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ))}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-[18px] font-semibold">Activity log</h2>
            <p className="text-sm text-fg-muted max-w-2xl">
              Every change made from the super admin areas: who, what, when. Request contents (passwords, keys) are never stored.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="log-days" className="sr-only">Download range</label>
            <select
              id="log-days" value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
            <button
              onClick={download}
              disabled={downloading}
              className="border border-border bg-surface rounded-lg px-4 py-2 text-[13px] font-semibold hover:bg-surface-2 disabled:opacity-50"
            >
              {downloading ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-border rounded-2xl bg-surface shadow-card">
          <table className="w-full text-[12.5px] min-w-[560px]">
            <thead className="bg-surface-2 text-left text-fg-muted">
              <tr>
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Who</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at + "Z").toLocaleString()}</td>
                  <td className="px-3 py-2">{r.actor_email || "—"}</td>
                  <td className="px-3 py-2 font-mono break-all">{r.method} {r.path}</td>
                  <td className="px-3 py-2">{r.ip}</td>
                </tr>
              ))}
              {log.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-4 text-fg-faint">Nothing recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-3">
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="border border-border bg-surface rounded-lg px-4 py-2 text-[13px] font-semibold hover:bg-surface-2 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
          <span className="text-[12px] text-fg-faint">
            Showing the latest {log.length}{hasMore ? "" : " (that's everything)"}. Use Download CSV for the full history.
          </span>
        </div>
      </section>
    </div>
  );
}
