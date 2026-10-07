"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { staffApi, StaffApiError, StaffAuditEntry, StaffSetting } from "@/lib/staff-api";

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<StaffSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [log, setLog] = useState<StaffAuditEntry[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function apply(list: StaffSetting[]) {
    setSettings(list);
    setValues(Object.fromEntries(list.map((s) => [s.key, s.value])));
  }

  useEffect(() => {
    Promise.all([staffApi.getSettings(), staffApi.auditLog(100)])
      .then(([s, l]) => {
        apply(s);
        setLog(l);
      })
      .catch((err) => setError(err instanceof StaffApiError ? err.message : "Failed to load"));
  }, []);

  async function save(key: string) {
    setSavingKey(key);
    setError(null);
    setNotice(null);
    try {
      apply(await staffApi.putSetting(key, values[key]));
      setNotice("Saved.");
      setLog(await staffApi.auditLog(100));
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
        <h1 className="mt-2 text-xl font-bold">Platform settings &amp; activity</h1>
      </div>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}
      {notice && <div className="text-sm bg-surface-2 rounded p-2">{notice}</div>}

      <section className="max-w-xl space-y-5">
        <h2 className="text-base font-bold">Settings</h2>
        {settings.map((s) => (
          <div key={s.key}>
            <label htmlFor={`s-${s.key}`} className="text-[13px] font-medium">
              {s.label} {s.is_default && <span className="text-fg-faint font-normal">(default)</span>}
            </label>
            <p className="text-[11.5px] text-fg-faint">{s.help}</p>
            <div className="mt-1 flex gap-2">
              <input
                id={`s-${s.key}`}
                className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
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
        <h2 className="text-base font-bold">Activity log</h2>
        <p className="text-sm text-fg-muted mb-3">
          Every change made from the super admin areas: who, what, when. Request contents (passwords, keys) are never stored.
        </p>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-2 text-left text-fg-muted">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Who</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at + "Z").toLocaleString()}</td>
                  <td className="px-3 py-2">{r.actor_email || "—"}</td>
                  <td className="px-3 py-2 font-mono">{r.method} {r.path}</td>
                  <td className="px-3 py-2">{r.ip}</td>
                </tr>
              ))}
              {log.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-4 text-fg-faint">Nothing recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
