"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

type Lead = {
  lead_id: string; conversation_id: string; name: string; email: string; phone: string;
  created_at: string; pushed_to_crm: boolean;
};

function toCsv(leads: Lead[]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = leads.map((l) => [l.name, l.email, l.phone, l.created_at].map(escape).join(","));
  return ["Name,Email,Phone,Captured At", ...rows].join("\n");
}

export default function LeadsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);

  useEffect(() => {
    api
      .listLeads(botId)
      .then(setLeads)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load leads"))
      .finally(() => setLoading(false));
    api.getBot(botId).then((bot) => setWebhookUrl(bot.crm_webhook_url)).catch(() => {});
  }, [botId]);

  async function saveWebhook(e: React.FormEvent) {
    e.preventDefault();
    setSavingWebhook(true);
    setError(null);
    try {
      await api.updateBot(botId, { crm_webhook_url: webhookUrl.trim() });
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save webhook");
    } finally {
      setSavingWebhook(false);
    }
  }

  function download() {
    const blob = new Blob([toCsv(leads)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold">Leads</h2>
          <p className="text-sm text-fg-muted">
            Captured when a visitor shares contact info during handoff.
          </p>
        </div>
        <button
          onClick={download}
          disabled={leads.length === 0}
          className="border border-border rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <form onSubmit={saveWebhook} className="border border-border rounded-lg p-4 mb-5 flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <label className="text-sm font-medium">CRM webhook URL</label>
          <p className="text-xs text-fg-muted mb-1">
            Every new lead is POSTed here as JSON — works as the inbound side of Zapier, Make.com, n8n, or most CRMs&apos; own
            webhook/web-to-lead endpoint. Leave blank to disable.
          </p>
          <input
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="https://hooks.zapier.com/hooks/catch/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={savingWebhook}
          className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {savingWebhook ? "Saving…" : webhookSaved ? "Saved!" : "Save"}
        </button>
      </form>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2 mb-4">{error}</div>}
      {loading && <p className="text-sm text-fg-muted">Loading…</p>}
      {!loading && leads.length === 0 && <p className="text-sm text-fg-muted">No leads captured yet.</p>}

      {leads.length > 0 && (
        <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Phone</th>
              <th className="p-2">Captured</th>
              <th className="p-2">CRM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((l) => (
              <tr key={l.lead_id}>
                <td className="p-2">{l.name || "—"}</td>
                <td className="p-2">{l.email || "—"}</td>
                <td className="p-2">{l.phone || "—"}</td>
                <td className="p-2">{new Date(l.created_at).toLocaleString()}</td>
                <td className="p-2">
                  {l.pushed_to_crm ? (
                    <span className="text-success text-xs font-semibold">Pushed</span>
                  ) : (
                    <span className="text-fg-faint text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
