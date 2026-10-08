"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, type ActionInput, type ActionRow } from "@/lib/api";

const EMPTY: ActionInput = {
  name: "", label: "", description: "", url: "", params: [], requires_confirmation: true, enabled: true,
};

export default function ActionsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [items, setItems] = useState<ActionRow[]>([]);
  const [form, setForm] = useState<ActionInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [log, setLog] = useState<Awaited<ReturnType<typeof api.actionLog>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    api.listActions(botId).then(setItems).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load actions"));
    api.actionLog(botId).then(setLog).catch(() => setLog([]));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  const fail = (e: unknown, fallback: string) => setError(e instanceof ApiError ? e.message : fallback);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        await api.editAction(editingId, form);
        setNotice("Saved.");
      } else {
        const created = await api.createAction(botId, form);
        setSecret(created.secret);
      }
      setForm(EMPTY);
      setEditingId(null);
      load();
    } catch (err) {
      fail(err, "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function test(id: string) {
    setError(null);
    setNotice(null);
    try {
      const r = await api.testAction(id);
      setNotice(r.ok ? `Test call worked. Your server replied: “${r.message || "(no message)"}”` : `Test call failed: ${r.error || "no reply"}`);
      load();
    } catch (err) {
      fail(err, "Test failed");
    }
  }

  async function rotate(id: string) {
    if (!window.confirm("Create a new signing secret? Your server must be updated with it or its checks will fail.")) return;
    try {
      setSecret((await api.rotateActionSecret(id)).secret);
    } catch (err) {
      fail(err, "Failed to rotate");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this action?")) return;
    await api.deleteAction(id);
    load();
  }

  const field = "mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold">Actions</h2>
        <p className="text-sm text-fg-muted">
          Let the assistant do things for visitors by calling your own server, for example book a demo, check an order or create a
          support ticket. When a visitor asks, the assistant collects the details, shows them a card, and only calls your server after
          the visitor presses <strong>Confirm</strong> (you can switch confirmation off for read-only look-ups).
        </p>
      </div>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}
      {notice && <div className="text-sm bg-surface-2 rounded p-2" role="status">{notice}</div>}
      {secret && (
        <div className="text-[13px] bg-warning-soft text-warning rounded-lg p-3 space-y-1" role="status">
          <p className="font-semibold">Copy this signing secret now. It won&apos;t be shown again.</p>
          <code className="block break-all select-all text-fg">{secret}</code>
          <p>
            Every call carries <code>X-SanchiJawab-Timestamp</code> and <code>X-SanchiJawab-Signature</code> = <code>sha256=</code> + HMAC-SHA256 of
            <code> timestamp + &quot;.&quot; + body</code> using this secret. Check it on your server so only we can trigger your action.
          </p>
          <button type="button" className="text-[12px] font-semibold underline" onClick={() => setSecret(null)}>I&apos;ve saved it</button>
        </div>
      )}

      <form onSubmit={save} className="bg-surface border border-border rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">{editingId ? "Edit action" : "Add an action"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="a-name" className="text-[12.5px] font-medium">Name (no spaces)</label>
            <input id="a-name" required placeholder="book_demo" className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="a-label" className="text-[12.5px] font-medium">What the visitor sees</label>
            <input id="a-label" required maxLength={100} placeholder="Book a demo" className={field} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="a-desc" className="text-[12.5px] font-medium">When should the assistant use it?</label>
          <textarea id="a-desc" required className={`${field} h-16`} placeholder="Use when the visitor wants to book a product demo call." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label htmlFor="a-url" className="text-[12.5px] font-medium">Your server address (we send a signed POST here)</label>
          <input id="a-url" required placeholder="https://api.yourshop.com/hooks/book-demo" className={field} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </div>

        <fieldset>
          <legend className="text-[12.5px] font-medium">Details to collect from the visitor</legend>
          {form.params.map((p, i) => (
            <div key={i} className="mt-2 flex flex-wrap gap-2 items-center">
              <input aria-label="Detail name" placeholder="email" className="w-32 border border-border bg-surface-2 rounded-lg px-2 py-1 text-[13px]" value={p.name}
                onChange={(e) => setForm({ ...form, params: form.params.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input aria-label="Detail description" placeholder="Visitor's email address" className="flex-1 min-w-[160px] border border-border bg-surface-2 rounded-lg px-2 py-1 text-[13px]" value={p.description}
                onChange={(e) => setForm({ ...form, params: form.params.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
              <label className="text-[12.5px] flex items-center gap-1">
                <input type="checkbox" checked={p.required} onChange={(e) => setForm({ ...form, params: form.params.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} /> required
              </label>
              <button type="button" className="text-danger text-[12.5px] font-semibold" onClick={() => setForm({ ...form, params: form.params.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          {form.params.length < 8 && (
            <button type="button" className="mt-2 text-[13px] font-semibold text-accent" onClick={() => setForm({ ...form, params: [...form.params, { name: "", description: "", required: true }] })}>
              + Add a detail
            </button>
          )}
        </fieldset>

        <div className="flex flex-wrap gap-4 text-[13px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.requires_confirmation} onChange={(e) => setForm({ ...form, requires_confirmation: e.target.checked })} />
            Ask the visitor to confirm first (keep this on for anything that changes data)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled
          </label>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
            {editingId ? "Save changes" : "Add action"}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-fg-muted">Cancel</button>
          )}
        </div>
      </form>

      <ul className="divide-y divide-border border border-border rounded-2xl bg-surface">
        {items.map((a) => (
          <li key={a.action_id} className="p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-medium">
                {a.label} <span className="font-mono text-fg-faint text-[12px]">{a.name}</span>
                {!a.enabled && <span className="ml-2 text-fg-faint text-[12px]">(disabled)</span>}
              </div>
              <div className="flex gap-3 text-[12.5px] font-semibold flex-none">
                <button type="button" onClick={() => test(a.action_id)}>Send test</button>
                <button type="button" onClick={() => { setEditingId(a.action_id); setForm({ name: a.name, label: a.label, description: a.description, url: a.url, params: a.params, requires_confirmation: a.requires_confirmation, enabled: a.enabled }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                <button type="button" onClick={() => rotate(a.action_id)}>New secret</button>
                <button type="button" className="text-danger" onClick={() => remove(a.action_id)}>Delete</button>
              </div>
            </div>
            <div className="text-[12.5px] text-fg-muted">{a.description}</div>
            <div className="text-[12px] text-fg-faint">
              {a.requires_confirmation ? "Visitor confirms first" : "Runs without confirmation"} &middot; {a.params.length} detail{a.params.length === 1 ? "" : "s"} &middot; {a.url}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="p-4 text-[13px] text-fg-faint">No actions yet.</li>}
      </ul>

      <div>
        <h3 className="text-sm font-semibold mb-2">Recent calls</h3>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-2 text-left text-fg-muted">
              <tr><th className="px-3 py-1.5">When</th><th className="px-3 py-1.5">Action</th><th className="px-3 py-1.5">Result</th><th className="px-3 py-1.5">Confirmed by visitor</th></tr>
            </thead>
            <tbody>
              {log.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5 whitespace-nowrap">{new Date(r.at + "Z").toLocaleString()}</td>
                  <td className="px-3 py-1.5 font-mono">{r.action}</td>
                  <td className="px-3 py-1.5">{r.ok ? `OK (${r.http_status}, ${r.duration_ms} ms)` : `Failed: ${r.error || r.http_status}`}</td>
                  <td className="px-3 py-1.5">{r.confirmed_by_visitor ? "Yes" : "No (read-only or test)"}</td>
                </tr>
              ))}
              {log.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-fg-faint">Nothing yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
