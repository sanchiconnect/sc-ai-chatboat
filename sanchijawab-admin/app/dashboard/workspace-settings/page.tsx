"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";

export default function WorkspaceSettingsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("…");
  const [nameInput, setNameInput] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((m) => setEmail(m.email)).catch(() => {});
    api.listWorkspaces().then((list) => {
      const ws = list[0];
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
      <WorkspaceSidebar workspaceName={workspaceName} active="/dashboard/workspace-settings" />

      <main className="min-w-0">
        <div className="flex justify-between items-center mb-5 gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-semibold font-display">Workspace settings</h1>
            <p className="text-[13px] text-fg-muted mt-0.5">Your role: {role ?? "…"}</p>
          </div>
          <ProfileMenu email={email} />
        </div>

        <form onSubmit={saveName} className="bg-surface border border-border rounded-2xl shadow-card p-5 max-w-lg space-y-3">
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
        </form>
      </main>
    </div>
  );
}
