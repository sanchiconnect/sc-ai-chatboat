"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
import { resolveWorkspace } from "@/lib/workspace-store";

type ApiKeyRow = Awaited<ReturnType<typeof api.listApiKeys>>[number];

function ApiKeysSection({ workspaceId }: { workspaceId: string }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const load = () => api.listApiKeys(workspaceId).then(setKeys).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.createApiKey(workspaceId, name.trim());
      setFresh(res.key);
      setName("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create key");
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this key? Anything using it stops working immediately.")) return;
    await api.revokeApiKey(workspaceId, id);
    load();
  }

  return (
    <section className="mt-8 bg-surface border border-border rounded-2xl shadow-card p-5 max-w-2xl space-y-3">
      <h2 className="font-display text-[18px] font-semibold">API keys</h2>
      <p className="text-[13px] text-fg">
        An API key is a password for <strong>other software</strong> — not for people. You only need one if you want
        something outside this dashboard to use your assistants.
      </p>
      <ul className="text-[12.5px] text-fg-muted list-disc ml-5 space-y-1">
        <li>Pull your conversations and leads into your own system or spreadsheet.</li>
        <li>Ask your assistant a question from your own app or website backend.</li>
        <li>Connect an AI assistant such as Claude to your workspace.</li>
      </ul>
      <details className="text-[12.5px] text-fg-muted">
        <summary className="cursor-pointer font-medium text-fg">Developer details</summary>
        <p className="mt-2">
          REST: <code>{apiBase}/api/v1/bots</code> &middot; MCP server: <code>{apiBase}/mcp</code>. Send the key as{" "}
          <code>Authorization: Bearer &lt;key&gt;</code>.
        </p>
      </details>
      <p className="text-[12px] text-fg-faint">Not using any of this? You can leave this empty — nothing else depends on it.</p>
      {error && <div className="text-[13px] text-danger bg-danger-soft rounded-lg p-3">{error}</div>}
      {fresh && (
        <div className="text-[13px] bg-warning-soft text-warning rounded-lg p-3 space-y-1" role="status">
          <p className="font-semibold">Copy this key now. It won&apos;t be shown again.</p>
          <code className="block break-all select-all text-fg">{fresh}</code>
          <button type="button" className="text-[12px] font-semibold underline" onClick={() => setFresh(null)}>I&apos;ve saved it</button>
        </div>
      )}
      <form onSubmit={create} className="flex flex-col sm:flex-row gap-2">
        <input
          required maxLength={100} aria-label="Key name" placeholder="Name, e.g. Support dashboard"
          className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
          value={name} onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold">Create key</button>
      </form>
      <ul className="divide-y divide-border text-[13px]">
        {keys.map((k) => (
          <li key={k.key_id} className="py-2 flex items-center justify-between gap-3">
            <div className={k.revoked ? "opacity-50" : ""}>
              <div className="font-medium">{k.name} <span className="font-mono text-fg-faint">{k.prefix}…</span></div>
              <div className="text-[11.5px] text-fg-faint">
                Created {new Date(k.created_at + "Z").toLocaleDateString()} &middot;{" "}
                {k.last_used_at ? `last used ${new Date(k.last_used_at + "Z").toLocaleString()}` : "never used"}
                {k.revoked && " · revoked"}
              </div>
            </div>
            {!k.revoked && (
              <button type="button" onClick={() => revoke(k.key_id)} className="text-danger text-[12.5px] font-semibold">Revoke</button>
            )}
          </li>
        ))}
        {keys.length === 0 && <li className="py-2 text-fg-faint">No keys yet.</li>}
      </ul>
    </section>
  );
}

export default function WorkspaceSettingsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("…");
  const [workspaces, setWorkspaces] = useState<{ workspace_id: string; name: string; role: string }[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((m) => setEmail(m.email)).catch(() => {});
    api.listWorkspaces().then((list) => {
      setWorkspaces(list);
      const ws = resolveWorkspace(list);
      if (!ws) return;
      setWorkspaceId(ws.workspace_id);
      setWorkspaceName(ws.name);
      setNameInput(ws.name);
      setRole(ws.role);
    });
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateWorkspace(workspaceId, nameInput.trim());
      setWorkspaceName(updated.name);
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const canEdit = role === "owner" || role === "admin";

  return (
    <div className="max-w-[1240px] mx-auto grid grid-cols-1 md:grid-cols-[248px_1fr] gap-5 items-start">
      <WorkspaceSidebar
        workspaceName={workspaceName}
        active="/dashboard/workspace-settings"
        workspaces={workspaces}
        currentWorkspaceId={workspaceId ?? undefined}
      />

      <main className="min-w-0">
        <div className="flex justify-between items-center mb-5 gap-4 flex-wrap">
          <div>
            <h1 className="text-[26px] font-semibold font-display">Workspace settings</h1>
            <p className="text-[13px] text-fg-muted mt-0.5">Your role: {role ?? "…"}</p>
          </div>
          <ProfileMenu email={email} />
        </div>

        <form onSubmit={saveName} className="bg-surface border border-border rounded-2xl shadow-card p-5 max-w-lg">
          <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
          {error && <div className="text-[13px] text-danger bg-danger-soft rounded-lg p-3">{error}</div>}
          {notice && <div className="text-[13px] text-success bg-success-soft rounded-lg p-3">{notice}</div>}
          <div>
            <label className="text-[12.5px] font-medium">Workspace name</label>
            <input
              required
              disabled={!canEdit}
              className="mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px] disabled:opacity-60"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            {!canEdit && (
              <p className="text-[11.5px] text-fg-faint mt-1">Only workspace owners/admins can rename it.</p>
            )}
          </div>
          {canEdit && (
            <button
              type="submit"
              disabled={saving}
              className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          </fieldset>
        </form>

        {canEdit && workspaceId && <ApiKeysSection workspaceId={workspaceId} />}
      </main>
    </div>
  );
}
